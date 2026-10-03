import { load, LoggerManager, MemoryLogger } from '@asciidoctor/core';
import {
  normalizeSafeDocument,
  plainText,
  type ParsedAsciidocNode,
  type SafeBlock,
  type SafeDiagnostic,
} from '../../packages/asciidoc-typst/typescript/src';
import { blockLayoutOf } from './blockLayout';
import { blocksToPlainText } from './safeText';
import {
  SLIDE_DECK_VERSION,
  type BlockLayout,
  type Slide,
  type SlideDeck,
  type SlideDeckMetadata,
  type SlideLayout,
} from './slideDeck';
import { SLIDE_STYLE_ATTRIBUTE, slideStyleById } from './slideStyles';
import { SLIDE_THEME_ATTRIBUTE, slideThemeById } from './slideThemes';

/**
 * Splits an AsciiDoc document into slides:
 *
 * - `= Title` (with author, `:subtitle:`/`Title: Subtitle`, `:revdate:`) and
 *   any preamble become the title slide.
 * - Every level-1 (`==`) and level-2 (`===`) section is one slide. Deeper
 *   sections stay inside their slide as sub-headings.
 * - `<<<` (page break) continues the section on a new slide with the same title.
 * - `[.section]` / `[.divider]`, or a section with only sub-slides, is a
 *   section-divider slide; `[%notitle]` hides a content slide's title.
 * - `[.notes]` blocks and `[NOTE.speaker]` admonitions become speaker notes.
 *
 * Slide bodies are normalized by the shared SafeDocument pipeline, so every
 * output receives the same allow-listed data.
 */

/** The Asciidoctor node surface this adapter reads, beyond SafeDocument's own. */
interface AsciidocNode extends ParsedAsciidocNode {
  blocks?: AsciidocNode[];
  getRoles?: () => string[];
  title?: string | null;
}

const SLIDE_SECTION_MAX_LEVEL = 2;
const SECTION_ROLES = new Set(['section', 'divider']);

const PARSE_ATTRIBUTES = {
  // stem:[...] uses LaTeX delimiters, matching the PDF writer's MiTeX input.
  stem: 'latexmath',
  'source-highlighter': 'highlight.js',
  icons: 'font',
};

function rolesOf(node: AsciidocNode): string[] {
  return node.getRoles?.() ?? [];
}

function hasOption(node: AsciidocNode, option: string): boolean {
  return node.attributes?.[`${option}-option`] !== undefined;
}

function isSpeakerNotes(node: AsciidocNode): boolean {
  const roles = rolesOf(node);
  return roles.includes('notes') || (node.context === 'admonition' && roles.includes('speaker'));
}

function isSlideSection(node: AsciidocNode): boolean {
  return node.context === 'section' && (node.level ?? 1) <= SLIDE_SECTION_MAX_LEVEL;
}

function lineOf(node: AsciidocNode): number | null {
  return node.sourceLocation?.lineno ?? node.lineno ?? null;
}

interface SlideDraft {
  layout: SlideLayout;
  title: string;
  subtitle: string;
  hideTitle: boolean;
  nodes: AsciidocNode[];
  notes: AsciidocNode[];
  line: number | null;
}

class DeckBuilder {
  readonly slides: Slide[] = [];
  readonly diagnostics: SafeDiagnostic[] = [];

  add(draft: SlideDraft): void {
    const body = this.normalizeBody(draft.nodes);
    const notes = blocksToPlainText(this.normalize(draft.notes.flatMap(notesContent)));
    this.slides.push({
      layout: draft.layout,
      title: draft.title,
      subtitle: draft.subtitle,
      hideTitle: draft.hideTitle,
      blocks: body.map((entry) => entry.block),
      blockLayouts: body.map((entry) => entry.layout),
      notes,
      line: draft.line,
    });
  }

  /** Normalizes each top-level node on its own so its sizing stays paired with its block. */
  private normalizeBody(nodes: AsciidocNode[]): { block: SafeBlock; layout: BlockLayout | null }[] {
    return nodes.flatMap((node) => {
      const layout = blockLayoutOf(rolesOf(node), node.attributes);
      return this.normalize([node]).map((block) => ({ block, layout }));
    });
  }

  private normalize(nodes: AsciidocNode[]): SafeBlock[] {
    if (nodes.length === 0) return [];
    const safe = normalizeSafeDocument({ blocks: nodes.map(prepareNode) }, { title: '', author: '', language: '' });
    this.diagnostics.push(...safe.diagnostics);
    return safe.blocks;
  }
}

function rawSource(node: AsciidocNode): string {
  const source = node.source;
  return typeof source === 'function' ? source.call(node) : (source ?? '');
}

/**
 * SafeDocument reads a quote's text from the block's own source, which is
 * empty for the delimited form (`____` around paragraphs). Present those
 * quotes with their paragraphs' source joined, as the one-paragraph form
 * would have it. Object.create keeps every other Asciidoctor getter.
 */
function prepareNode(node: AsciidocNode): AsciidocNode {
  const children = node.blocks ?? [];
  if ((node.context === 'quote' || node.context === 'verse') && children.length > 0 && !rawSource(node).trim()) {
    const text = children.map(rawSource).filter(Boolean).join(' ');
    return Object.create(node, { source: { value: text }, blocks: { value: [] } });
  }
  if (children.length > 0) node.blocks = children.map(prepareNode);
  return node;
}

