import type { SafeBlock, SafeInline, SafeListItem } from '../../packages/asciidoc-typst/typescript/src';
import { dispatchBlock, dispatchInline, type BlockHandlers, type InlineHandlers } from './safeDispatch';
import { inlinesToPlainText } from './safeText';
import type { BlockLayout, SlideVideo } from './slideDeck';
import { slideItems } from './slideItems';
import { ADMONITION_LABELS, isSafeLinkTarget, splitIntoColumns } from './slideRules';
import type { SlideTheme } from './slideThemes';

/**
 * Pure layout for PPTX export: turns slide blocks into positioned frames
 * (native text boxes, code boxes, tables, images) without touching
 * pptxgenjs, so the arithmetic is testable. Units are inches and points.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  highlight?: boolean;
  link?: string;
  muted?: boolean;
  color?: string;
}

export interface Paragraph {
  runs: Run[];
  bullet?: 'bullet' | 'number';
  level: number;
  /** Relative font size (1 = body). */
  scale: number;
  italic?: boolean;
  /** Extra left indent in inches, for quotes and admonitions. */
  indent?: number;
}

export type Frame =
  | { kind: 'text'; box: Box; paragraphs: Paragraph[]; fontSize: number; align: BlockLayout['align'] }
  | { kind: 'code'; box: Box; code: string; fontSize: number; highlights?: number[] }
  | { kind: 'table'; box: Box; rows: Run[][][]; hasHeader: boolean; fontSize: number }
  | { kind: 'image'; box: Box; source: ImageSource; alt: string }
  | { kind: 'missingImage'; box: Box; alt: string }
  | { kind: 'video'; box: Box; video: SlideVideo };

export type ImageSource = { kind: 'file'; relativePath: string } | { kind: 'diagram'; code: string };

/** A block sequence before measuring - consecutive prose shares one text box. */
type Element = (
  | { kind: 'text'; paragraphs: Paragraph[] }
  | { kind: 'code'; code: string }
  | { kind: 'table'; rows: Run[][][]; hasHeader: boolean }
  | { kind: 'image'; source: ImageSource | null; alt: string }
  | { kind: 'columns'; columns: Element[][] }
  | { kind: 'video'; video: SlideVideo }
) & { layout?: BlockLayout };

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  superscript?: boolean;
  subscript?: boolean;
  highlight?: boolean;
  link?: string;
  muted?: boolean;
}

const styled =
  (patch: RunStyle) =>
  (inline: { children: SafeInline[] }, style: RunStyle): Run[] =>
    inlineRuns(inline.children, { ...style, ...patch });
const noteRun = (inline: { children: SafeInline[] }, style: RunStyle): Run[] => [
  { text: ` (${inlinesToPlainText(inline.children)})`, ...style, muted: true },
];

const INLINE_RUNS: InlineHandlers<Run[], RunStyle> = {
  text: (inline, style) => [{ text: inline.value.replace(/\s*\n\s*/g, ' '), ...style }],
  code: (inline, style) => [{ text: inline.value, code: true, ...style }],
  math: (inline, style) => [{ text: inline.tex, italic: true, ...style }],
  strong: styled({ bold: true }),
  emphasis: styled({ italic: true }),
  superscript: styled({ superscript: true }),
  subscript: styled({ subscript: true }),
  mark: styled({ highlight: true }),
  link: (inline, style) => {
    const link = isSafeLinkTarget(inline.target) ? inline.target : undefined;
    const children = inline.children.length ? inline.children : [{ type: 'text' as const, value: inline.target }];
    return inlineRuns(children, { ...style, link });
  },
  footnote: noteRun,
  endnote: noteRun,
  inlineImage: (inline, style) => [{ text: inline.alt, ...style }],
  citation: (inline, style) => [{ text: `[${inline.key}]`, ...style }],
};

export function inlineRuns(inlines: SafeInline[], style: RunStyle = {}): Run[] {
  return inlines.flatMap((inline) => dispatchInline(INLINE_RUNS, inline, style));
}

