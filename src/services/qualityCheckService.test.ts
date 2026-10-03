import { beforeEach, expect, it, vi } from 'vitest';
import { checkOutputQuality } from './qualityCheckService';
import { parseSlideDeck } from './slideDeckService';
import { listSystemFonts } from './systemFontAdapter';
import { loadImageResult } from './imageStore';
import { resolveDocumentAsset } from './assetAdapter';

vi.mock('./systemFontAdapter');
vi.mock('./imageStore');
vi.mock('./assetAdapter');
beforeEach(() => vi.resetAllMocks());

it('reports missing selected fonts and backgrounds with slide navigation', async () => {
  vi.mocked(listSystemFonts).mockResolvedValue(['Menlo']);
  vi.mocked(loadImageResult).mockResolvedValue({ blob: null, error: 'not found' });
  const deck = await parseSlideDeck('= Deck\n:slide-font: Missing\n:slide-background: images/missing.png\n\nHello');
  const issues = await checkOutputQuality(deck, '/deck', 'pdf');
  expect(issues).toContainEqual(
    expect.objectContaining({ severity: 'error', message: expect.stringContaining('not installed') }),
  );
  expect(issues).toContainEqual(
    expect.objectContaining({ severity: 'error', slideIndex: 0, message: expect.stringContaining('missing.png') }),
  );
});

it('reports missing video paths without loading full video data', async () => {
  vi.mocked(resolveDocumentAsset).mockRejectedValue(new Error('denied'));
  const deck = await parseSlideDeck('== Video\n\nvideo::clip.mp4[]');
  const issues = await checkOutputQuality(deck, '/deck', 'pptx');
  expect(issues).toContainEqual(expect.objectContaining({ severity: 'error', slideIndex: 0 }));
});

it('does not claim fonts passed when the desktop scanner is unavailable', async () => {
  vi.mocked(listSystemFonts).mockRejectedValue(new Error('browser'));
  const deck = await parseSlideDeck('= Deck\n:slide-font: Menlo\n\nHello');
  const issues = await checkOutputQuality(deck, null, 'pdf');
  expect(issues).toContainEqual(
    expect.objectContaining({ severity: 'warning', message: expect.stringContaining('Could not check') }),
  );
});
