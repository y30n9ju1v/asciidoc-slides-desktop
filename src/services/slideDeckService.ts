import { load, LoggerManager, MemoryLogger } from '@asciidoctor/core';
import {
  normalizeSafeDocument,
  plainText,
  resolveSafeAssetRef,
  type ParsedAsciidocNode,
  type SafeBlock,
  type SafeDiagnostic,
} from '../../packages/asciidoc-typst/typescript/src';
import { blockLayoutOf } from './blockLayout';
import { resolveSlideChrome, type ChromeSettings } from './slideChrome';
import { parseVideoNode, placeVideo } from './slideVideo';
import { blocksToPlainText } from './safeText';
import {
  SLIDE_DECK_VERSION,
  type BlockLayout,
  type Slide,
  type SlideDeck,
  type SlideDeckMetadata,
  type SlideLayout,
  type SlideVideo,
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
  chrome?: ChromeSettings;
  backgroundImage?: unknown;
  layout: SlideLayout;
  title: string;
  subtitle: string;
  hideTitle: boolean;
  nodes: AsciidocNode[];
  notes: AsciidocNode[];
  line: number | null;
}

class DeckBuilder {
  constructor(private readonly chrome: ChromeSettings = {}) {}
  readonly slides: Slide[] = [];
  readonly diagnostics: SafeDiagnostic[] = [];

  add(draft: SlideDraft): void {
    const background = typeof draft.backgroundImage === 'string' ? resolveSafeAssetRef(draft.backgroundImage) : null;
    if (draft.backgroundImage && background?.kind !== 'document-relative')
      this.diagnostics.push({
        severity: 'error',
        message: 'Background image must be a safe document-relative path.',
        location: { line: draft.line },
        code: 'unsafe-asset-target',
      });
    const body = this.normalizeBody(draft.nodes);
    const notes = blocksToPlainText(this.normalize(draft.notes.flatMap(notesContent)));
    this.slides.push({
      chrome: resolveSlideChrome(this.chrome, draft.chrome ?? {}, draft.layout, this.slides.length),
      backgroundImage: background?.kind === 'document-relative' ? background.relativePath : undefined,
      layout: draft.layout,
      title: draft.title,
      subtitle: draft.subtitle,
      hideTitle: draft.hideTitle,
      blocks: body.blocks.map((entry) => entry.block),
      blockLayouts: body.blocks.map((entry) => entry.layout),
      videos: body.videos,
      notes,
      line: draft.line,
    });
  }

  /**
   * Normalizes each top-level node on its own so its sizing stays paired with
   * its block. `video::` nodes, which SafeDocument does not model, become
   * slide videos positioned among those blocks.
   */
  private normalizeBody(nodes: AsciidocNode[]) {
    const blocks: { block: SafeBlock; layout: BlockLayout | null }[] = [];
    const videos: SlideVideo[] = [];
    for (const node of nodes) {
      const layout = blockLayoutOf(rolesOf(node), node.attributes);
      if (node.context === 'video') {
        const parsed = parseVideoNode(node);
        if ('diagnostic' in parsed) this.diagnostics.push(parsed.diagnostic);
        else {
          videos.push(placeVideo(parsed.video, blocks.length, layout));
          this.diagnostics.push(...parsed.diagnostics);
        }
        continue;
      }
      this.normalize([node]).forEach((block) => blocks.push({ block, layout }));
    }
    return { blocks, videos };
  }

  private normalize(nodes: AsciidocNode[]): SafeBlock[] {
    if (nodes.length === 0) return [];
    const prepared = nodes.map((node) => prepareNode(node, this.diagnostics));
    const safe = normalizeSafeDocument({ blocks: prepared }, { title: '', author: '', language: '' });
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
function prepareNode(node: AsciidocNode, diagnostics: SafeDiagnostic[]): AsciidocNode {
  if (node.context === 'dlist') return prepareDescriptionList(node, diagnostics);
  const children = (node.blocks ?? [])
    .filter((child) => keepNested(child, diagnostics))
    .map((child) => prepareNode(child, diagnostics));
  if ((node.context === 'quote' || node.context === 'verse') && children.length > 0 && !rawSource(node).trim()) {
    const text = children.map(rawSource).filter(Boolean).join(' ');
    return Object.create(node, { source: { value: text }, blocks: { value: [] } });
  }
  if (children.length > 0) {
    node.blocks = children;
  } else if (node.blocks?.length) {
    return Object.create(node, { blocks: { value: [] } });
  }
  return node;
}

function prepareDescriptionList(node: AsciidocNode, diagnostics: SafeDiagnostic[]): AsciidocNode {
  const items = (node.items ?? []).map(([terms, description]) => [
    terms.map((term) => prepareNode(term, diagnostics)),
    prepareNode(description, diagnostics),
  ]);
  return Object.create(node, { items: { value: items } });
}

/** Videos play only when placed directly on a slide; nested ones are reported, not silently dropped. */
function keepNested(child: AsciidocNode, diagnostics: SafeDiagnostic[]): boolean {
  if (child.context !== 'video') return true;
  diagnostics.push({
    code: 'unsupported-block',
    severity: 'warning',
    message: 'Place videos directly on a slide, not inside columns, lists, or other blocks.',
    location: { line: lineOf(child) },
  });
  return false;
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
  const regularLayout: SlideLayout =
    roles.some((role) => SECTION_ROLES.has(role)) || (isEmpty && subSlides.length > 0) ? 'section' : 'content';
  const layout = roles.includes('closing') ? 'closing' : regularLayout;

  chunks.forEach((nodes, index) => {
    builder.add({
      backgroundImage: section.attributes?.['background-image'],
      chrome: {
        header: section.attributes?.['slide-header'],
        footer: section.attributes?.['slide-footer'],
        numbers: section.attributes?.['slide-page-numbers'],
      },
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
  const builder = new DeckBuilder({
    header: header.getAttribute('slide-header'),
    footer: header.getAttribute('slide-footer'),
    numbers: header.getAttribute('slide-page-numbers'),
    titleNumber: header.getAttribute('slide-title-page-number'),
    start: header.getAttribute('slide-number-start'),
  });
  const topLevel = root.blocks ?? [];
  const preamble = topLevel.find((node) => node.context === 'preamble');
  const preambleBody = partitionBody(preamble?.blocks ?? []);
  const looseBody = partitionBody(topLevel.filter((node) => node.context !== 'preamble' && node.context !== 'section'));

  if (metadata.title) {
    builder.add({
      layout: 'title',
      backgroundImage: header.getAttribute('slide-background'),
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
    fontFamily: String(header.getAttribute('slide-font') ?? '').trim() || undefined,
    slides: builder.slides,
    diagnostics: builder.diagnostics,
  };
}