function listParagraphs(ordered: boolean, items: SafeListItem[], level: number, out: Element[]): void {
  for (const item of items) {
    const prefix = item.checked === true ? '☑ ' : item.checked === false ? '☐ ' : '';
    pushParagraph(out, {
      runs: [...(prefix ? [{ text: prefix }] : []), ...inlineRuns(item.inlines)],
      bullet: ordered ? 'number' : 'bullet',
      level,
      scale: level > 0 ? 0.9 : 1,
    });
    toElements(item.blocks, out, level + 1);
  }
}

function pushParagraph(out: Element[], paragraph: Paragraph): void {
  const last = out[out.length - 1];
  // Prose merges into one text box, but never into a block with its own sizing.
  if (last?.kind === 'text' && !last.layout) last.paragraphs.push(paragraph);
  else out.push({ kind: 'text', paragraphs: [paragraph] });
}

interface ElementContext {
  out: Element[];
  level: number;
}

const paragraphOf = (runs: Run[], level: number, extra: Partial<Paragraph> = {}): Paragraph => ({
  runs,
  level,
  scale: 1,
  ...extra,
});

const pushCaption = (caption: string | null | undefined, { out, level }: ElementContext) => {
  if (caption) pushParagraph(out, paragraphOf([{ text: caption, bold: true, muted: true }], level, { scale: 0.75 }));
};

const titledContainer = (block: { title: string | null; blocks: SafeBlock[] }, context: ElementContext) => {
  if (block.title) pushParagraph(context.out, paragraphOf([{ text: block.title, bold: true }], context.level));
  toElements(block.blocks, context.out, context.level);
};

const skip = () => undefined;

/** Mirrors slide_writer.rs's block mapping so PPTX and PDF agree. */
const BLOCK_ELEMENTS: BlockHandlers<void, ElementContext> = {
  paragraph: (block, { out, level }) => pushParagraph(out, paragraphOf(inlineRuns(block.inlines), level)),
  section: (block, { out, level }) => {
    pushParagraph(out, paragraphOf([{ text: block.title, bold: true }], level, { scale: 1.1 }));
    toElements(block.blocks, out, level);
  },
  container: titledContainer,
  formal: titledContainer,
  documentPart: titledContainer,
  columns: (block, { out }) => {
    out.push({
      kind: 'columns',
      columns: splitIntoColumns(block.blocks, block.count).map((group) => toElements(group)),
    });
  },
  list: (block, { out, level }) => listParagraphs(block.ordered, block.items, level, out),
  descriptionList: (block, { out, level }) => {
    for (const item of block.items) {
      const runs = [
        ...inlineRuns(item.termInlines, { bold: true }),
        { text: '  ' },
        ...inlineRuns(item.descriptionInlines),
      ];
      pushParagraph(out, paragraphOf(runs, level));
      toElements(item.descriptionBlocks, out, level + 1);
    }
  },
  quote: (block, { out, level }) => {
    pushParagraph(out, paragraphOf(inlineRuns(block.inlines, { italic: true }), level, { indent: 0.3 }));
    const source = [block.attribution, block.citation].filter(Boolean).join(', ');
    if (source)
      pushParagraph(out, paragraphOf([{ text: `— ${source}`, muted: true }], level, { scale: 0.8, indent: 0.3 }));
  },
  admonition: (block, { out, level }) => {
    const label: Run = { text: `${ADMONITION_LABELS[block.kind]}  `, bold: true, color: 'accent' };
    pushParagraph(out, paragraphOf([label, ...inlineRuns(block.inlines)], level, { indent: 0.15 }));
  },
  mathBlock: (block, { out, level }) =>
    pushParagraph(out, paragraphOf([{ text: block.tex, italic: true }], level, { indent: 0.3 })),
  code: (block, context) => {
    pushCaption(block.caption, context);
    context.out.push({ kind: 'code', code: block.code });
  },
  diagram: (block, { out }) => {
    out.push({ kind: 'image', source: { kind: 'diagram', code: block.code }, alt: 'diagram' });
  },
  image: (block, { out, level }) => {
    const source: ImageSource | null =
      block.asset.kind === 'document-relative' ? { kind: 'file', relativePath: block.asset.relativePath } : null;
    out.push({ kind: 'image', source, alt: block.alt });
    if (block.caption) pushParagraph(out, paragraphOf([{ text: block.caption, muted: true }], level, { scale: 0.7 }));
  },
  table: (block, context) => {
    pushCaption(block.caption, context);
    const rows = block.rows.map((row) => row.map((cell) => inlineRuns(cell.inlines)));
    context.out.push({ kind: 'table', rows, hasHeader: block.hasHeader });
  },
  thematicBreak: skip,
  pageBreak: skip,
};

