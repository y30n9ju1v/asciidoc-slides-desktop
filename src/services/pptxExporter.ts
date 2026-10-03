import type PptxGenJS from 'pptxgenjs';
import { layoutBlocks, type Box, type Frame, type Paragraph, type Run } from './pptxLayout';
import { blobToDataUrl, imageSize, loadImage, svgToPngDataUrl } from './imageStore';
import { renderMermaidSvg } from './mermaidRenderer';
import { SLIDE_HEIGHT_IN, SLIDE_WIDTH_IN, type Slide, type SlideDeck } from './slideDeck';
import type { SlideStyle } from './slideStyles';
import type { SlideTheme } from './slideThemes';

/**
 * Builds a native, editable PowerPoint file: real text boxes with bullet
 * paragraphs, real tables, embedded images, and speaker notes - not slide
 * screenshots. Layout positions come from pptxLayout.ts.
 */

type PptxSlide = PptxGenJS.Slide;
type TextProps = PptxGenJS.TextProps;

const FONT_FACES = { sans: 'Noto Sans KR', serif: 'Noto Serif KR' } as const;
const MONO_FACE = 'Consolas';
const MARGIN_X = 0.6;
const CONTENT_W = SLIDE_WIDTH_IN - MARGIN_X * 2;

function hex(color: string): string {
  return color.replace('#', '').toUpperCase();
}

interface LoadedImage {
  data: string;
  width: number;
  height: number;
}

interface ExportContext {
  theme: SlideTheme;
  style: SlideStyle;
  fontFace: string;
  images: Map<string, LoadedImage | null>;
}

function runProps(run: Run, theme: SlideTheme): TextProps['options'] {
  return {
    bold: run.bold,
    italic: run.italic,
    superscript: run.superscript,
    subscript: run.subscript,
    highlight: run.highlight ? 'FFF3A3' : undefined,
    fontFace: run.code ? MONO_FACE : undefined,
    color: run.muted ? hex(theme.muted) : run.color === 'accent' ? hex(theme.accent) : undefined,
    hyperlink: run.link ? { url: run.link } : undefined,
  };
}

/** Paragraph options belong on the first run only - pptxgenjs starts a new paragraph at every `bullet`. */
function paragraphRuns(paragraph: Paragraph, baseSize: number, theme: SlideTheme): TextProps[] {
  const runs = paragraph.runs.length ? paragraph.runs : [{ text: '' }];
  const fontSize = Math.max(8, Math.round(baseSize * paragraph.scale * 10) / 10);
  return runs.map((run, index) => {
    const options: TextProps['options'] = { ...runProps(run, theme), fontSize };
    if (paragraph.italic) options.italic = true;
    if (index === 0) {
      options.bullet = paragraph.bullet ? (paragraph.bullet === 'number' ? { type: 'number' } : true) : false;
      options.indentLevel = paragraph.level;
      options.paraSpaceAfter = Math.round(fontSize * 0.45);
      if (paragraph.indent) options.margin = [0, 0, 0, Math.round(paragraph.indent * 72)];
    }
    if (index === runs.length - 1) options.breakLine = true;
    return { text: run.text, options };
  });
}

function addTextFrame(slide: PptxSlide, frame: Extract<Frame, { kind: 'text' }>, context: ExportContext): void {
  const { theme } = context;
  slide.addText(
    frame.paragraphs.flatMap((paragraph) => paragraphRuns(paragraph, frame.fontSize, theme)),
    {
      ...frame.box,
      align: frame.align ?? undefined,
      fontFace: context.fontFace,
      fontSize: frame.fontSize,
      color: hex(theme.text),
      valign: 'top',
      margin: 0,
      fit: 'shrink',
      lineSpacingMultiple: 1.1,
    },
  );
}

function addCodeFrame(slide: PptxSlide, frame: Extract<Frame, { kind: 'code' }>, theme: SlideTheme): void {
  slide.addText(frame.code, {
    ...frame.box,
    fontFace: MONO_FACE,
    fontSize: Math.max(7, frame.fontSize),
    color: hex(theme.codeText),
    fill: { color: hex(theme.codeBackground) },
    valign: 'top',
    margin: 10,
    rectRadius: 0.08,
    shape: 'roundRect' as PptxGenJS.ShapeType,
    fit: 'shrink',
  });
}

