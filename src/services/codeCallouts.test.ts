import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseSlideDeck } from './slideDeckService';
import { buildPptx } from './pptxExporter';
import { STARTER_DECK } from './starterDeck';

const source =
  '== Callouts\n\n[source,python,highlight="1"]\n----\nprint("Hi") # <1>\nprint("Bye") # <2>\n----\n<1> Say *hello*.\n<2> Say goodbye.';

it('keeps code markers and rich explanations together without losing line highlighting', async () => {
  const deck = await parseSlideDeck(source);
  const slide = deck.slides[0];
  expect(deck.diagnostics).toEqual([]);
  expect(slide.blocks[0]).toMatchObject({ type: 'code', code: 'print("Hi") # (1)\nprint("Bye") # (2)' });
  expect(slide.blocks[1]).toMatchObject({
    type: 'paragraph',
    inlines: expect.arrayContaining([{ type: 'strong', children: [{ type: 'text', value: 'hello' }] }]),
  });
  expect(slide.blocks[2]).toMatchObject({ type: 'paragraph', text: '(2) Say goodbye.' });
  expect(slide.blockLayouts[0]?.codeHighlights).toEqual([1]);
});

it('leaves marker-like code untouched without an explanation list', async () => {
  const deck = await parseSlideDeck('== Code\n\n[source]\n----\nvalue <1>\n----');
  expect(deck.slides[0].blocks[0]).toMatchObject({ code: 'value <1>' });
});

it('uses the explanation number when a callout is repeated on multiple lines', async () => {
  const deck = await parseSlideDeck('== Code\n\n[source]\n----\na <1>\nb <1> <2>\n----\n<1> Shared\n<2> Second');
  expect(deck.slides[0].blocks[0]).toMatchObject({ code: 'a (1)\nb (1) (2)' });
  expect(deck.slides[0].blocks[1]).toMatchObject({ text: '(1) Shared' });
});

it('supports automatic markers and nested source blocks', async () => {
  const deck = await parseSlideDeck('== Code\n\n--\n[source]\n----\na <.>\nb <.>\n----\n<.> First\n<.> Second\n--');
  expect(JSON.stringify(deck.slides[0].blocks)).toContain('a (1)\\nb (2)');
  expect(JSON.stringify(deck.slides[0].blocks)).toContain('(2) Second');
});

it('exports numbered explanations and code as editable PowerPoint text', async () => {
  const deck = await parseSlideDeck(source);
  const zip = await JSZip.loadAsync(await buildPptx(deck, null));
  const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  expect(xml).toContain('(1)');
  expect(xml).toContain('(2)');
  expect(xml).toContain('goodbye');
  expect(xml).not.toContain('&lt;1&gt;');
});

it('includes a callout in the startup example', async () => {
  const deck = await parseSlideDeck(STARTER_DECK);
  expect(JSON.stringify(deck)).toContain('# (1)');
  expect(JSON.stringify(deck)).toContain('(1) 화면에 인사말을 출력합니다.');
});