export function toElements(blocks: SafeBlock[], out: Element[] = [], level = 0): Element[] {
  for (const block of blocks) dispatchBlock(BLOCK_ELEMENTS, block, { out, level });
  return out;
}

const LINE_HEIGHT = 1.25;
const GAP = 0.15;
const MIN_FONT_SCALE = 0.45;

function pointsToInches(points: number): number {
  return points / 72;
}

/** Rough line count for text at `fontSize` in a box `width` wide (CJK-aware). */
function estimateLines(text: string, fontSize: number, width: number): number {
  const units = [...text].reduce((sum, char) => sum + (char.charCodeAt(0) > 0x2e80 ? 1 : 0.55), 0);
  const perLine = Math.max(1, width / pointsToInches(fontSize));
  return Math.max(1, Math.ceil(units / perLine));
}

function paragraphText(paragraph: Paragraph): string {
  return paragraph.runs.map((run) => run.text).join('');
}

/** Natural height of an element at `fontScale`, in inches. */
/** Width and font scale of an element after its author-set sizing. */
function sized(element: Element, width: number, fontScale: number): { width: number; fontScale: number } {
  return { width: width * (element.layout?.width ?? 1), fontScale: fontScale * (element.layout?.scale ?? 1) };
}

function measure(element: Element, boxWidth: number, theme: SlideTheme, baseScale: number): number {
  const { width, fontScale } = sized(element, boxWidth, baseScale);
  switch (element.kind) {
    case 'text':
      return element.paragraphs.reduce((sum, paragraph) => {
        const size = theme.bodySize * fontScale * paragraph.scale;
        const indent = paragraph.level * 0.4 + (paragraph.indent ?? 0) + (paragraph.bullet ? 0.35 : 0);
        const lines = estimateLines(paragraphText(paragraph), size, width - indent);
        return sum + lines * pointsToInches(size * LINE_HEIGHT) + pointsToInches(size * 0.45);
      }, 0.1);
    case 'code': {
      const lines = element.code.split('\n').length;
      return lines * pointsToInches(theme.codeSize * fontScale * 1.3) + 0.3;
    }
    case 'table': {
      const size = theme.bodySize * 0.8 * fontScale;
      const columns = Math.max(1, ...element.rows.map((row) => row.length));
      return element.rows.reduce((sum, row) => {
        const tallest = Math.max(
          1,
          ...row.map((cell) => estimateLines(cell.map((run) => run.text).join(''), size, width / columns - 0.15)),
        );
        return sum + tallest * pointsToInches(size * LINE_HEIGHT) + 0.14;
      }, 0);
    }
    case 'image':
    case 'video':
      return 3.6 * Math.max(fontScale, 0.6);
    case 'columns': {
      const columnWidth = (width - GAP * 2 * (element.columns.length - 1)) / element.columns.length;
      return Math.max(0, ...element.columns.map((column) => stackHeight(column, columnWidth, theme, fontScale)));
    }
  }
}

function stackHeight(elements: Element[], width: number, theme: SlideTheme, fontScale: number): number {
  if (elements.length === 0) return 0;
  return (
    elements.reduce((sum, element) => sum + measure(element, width, theme, fontScale), 0) + GAP * (elements.length - 1)
  );
}

function codeHighlightsOf(element: Element) {
  return element.layout?.codeHighlights;
}

