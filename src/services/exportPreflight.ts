import type { SafeInline } from '../../packages/asciidoc-typst/typescript/src';
import { blockInlines, walkBlocks } from './deckAssets';
import type { Slide, SlideDeck } from './slideDeck';

export type ExportFormat = 'pptx' | 'pdf';

export interface ExportIssue {
  severity: 'error' | 'warning';
  message: string;
}

function inspectInlines(inlines: SafeInline[], kinds: Set<string>): void {
  for (const inline of inlines) {
    if (inline.type === 'math' || inline.type === 'inlineImage') kinds.add(inline.type);
    if ('children' in inline) inspectInlines(inline.children, kinds);
  }
}

const slidePrefix = (slide: Slide, index: number) => `Slide ${index + 1} (${slide.title || 'Untitled'}): `;

/** PDF is a fixed page: videos cannot play there. */
function pdfVideoIssues(deck: SlideDeck): ExportIssue[] {
  return deck.slides.flatMap((slide, index) =>
    slide.videos.length
      ? [
          {
            severity: 'warning' as const,
            message: `${slidePrefix(slide, index)}PDF shows video posters: local files have a filename, YouTube videos have a clickable link. Present in the app or export PowerPoint to play them.`,
          },
        ]
      : [],
  );
}

function pptxSlideIssues(slide: Slide, index: number): ExportIssue[] {
  const kinds = new Set<string>();
  walkBlocks(slide.blocks, (block) => {
    if (block.type === 'mathBlock') kinds.add('math');
    blockInlines(block).forEach((inlines) => inspectInlines(inlines, kinds));
  });
  const prefix = slidePrefix(slide, index);
  const issues: ExportIssue[] = [];
  if (kinds.has('math'))
    issues.push({
      severity: 'warning',
      message: `${prefix}equations will become LaTeX text in PowerPoint. Export PDF to keep rendered equations.`,
    });
  if (kinds.has('inlineImage'))
    issues.push({
      severity: 'warning',
      message: `${prefix}inline images will become alt text in PowerPoint. Use a block image (image::path[]) or export PDF to keep images.`,
    });
  if (slide.videos.some((video) => video.source.kind === 'youtube'))
    issues.push({
      severity: 'warning',
      message: `${prefix}YouTube videos play only in recent PowerPoint versions with an internet connection.`,
    });
  if (slide.videos.some((video) => video.source.kind === 'file' && video.start))
    issues.push({
      severity: 'warning',
      message: `${prefix}local videos start at the beginning in PowerPoint; start offsets apply only in the app.`,
    });
  return issues;
}

/** Pure inspection: unsupported content must never disappear without notice. */
export function inspectExport(deck: SlideDeck, format: ExportFormat): ExportIssue[] {
  const issues: ExportIssue[] = deck.diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    message: `${diagnostic.location.line ? `Line ${diagnostic.location.line}: ` : ''}${diagnostic.message}`,
  }));
  if (!deck.slides.length) issues.push({ severity: 'error', message: 'Add a slide before exporting.' });
  if (format === 'pdf') return [...issues, ...pdfVideoIssues(deck)];
  return [...issues, ...deck.slides.flatMap(pptxSlideIssues)];
}