/** An admonition note's own text is the note; a `[.notes]` block's children are. */
function notesContent(node: AsciidocNode): AsciidocNode[] {
  // Read the admonition as a plain paragraph so the note carries no "NOTE"
  // label. Object.create keeps Asciidoctor's prototype getters (`source`).
  if (node.context === 'admonition') return [Object.create(node, { context: { value: 'paragraph' } })];
  return node.blocks?.length ? node.blocks : [node];
}

/** Splits a section's direct children into body chunks at `<<<`, pulling speaker notes aside. */
function partitionBody(children: AsciidocNode[]): { chunks: AsciidocNode[][]; notes: AsciidocNode[] } {
  const chunks: AsciidocNode[][] = [[]];
  const notes: AsciidocNode[] = [];
  for (const child of children) {
    if (isSpeakerNotes(child)) notes.push(child);
    else if (child.context === 'page_break') chunks.push([]);
    else chunks[chunks.length - 1].push(child);
  }
  return { chunks: chunks.filter((chunk, index) => index === 0 || chunk.length > 0), notes };
}

function addSectionSlides(builder: DeckBuilder, section: AsciidocNode): void {
  const children = section.blocks ?? [];
  const bodyChildren = children.filter((child) => !isSlideSection(child));
  const subSlides = children.filter(isSlideSection);
  const { chunks, notes } = partitionBody(bodyChildren);
  const title = plainText(section.title ?? '');
  const roles = rolesOf(section);
  const isEmpty = chunks.every((chunk) => chunk.length === 0);
  const layout: SlideLayout =
    roles.some((role) => SECTION_ROLES.has(role)) || (isEmpty && subSlides.length > 0) ? 'section' : 'content';

  chunks.forEach((nodes, index) => {
    builder.add({
      layout,
      title,
      subtitle: '',
      hideTitle: hasOption(section, 'notitle'),
      nodes,
      // Notes belong to the first slide of a split section.
      notes: index === 0 ? notes : [],
      // A continuation slide maps to its own first line so editor and
      // preview can tell the parts of a split section apart.
      line: index === 0 ? lineOf(section) : (lineOf(nodes[0]) ?? lineOf(section)),
    });
  });
  subSlides.forEach((child) => addSectionSlides(builder, child));
}

interface DocumentHeader {
  getDocumentTitle(options: { partition: true }): { main?: string; subtitle?: string } | undefined;
  getAuthor(): string | undefined;
  getAttribute(name: string): unknown;
  hasHeader?: () => boolean;
}

function stringAttribute(doc: DocumentHeader, name: string): string {
  const value = doc.getAttribute(name);
  return typeof value === 'string' ? plainText(value) : '';
}

/**
 * Without a `= Title` header Asciidoctor falls back to the first section's
 * title, which is a slide of its own here, not the deck title.
 */
function documentTitle(doc: DocumentHeader): { main: string; subtitle: string } {
  const title = doc.hasHeader?.() === false ? undefined : doc.getDocumentTitle({ partition: true });
  return { main: plainText(title?.main ?? ''), subtitle: plainText(title?.subtitle ?? '') };
}

function readMetadata(doc: DocumentHeader): SlideDeckMetadata {
  const attribute = (name: string) => stringAttribute(doc, name);
  const title = documentTitle(doc);
  return {
    title: title.main,
    subtitle: title.subtitle || attribute('subtitle'),
    author: plainText(doc.getAuthor() ?? ''),
    date: attribute('revdate') || attribute('date'),
    language: attribute('lang') || 'en',
  };
}

export async function parseSlideDeck(source: string): Promise<SlideDeck> {
  LoggerManager.setLogger(MemoryLogger.create());
  const doc = await load(source, { safe: 'safe', sourcemap: true, attributes: PARSE_ATTRIBUTES });
  const header = doc as unknown as DocumentHeader;
  const root = doc as unknown as AsciidocNode;
  const metadata = readMetadata(header);
  const builder = new DeckBuilder();
  const topLevel = root.blocks ?? [];
  const preamble = topLevel.find((node) => node.context === 'preamble');
  const preambleBody = partitionBody(preamble?.blocks ?? []);
  const looseBody = partitionBody(topLevel.filter((node) => node.context !== 'preamble' && node.context !== 'section'));

  if (metadata.title) {
    builder.add({
      layout: 'title',
      title: metadata.title,
      subtitle: metadata.subtitle,
      hideTitle: false,
      nodes: [...preambleBody.chunks.flat(), ...looseBody.chunks.flat()],
      notes: [...preambleBody.notes, ...looseBody.notes],
      line: 1,
    });
  } else {
    const nodes = [...preambleBody.chunks.flat(), ...looseBody.chunks.flat()];
    if (nodes.length > 0) {
      builder.add({
        layout: 'content',
        title: '',
        subtitle: '',
        hideTitle: true,
        nodes,
        notes: [...preambleBody.notes, ...looseBody.notes],
        line: lineOf(nodes[0]),
      });
    }
  }
  topLevel.filter((node) => node.context === 'section').forEach((section) => addSectionSlides(builder, section));

  return {
    version: SLIDE_DECK_VERSION,
    metadata,
    theme: slideThemeById(header.getAttribute(SLIDE_THEME_ATTRIBUTE)),
    style: slideStyleById(header.getAttribute(SLIDE_STYLE_ATTRIBUTE)),
    slides: builder.slides,
    diagnostics: builder.diagnostics,
  };
}