function frameFor(element: Element, box: Box, theme: SlideTheme, fontScale: number, frames: Frame[]): void {
  switch (element.kind) {
    case 'text':
      frames.push({
        kind: 'text',
        box,
        paragraphs: element.paragraphs,
        fontSize: theme.bodySize * fontScale,
        align: element.layout?.align ?? null,
      });
      break;
    case 'code':
      frames.push({
        kind: 'code',
        box,
        code: element.code,
        fontSize: theme.codeSize * fontScale,
        highlights: codeHighlightsOf(element),
      });
      break;
    case 'table':
      frames.push({
        kind: 'table',
        box,
        rows: element.rows,
        hasHeader: element.hasHeader,
        fontSize: theme.bodySize * 0.8 * fontScale,
      });
      break;
    case 'image':
      frames.push(
        element.source
          ? { kind: 'image', box, source: element.source, alt: element.alt }
          : { kind: 'missingImage', box, alt: element.alt },
      );
      break;
    case 'video':
      frames.push({ kind: 'video', box, video: element.video });
      break;
    case 'columns': {
      const count = element.columns.length;
      const width = (box.w - GAP * 2 * (count - 1)) / count;
      element.columns.forEach((column, index) => {
        place(column, { x: box.x + index * (width + GAP * 2), y: box.y, w: width, h: box.h }, theme, fontScale, frames);
      });
    }
  }
}

/** Horizontal position of a narrowed element inside the body. */
function alignedX(box: Box, width: number, align: BlockLayout['align'] | undefined): number {
  if (align === 'center') return box.x + (box.w - width) / 2;
  if (align === 'right') return box.x + box.w - width;
  return box.x;
}

function place(elements: Element[], box: Box, theme: SlideTheme, baseScale: number, frames: Frame[]): void {
  let y = box.y;
  const natural = elements.map((element) => measure(element, box.w, theme, baseScale));
  const total = natural.reduce((a, b) => a + b, 0) + GAP * Math.max(0, elements.length - 1);
  // Leftover vertical space goes to images, so a lone image fills the body.
  const isMedia = (element: Element) => element.kind === 'image' || element.kind === 'video';
  const imageCount = elements.filter(isMedia).length;
  const spare = Math.max(0, box.h - total);
  elements.forEach((element, index) => {
    const extra = isMedia(element) && imageCount > 0 ? spare / imageCount : 0;
    const { width, fontScale } = sized(element, box.w, baseScale);
    const frameBox = {
      x: alignedX(box, width, element.layout?.align),
      y,
      w: width,
      h: Math.max(0.3, natural[index] + extra),
    };
    frameFor(element, frameBox, theme, fontScale, frames);
    y += frameBox.h + GAP;
  });
}

/**
 * Lays blocks out top-to-bottom inside `box`, shrinking every font by the
 * same factor when the natural height would overflow - the PPTX
 * counterpart of the PDF writer's `fit-body`.
 */
export function layoutBlocks(
  blocks: SafeBlock[],
  box: Box,
  theme: SlideTheme,
  layouts: (BlockLayout | null)[] = [],
  videos: SlideVideo[] = [],
): Frame[] {
  const elements: Element[] = [];
  slideItems({ blocks, blockLayouts: layouts, videos }).forEach((item) => {
    if (item.kind === 'video') {
      elements.push({ kind: 'video', video: item.video, layout: item.video.layout ?? undefined });
      return;
    }
    if (!item.layout) {
      toElements([item.block], elements);
      return;
    }
    // A sized block gets its own elements, tagged so nothing merges into them.
    const layout = item.layout;
    toElements([item.block]).forEach((element) => elements.push({ ...element, layout }));
  });
  let fontScale = 1;
  for (let attempt = 0; attempt < 12 && fontScale > MIN_FONT_SCALE; attempt += 1) {
    if (stackHeight(elements, box.w, theme, fontScale) <= box.h) break;
    fontScale = Math.max(MIN_FONT_SCALE, fontScale * 0.9);
  }
  const frames: Frame[] = [];
  place(elements, box, theme, fontScale, frames);
  return frames;
}
