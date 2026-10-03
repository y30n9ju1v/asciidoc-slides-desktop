import { expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseSlideDeck } from './slideDeckService';
import { buildPptx } from './pptxExporter';
import { STARTER_DECK } from './starterDeck';

it('ends the startup and new-document example with a closing slide', async () => {
  const deck = await parseSlideDeck(STARTER_DECK);
  const last = deck.slides[deck.slides.length - 1];
  expect(last.layout).toBe('closing');
  expect(last.chrome).toEqual({ header: '', footer: '', pageNumber: '' });
});

it('supports explicit closing slides, keeps their body and notes, and hides running labels', async () => {
  const deck = await parseSlideDeck(
    '= Deck\n:slide-header: Header\n:slide-footer: Footer\n\n[.closing]\n== Thanks\n\nQuestions?\n\n[.notes]\nRemember to pause.\n\n== Next\n\nText',
  );
  const slide = deck.slides[1];
  expect(slide.layout).toBe('closing');
  expect(slide.blocks).toHaveLength(1);
  expect(slide.notes).toContain('Remember to pause.');
  expect(slide.chrome).toEqual({ header: '', footer: '', pageNumber: '' });
  expect(deck.slides[2].layout).toBe('content');
  expect(deck.slides[2].chrome?.pageNumber).toBe('3');
});

it('allows explicit closing labels and numbering', async () => {
  const deck = await parseSlideDeck(
    '= Deck\n\n[.closing,slide-header="Contact",slide-footer="Bye",slide-page-numbers=true]\n== Thanks',
  );
  expect(deck.slides[1].chrome).toEqual({ header: 'Contact', footer: 'Bye', pageNumber: '2' });
});

it('exports centered editable closing text without automatic page fields', async () => {
  const deck = await parseSlideDeck('= Deck\n\n[.closing]\n== Thanks\n\nQuestions?');
  const zip = await JSZip.loadAsync(await buildPptx(deck, null));
  const xml = await zip.file('ppt/slides/slide2.xml')!.async('string');
  expect(xml).toContain('<a:t>Thanks</a:t>');
  expect(xml).toContain('Questions?');
  expect(xml).toContain('algn="ctr"');
  expect(xml).not.toContain('slidenum');
  expect(xml).not.toContain('<a:t>2</a:t>');
});
