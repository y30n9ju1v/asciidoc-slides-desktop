import { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFile } from '@tauri-apps/plugin-fs';
import { SlideBlocks } from './SlideBlocks';
import { SlideAssetsContext } from './SlideAssetsContext';
import { clearImageCache } from '../../services/imageStore';
import { parseSlideDeck } from '../../services/slideDeckService';
import sampleDeck from '../../../samples/sample-deck.adoc?raw';

const slideCss = readFileSync('src/index.css', 'utf8');

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }));
vi.mock('../../services/assetAdapter', () => ({
  resolveDocumentAsset: async (root: string, path: string) => `${root}/${path}`,
}));
vi.mock('../../services/mermaidRenderer', () => ({ renderMermaidSvg: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const revoke = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  clearImageCache();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL(blob: Blob) {
        return `blob:review-${blob.size}`;
      }
      static revokeObjectURL = revoke;
    },
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderImage() {
  const deck = await parseSlideDeck('== Image\n\nimage::chart.png[Chart]');
  await act(async () =>
    root.render(
      <SlideAssetsContext.Provider value={{ documentDir: '/deck', theme: deck.theme, playback: false }}>
        <SlideBlocks slide={deck.slides[0]} />
      </SlideAssetsContext.Provider>,
    ),
  );
}

it('renders code callout markers and formatted explanations with line highlighting', async () => {
  const deck = await parseSlideDeck(
    '== Code\n\n[source,python,highlight="1"]\n----\nprint("Hi") # <1>\n----\n<1> Say *hello*.',
  );
  await act(async () =>
    root.render(
      <SlideAssetsContext.Provider value={{ documentDir: null, theme: deck.theme, playback: false }}>
        <SlideBlocks slide={deck.slides[0]} />
      </SlideAssetsContext.Provider>,
    ),
  );
  expect(container.querySelector('pre')?.textContent).toContain('# (1)');
  expect(container.textContent).toContain('(1) Say hello.');
  expect(container.querySelector('strong')?.textContent).toBe('hello');
});

it('updates a mounted image after invalidation and releases its old URL', async () => {
  vi.mocked(readFile)
    .mockResolvedValueOnce(new Uint8Array([1]))
    .mockResolvedValueOnce(new Uint8Array([2, 3]));
  await renderImage();
  expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:review-1');
  await act(async () => clearImageCache());
  expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:review-2');
  expect(revoke).toHaveBeenCalledWith('blob:review-1');
});

it('replaces a missing-image placeholder after the file is added and refreshed', async () => {
  vi.mocked(readFile)
    .mockRejectedValueOnce(new Error('missing'))
    .mockResolvedValueOnce(new Uint8Array([1]));
  await renderImage();
  expect(container.textContent).toContain('Image not shown');
  await act(async () => clearImageCache());
  expect(container.querySelector('img')).not.toBeNull();
  expect(container.textContent).not.toContain('Image not shown');
});

// jsdom cannot load Tailwind's directives or measure layout. Apply the actual
// table alignment rules to verify the margins responsible for placement.
async function renderTable(source: string) {
  const style = document.createElement('style');
  style.textContent = slideCss.match(/\.slide-sized\[data-align='[^']+'\] table\s*\{[^}]*\}/g)?.join('\n') ?? '';
  container.append(style);
  const deck = await parseSlideDeck(source);
  const slide = deck.slides.find((item) => item.blocks.some((block) => block.type === 'table'))!;
  await act(async () => root.render(<SlideBlocks slide={slide} />));
  // React replaces the root's contents on the first render.
  container.append(style);
  return container.querySelector('table')!;
}

it('centers the sample table itself inside its 70% block', async () => {
  const table = await renderTable(sampleDeck);
  expect(table.closest<HTMLElement>('.slide-sized')?.style.width).toBe('70%');
  expect(getComputedStyle(table).marginLeft).toBe('auto');
  expect(getComputedStyle(table).marginRight).toBe('auto');
});

it.each([
  ['center', 'auto', 'auto'],
  ['right', 'auto', '0px'],
  ['left', '0px', '0px'],
])('aligns the actual table for .%s even without an explicit width', async (align, left, right) => {
  const table = await renderTable(`== Table\n\n[.${align}]\n|===\n| A | B\n|===`);
  expect(getComputedStyle(table).marginLeft).toBe(left);
  expect(getComputedStyle(table).marginRight).toBe(right);
});
