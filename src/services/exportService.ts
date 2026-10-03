import { deckDiagramSources, deckImagePaths, diagramAssetPath } from './deckAssets';
import { chooseExportFile, confirmExportWarnings, exportSlidesPdf, writeBinaryFile } from './documentFileAdapter';
import { renderMermaidSvg } from './mermaidRenderer';
import { buildPptx } from './pptxExporter';
import type { SlideDeck } from './slideDeck';
import { inspectExport, type ExportFormat } from './exportPreflight';
import { stemName } from './pathNames';
import { parseSlideDeck } from './slideDeckService';
import { clearImageCache } from './imageStore';

export type { ExportFormat } from './exportPreflight';

export interface ExportDocument {
  text: string;
  path: string | null;
  documentDir: string | null;
}

/** Capture source and paths together; preview debounce/error state never controls output. */
export async function exportDocument(format: ExportFormat, snapshot: ExportDocument): Promise<string | null> {
  const deck = await parseSlideDeck(snapshot.text);
  return exportDeck(format, deck, snapshot.path, snapshot.documentDir);
}

/** The JSON contract read by `slide_deck.rs::SlidePdfRequest`. */
export async function buildPdfRequest(deck: SlideDeck, documentDir: string | null) {
  const diagrams: { path: string; svg: string }[] = [];
  for (const code of deckDiagramSources(deck)) {
    const svg = await renderMermaidSvg(code, deck.theme);
    if (!svg) throw new Error('Could not render a Mermaid diagram. Fix the diagram before exporting PDF.');
    diagrams.push({ path: diagramAssetPath(code), svg });
  }
  return { deck, documentRoot: documentDir, assets: deckImagePaths(deck), diagrams };
}

function exportFileName(documentPath: string | null, deck: SlideDeck, extension: string): string {
  const base =
    (documentPath ? stemName(documentPath) : '') ||
    deck.metadata.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() ||
    'slides';
  return `${base}.${extension}`;
}

/**
 * Asks where to save, then writes the export. Returns the saved path, or
 * null when the user cancelled the picker.
 */
export async function exportDeck(
  format: ExportFormat,
  deck: SlideDeck,
  documentPath: string | null,
  documentDir: string | null,
): Promise<string | null> {
  const issues = inspectExport(deck, format);
  const errors = issues.filter((issue) => issue.severity === 'error');
  if (errors.length) throw new Error(errors.map((issue) => issue.message).join('\n'));
  if (issues.length && !(await confirmExportWarnings(issues.map((issue) => issue.message)))) return null;
  const isPdf = format === 'pdf';
  const outputPath = await chooseExportFile(exportFileName(documentPath, deck, format), isPdf ? 'PDF' : 'PowerPoint', [
    format,
  ]);
  if (!outputPath) return null;
  clearImageCache();
  if (isPdf) {
    const requestJson = JSON.stringify(await buildPdfRequest(deck, documentDir));
    await exportSlidesPdf(requestJson, outputPath);
  } else {
    await writeBinaryFile(outputPath, await buildPptx(deck, documentDir));
  }
  return outputPath;
}

/** Native export errors arrive as `{ code, message }`. */
export function exportErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  return String(error);
}
