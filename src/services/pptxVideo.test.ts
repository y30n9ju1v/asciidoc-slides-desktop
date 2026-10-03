import { beforeEach, expect, it, vi } from 'vitest';
import { readFile, stat } from '@tauri-apps/plugin-fs';
import { buildPptx } from './pptxExporter';
import { parseSlideDeck } from './slideDeckService';
import { MAX_EMBEDDED_VIDEO_BYTES } from './videoStore';

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn(), stat: vi.fn() }));
vi.mock('./assetAdapter', () => ({ resolveDocumentAsset: async (root: string, path: string) => `${root}/${path}` }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(stat).mockResolvedValue({ size: 4 } as Awaited<ReturnType<typeof stat>>);
  vi.mocked(readFile).mockResolvedValue(new Uint8Array([0, 1, 2, 3]));
});

async function unzip(bytes: Uint8Array) {
  const { default: JSZip } = await import('jszip');
  return JSZip.loadAsync(bytes);
}

it('embeds local videos and links YouTube as an online video', async () => {
  const deck = await parseSlideDeck('== Clips\n\nvideo::media/demo.mp4[]\n\nvideo::dQw4w9WgXcQ[youtube,start=30]\n');
  const zip = await unzip(await buildPptx(deck, '/deck'));
  const media = Object.keys(zip.files).filter((name) => name.startsWith('ppt/media/'));
  expect(media.some((name) => name.endsWith('.mp4'))).toBe(true);
  const embedded = zip.file(media.find((name) => name.endsWith('.mp4'))!)!;
  expect([...(await embedded.async('uint8array'))]).toEqual([0, 1, 2, 3]);
  const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string');
  expect(rels).toContain('https://www.youtube.com/embed/dQw4w9WgXcQ?start=30');
  expect(vi.mocked(readFile)).toHaveBeenCalledWith('/deck/media/demo.mp4');
});

it('reports a video too large to embed instead of reading it', async () => {
  vi.mocked(stat).mockResolvedValue({ size: MAX_EMBEDDED_VIDEO_BYTES + 1 } as Awaited<ReturnType<typeof stat>>);
  const deck = await parseSlideDeck('== Clip\n\nvideo::big.mp4[]\n');
  await expect(buildPptx(deck, '/deck')).rejects.toThrow('video big.mp4: larger than 300 MB');
  expect(readFile).not.toHaveBeenCalled();
});

it.each(['= Cover\n\n', '[.section]\n== Section\n\n'])('includes video-only hero slides: %s', async (header) => {
  const deck = await parseSlideDeck(`${header}video::dQw4w9WgXcQ[youtube]\n`);
  expect(deck.slides[0].blocks).toHaveLength(0);
  const zip = await unzip(await buildPptx(deck, '/deck'));
  expect(await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string')).toContain(
    'youtube.com/embed/dQw4w9WgXcQ',
  );
});