function addTableFrame(slide: PptxSlide, frame: Extract<Frame, { kind: 'table' }>, context: ExportContext): void {
  const { theme } = context;
  const columns = Math.max(1, ...frame.rows.map((row) => row.length));
  const rows: PptxGenJS.TableRow[] = frame.rows.map((row, rowIndex) => {
    const header = frame.hasHeader && rowIndex === 0;
    return Array.from({ length: columns }, (_, column) => {
      const runs = row[column] ?? [];
      return {
        text: runs.map((run) => ({ text: run.text, options: runProps(run, theme) })),
        options: header
          ? { bold: true, fill: { color: hex(theme.tableHeaderBackground) }, color: hex(theme.tableHeaderText) }
          : {},
      };
    });
  });
  slide.addTable(rows, {
    x: frame.box.x,
    y: frame.box.y,
    w: frame.box.w,
    colW: Array.from({ length: columns }, () => frame.box.w / columns),
    fontFace: context.fontFace,
    fontSize: Math.max(8, Math.round(frame.fontSize)),
    color: hex(theme.text),
    border: { type: 'solid', pt: 0.75, color: hex(theme.tableBorder) },
    margin: 0.06,
    valign: 'middle',
  });
}

/** Letterboxes an image inside its frame, centered. */
function containBox(box: Box, width: number, height: number): Box {
  const scale = Math.min(box.w / width, box.h / height);
  const w = width * scale;
  const h = height * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function addMissingImage(slide: PptxSlide, box: Box, alt: string, context: ExportContext): void {
  const { theme } = context;
  slide.addText(`Image not found: ${alt}`, {
    ...box,
    fontFace: context.fontFace,
    fontSize: 14,
    color: hex(theme.muted),
    align: 'center',
    valign: 'middle',
    line: { color: hex(theme.tableBorder), width: 1, dashType: 'dash' },
  });
}

function imageKey(frame: Extract<Frame, { kind: 'image' }>): string {
  return frame.source.kind === 'file' ? `file:${frame.source.relativePath}` : `diagram:${frame.source.code}`;
}

function addFrame(slide: PptxSlide, frame: Frame, context: ExportContext): void {
  switch (frame.kind) {
    case 'text':
      return addTextFrame(slide, frame, context);
    case 'code':
      return addCodeFrame(slide, frame, context.theme);
    case 'table':
      return addTableFrame(slide, frame, context);
    case 'missingImage':
      return addMissingImage(slide, frame.box, frame.alt, context);
    case 'image': {
      const image = context.images.get(imageKey(frame));
      if (!image) return addMissingImage(slide, frame.box, frame.alt, context);
      slide.addImage({ data: image.data, altText: frame.alt, ...containBox(frame.box, image.width, image.height) });
    }
  }
}

function addSlideNumber(slide: PptxSlide, color: string): void {
  slide.slideNumber = {
    x: SLIDE_WIDTH_IN - 1.0,
    y: SLIDE_HEIGHT_IN - 0.5,
    w: 0.6,
    h: 0.3,
    fontSize: 11,
    color: hex(color),
    align: 'right',
  };
}

/**
 * Colors for title and section slides: filled with the hero color, or
 * plain with accent-colored titles (SlideStyle.heroFill).
 */
function heroContext(context: ExportContext): {
  context: ExportContext;
  background: string;
  title: string;
  bar: string;
} {
  const { theme, style } = context;
  if (!style.heroFill) {
    return { context, background: theme.background, title: theme.accent, bar: theme.accent };
  }
  const heroTheme = { ...theme, text: theme.heroText, muted: theme.heroText, accent: theme.heroText };
  return {
    context: { ...context, theme: heroTheme },
    background: theme.heroBackground,
    title: theme.heroText,
    bar: theme.heroText,
  };
}

const HERO_X = 0.9;
const HERO_W = SLIDE_WIDTH_IN - HERO_X * 2;

function addAccentBar(slide: PptxSlide, y: number, color: string, align: SlideStyle['heroAlign']): void {
  const w = 1.2;
  const x = align === 'center' ? (SLIDE_WIDTH_IN - w) / 2 : HERO_X;
  slide.addShape('rect' as PptxGenJS.ShapeType, {
    x,
    y,
    w,
    h: 0.07,
    fill: { color: hex(color) },
    line: { type: 'none' },
  });
}

function addHeroBody(slide: PptxSlide, data: Slide, box: Box, hero: ExportContext): void {
  layoutBlocks(data.blocks, box, hero.theme, data.blockLayouts).forEach((frame) =>
    addFrame(
      slide,
      frame.kind === 'text' && hero.style.heroAlign === 'center' ? { ...frame, align: 'center' } : frame,
      hero,
    ),
  );
}

function addTitleSlide(slide: PptxSlide, deck: SlideDeck, data: Slide, context: ExportContext): void {
  const { theme, style } = context;
  const hero = heroContext(context);
  slide.background = { color: hex(hero.background) };
  const lines: TextProps[] = [
    {
      text: data.title,
      options: { fontSize: theme.titleSize * 1.4, bold: true, breakLine: true, color: hex(hero.title) },
    },
  ];
  if (data.subtitle) {
    lines.push({
      text: data.subtitle,
      options: { fontSize: theme.bodySize * 1.2, breakLine: true, paraSpaceBefore: 6 },
    });
  }
  const byline = [deck.metadata.author, deck.metadata.date].filter(Boolean).join('  ·  ');
  if (byline) lines.push({ text: byline, options: { fontSize: theme.bodySize * 0.8, paraSpaceBefore: 18 } });
  const hasBody = data.blocks.length > 0;
  const textBox = { x: HERO_X, y: hasBody ? 1.2 : 0.8, w: HERO_W, h: hasBody ? 3.0 : SLIDE_HEIGHT_IN - 1.6 };
  if (!style.heroFill) addAccentBar(slide, hasBody ? 1.0 : 2.3, hero.bar, style.heroAlign);
  slide.addText(lines, {
    ...textBox,
    fontFace: context.fontFace,
    color: hex(hero.context.theme.text),
    align: style.heroAlign,
    valign: hasBody ? 'bottom' : 'middle',
    margin: 0,
    fit: 'shrink',
  });
  if (hasBody) {
    const bodyContext = { ...hero.context, theme: { ...hero.context.theme, bodySize: theme.bodySize * 0.85 } };
    addHeroBody(slide, data, { x: HERO_X, y: 4.4, w: HERO_W, h: 2.4 }, bodyContext);
  }
}

function addSectionSlide(slide: PptxSlide, data: Slide, context: ExportContext): void {
  const { theme, style } = context;
  const hero = heroContext(context);
  slide.background = { color: hex(hero.background) };
  const hasBody = data.blocks.length > 0;
  const titleY = hasBody ? 1.6 : 2.9;
  addAccentBar(slide, titleY - 0.2, hero.bar, style.heroAlign);
  slide.addText(data.title, {
    x: HERO_X,
    y: titleY,
    w: HERO_W,
    h: 1.2,
    fontFace: context.fontFace,
    fontSize: theme.titleSize * 1.25,
    bold: true,
    color: hex(hero.title),
    align: style.heroAlign,
    valign: 'top',
    margin: 0,
    fit: 'shrink',
  });
  if (hasBody) {
    addHeroBody(
      slide,
      data,
      { x: HERO_X, y: titleY + 1.4, w: HERO_W, h: SLIDE_HEIGHT_IN - titleY - 2.0 },
      hero.context,
    );
  }
  addSlideNumber(slide, hero.context.theme.muted);
}

/** Adds the content-slide title with the style's decoration; returns where the body starts. */
function addContentTitle(slide: PptxSlide, title: string, context: ExportContext): number {
  const { theme, style } = context;
  const band = style.titleDecoration === 'band';
  if (band) {
    slide.addShape('rect' as PptxGenJS.ShapeType, {
      x: 0,
      y: 0,
      w: SLIDE_WIDTH_IN,
      h: 1.25,
      fill: { color: hex(theme.heroBackground) },
      line: { type: 'none' },
    });
  }
  slide.addText(title, {
    x: MARGIN_X,
    y: band ? 0.25 : 0.4,
    w: CONTENT_W,
    h: 0.75,
    fontFace: context.fontFace,
    fontSize: theme.titleSize,
    bold: true,
    color: hex(band ? theme.heroText : theme.accent),
    valign: band ? 'middle' : 'top',
    margin: 0,
    fit: 'shrink',
  });
  if (style.titleDecoration === 'underline') {
    slide.addShape('rect' as PptxGenJS.ShapeType, {
      x: MARGIN_X,
      y: 1.2,
      w: 1.0,
      h: 0.055,
      fill: { color: hex(theme.accent) },
      line: { type: 'none' },
    });
  }
  return band ? 1.55 : style.titleDecoration === 'underline' ? 1.5 : 1.4;
}

function addContentSlide(slide: PptxSlide, data: Slide, context: ExportContext): void {
  const { theme } = context;
  slide.background = { color: hex(theme.background) };
  const showTitle = !data.hideTitle && data.title.length > 0;
  const top = showTitle ? addContentTitle(slide, data.title, context) : 0.45;
  const body: Box = { x: MARGIN_X, y: top, w: CONTENT_W, h: SLIDE_HEIGHT_IN - top - 0.6 };
  layoutBlocks(data.blocks, body, theme, data.blockLayouts).forEach((frame) => addFrame(slide, frame, context));
  addSlideNumber(slide, theme.muted);
}

async function rasterized(svg: string | null): Promise<LoadedImage | null> {
  const png = svg ? await svgToPngDataUrl(svg) : null;
  return png ? { data: png.url, width: png.width, height: png.height } : null;
}

async function loadFileImage(documentDir: string | null, relativePath: string): Promise<LoadedImage | null> {
  const blob = await loadImage(documentDir, relativePath);
  if (!blob) return null;
  // PowerPoint cannot embed SVG reliably; rasterize it like a diagram.
  if (blob.type === 'image/svg+xml') return rasterized(await blob.text());
  const data = await blobToDataUrl(blob);
  const size = await imageSize(data);
  return size ? { data, ...size } : null;
}

async function loadFrameImages(deck: SlideDeck, documentDir: string | null): Promise<Map<string, LoadedImage | null>> {
  const images = new Map<string, LoadedImage | null>();
  const frames = deck.slides.flatMap((slide) =>
    layoutBlocks(slide.blocks, { x: 0, y: 0, w: CONTENT_W, h: 5 }, deck.theme),
  );
  for (const frame of frames) {
    if (frame.kind !== 'image' || images.has(imageKey(frame))) continue;
    const image =
      frame.source.kind === 'diagram'
        ? await rasterized(await renderMermaidSvg(frame.source.code, deck.theme))
        : await loadFileImage(documentDir, frame.source.relativePath);
    images.set(imageKey(frame), image);
  }
  return images;
}

/** Builds the .pptx bytes for a deck. */
export async function buildPptx(deck: SlideDeck, documentDir: string | null): Promise<Uint8Array> {
  const { default: PptxGenJSClass } = await import('pptxgenjs');
  const pptx = new PptxGenJSClass();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = deck.metadata.title;
  pptx.author = deck.metadata.author;
  pptx.subject = deck.metadata.subtitle;
  const fontFace = FONT_FACES[deck.style.font];
  pptx.theme = { headFontFace: fontFace, bodyFontFace: fontFace };
  const context: ExportContext = {
    theme: deck.theme,
    style: deck.style,
    fontFace,
    images: await loadFrameImages(deck, documentDir),
  };

  for (const data of deck.slides) {
    const slide = pptx.addSlide();
    if (data.layout === 'title') addTitleSlide(slide, deck, data, context);
    else if (data.layout === 'section') addSectionSlide(slide, data, context);
    else addContentSlide(slide, data, context);
    if (data.notes) slide.addNotes(data.notes);
  }
  if (deck.slides.length === 0) pptx.addSlide();
  const output = await pptx.write({ outputType: 'uint8array' });
  return output as Uint8Array;
}
