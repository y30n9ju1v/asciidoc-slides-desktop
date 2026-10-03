import type { SlideDeck } from './slideDeck';
import { deckImagePaths } from './deckAssets';
import { inspectExport, type ExportFormat } from './exportPreflight';
import { listSystemFonts } from './systemFontAdapter';
import { loadImageResult, clearImageCache } from './imageStore';
import { resolveDocumentAsset } from './assetAdapter';
import type { QualityIssue } from './outputQuality';

async function fontIssues(deck: SlideDeck): Promise<QualityIssue[]> {
  if (!deck.fontFamily) return [];
  try {
    const fonts = await listSystemFonts();
    return fonts.some((font) => font.toLowerCase() === deck.fontFamily!.toLowerCase())
      ? []
      : [{ severity: 'error', message: `Font “${deck.fontFamily}” is not installed. Choose another slide font.` }];
  } catch {
    return [{ severity: 'warning', message: 'Could not check installed fonts. Run this check in the desktop app.' }];
  }
}

async function assetIssues(deck: SlideDeck, directory: string | null): Promise<QualityIssue[]> {
  const issues: QualityIssue[] = [];
  for (const [slideIndex, slide] of deck.slides.entries()) {
    for (const path of deckImagePaths({ ...deck, slides: [slide] })) {
      const result = await loadImageResult(directory, path);
      if (!result.blob)
        issues.push({
          severity: 'error',
          slideIndex,
          message: `Slide ${slideIndex + 1}: cannot read image “${path}”: ${result.error}`,
        });
    }
    for (const video of slide.videos) {
      if (video.source.kind !== 'file') continue;
      try {
        await checkVideoPath(directory, video.source.relativePath);
      } catch {
        issues.push({
          severity: 'error',
          slideIndex,
          message: `Slide ${slideIndex + 1}: video is missing or outside the allowed folder.`,
        });
      }
    }
  }
  return issues;
}

function checkVideoPath(directory: string | null, path: string): Promise<string> {
  if (!directory) return Promise.reject(new Error('Save the deck first.'));
  return resolveDocumentAsset(directory, path);
}

export async function checkOutputQuality(
  deck: SlideDeck,
  directory: string | null,
  format: ExportFormat,
): Promise<QualityIssue[]> {
  clearImageCache();
  return [...inspectExport(deck, format), ...(await fontIssues(deck)), ...(await assetIssues(deck, directory))];
}
