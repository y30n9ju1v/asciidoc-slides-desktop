import type { SafeInline } from '../../packages/asciidoc-typst/typescript/src';
import { blockInlines, walkBlocks } from './deckAssets';
import type { SlideDeck } from './slideDeck';

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

/** Pure inspection: unsupported content must never disappear without notice. */
export function inspectExport(deck: SlideDeck, format: ExportFormat): ExportIssue[] {
  const issues: ExportIssue[] = deck.diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    message: `${diagnostic.location.line ? `Line ${diagnostic.location.line}: ` : ''}${diagnostic.message}`,
  }));
  if (!deck.slides.length) issues.push({ severity: 'error', message: 'Add a slide before exporting.' });
  if (format !== 'pptx') return issues;
  deck.slides.forEach((slide, index) => {
    const kinds = new Set<string>();
    walkBlocks(slide.blocks, (block) => {
      if (block.type === 'mathBlock') kinds.add('math');
      blockInlines(block).forEach((inlines) => inspectInlines(inlines, kinds));
    });
    const prefix = `Slide ${index + 1} (${slide.title || 'Untitled'}): `;
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
  });
  return issues;
}
