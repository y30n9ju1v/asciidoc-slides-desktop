import { describe, expect, it } from 'vitest';
import { parseCodeHighlights } from './codeHighlight';
import { parseSlideDeck } from './slideDeckService';
import { deckImagePaths } from './deckAssets';
import { inspectLayoutQuality } from './outputQuality';
import { layoutBlocks } from './pptxLayout';

describe('slide enhancements', () => {
  it('bounds and deduplicates highlighted line ranges', () => {
    expect(parseCodeHighlights('2;4-6;4')).toEqual([2, 4, 5, 6]);
    expect(parseCodeHighlights('0;9-2;1-999999999;<script>')).toEqual([]);
  });
  it('carries code highlights into the shared layout and PPTX frames', async () => {
    const deck = await parseSlideDeck('== Code\n\n[source,python,highlight="2;4-5"]\n----\na\nb\nc\nd\ne\n----');
    expect(deck.slides[0].blockLayouts[0]?.codeHighlights).toEqual([2, 4, 5]);
    const frames = layoutBlocks(
      deck.slides[0].blocks,
      { x: 0, y: 0, w: 10, h: 5 },
      deck.theme,
      deck.slides[0].blockLayouts,
    );
    expect(frames.find((frame) => frame.kind === 'code')).toMatchObject({ highlights: [2, 4, 5] });
  });
  it('loads title and per-slide backgrounds through the existing asset boundary', async () => {
    const deck = await parseSlideDeck(
      '= Deck\n:slide-background: images/title.png\n\n[background-image="images/section.png"]\n== Body\n\nText',
    );
    expect(deck.slides.map((slide) => slide.backgroundImage)).toEqual(['images/title.png', 'images/section.png']);
    expect(deckImagePaths(deck)).toEqual(['images/title.png', 'images/section.png']);
  });
  it('rejects remote and escaping background paths', async () => {
    for (const path of ['https://example.com/image.png', '../private.png', '/etc/passwd']) {
      const deck = await parseSlideDeck(`= Deck\n:slide-background: ${path}\n\nText`);
      expect(deck.slides[0].backgroundImage).toBeUndefined();
      expect(deck.diagnostics.some((item) => item.severity === 'error')).toBe(true);
    }
  });
  it('reports dense slides with a navigable slide index', async () => {
    const deck = await parseSlideDeck(`== Dense\n\n[source]\n----\n${'a\n'.repeat(150)}----`);
    expect(inspectLayoutQuality(deck)).toContainEqual(expect.objectContaining({ slideIndex: 0, severity: 'warning' }));
  });
});
