import { expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildPptx } from './pptxExporter';
import { parseSlideDeck } from './slideDeckService';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
vi.mock('./imageStore', () => ({
  loadImage: vi.fn(async () => new Blob(['image'], { type: 'image/png' })),
  blobToDataUrl: vi.fn(async () => png),
  imageSize: vi.fn(async () => ({ width: 1, height: 1 })),
}));

it('places a background behind editable code with emphasized runs', async () => {
  const deck = await parseSlideDeck(
    '[background-image="bg.png"]\n== Code\n\n[source,python,highlight="2"]\n----\na\nb\nc\n----',
  );
  const zip = await JSZip.loadAsync(await buildPptx(deck, '/deck'));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toContain('<p:pic>');
  expect(xml.indexOf('<p:pic>')).toBeLessThan(xml.indexOf('2  b'));
  expect(xml).toContain('b="1"');
  expect(xml).toContain('1  a');
  expect(Object.keys(zip.files).some((path) => path.startsWith('ppt/media/'))).toBe(true);
});
