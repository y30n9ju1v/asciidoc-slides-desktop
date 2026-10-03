import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { parseSlideDeck } from './slideDeckService';
import { buildPptx } from './pptxExporter';
import { resolveSlideChrome } from './slideChrome';

describe('running headers, footers and page numbers', () => {
  it('preserves the default of counting but hiding the title page number', async () => {
    const deck = await parseSlideDeck('= Deck\n\n== Body\n\nText');
    expect(deck.slides.map((slide) => slide.chrome?.pageNumber)).toEqual(['', '2']);
  });

  it('supports global labels, custom start and per-slide overrides', async () => {
    const deck = await parseSlideDeck(
      '= Deck\n:slide-header: Company\n:slide-footer: Conference\n:slide-number-start: 10\n:slide-title-page-number: true\n\n[slide-header="Other",slide-footer="",slide-page-numbers=false]\n== Body\n\nText\n\n== Next\n\nText',
    );
    expect(deck.slides[0].chrome).toEqual({ header: 'Company', footer: 'Conference', pageNumber: '10' });
    expect(deck.slides[1].chrome).toEqual({ header: 'Other', footer: '', pageNumber: '' });
    expect(deck.slides[2].chrome?.pageNumber).toBe('12');
  });

  it('can disable numbering globally and enable it on one slide', async () => {
    const deck = await parseSlideDeck(
      '= Deck\n:slide-page-numbers: false\n\n[slide-page-numbers=true]\n== Body\n\nText',
    );
    expect(deck.slides.map((slide) => slide.chrome?.pageNumber)).toEqual(['', '2']);
  });

  it('bounds labels and rejects invalid starting numbers', () => {
    const chrome = resolveSlideChrome({ header: 'x'.repeat(500), start: '-10' }, {}, 'content', 0);
    expect(chrome.header).toHaveLength(160);
    expect(chrome.pageNumber).toBe('1');
  });

  it('exports labels and numbers as editable PowerPoint text', async () => {
    const deck = await parseSlideDeck(
      '= Deck\n:slide-header: Header label\n:slide-footer: Footer label\n:slide-number-start: 42\n:slide-title-page-number: true\n\nText',
    );
    const zip = await JSZip.loadAsync(await buildPptx(deck, null));
    const xml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(xml).toContain('Header label');
    expect(xml).toContain('Footer label');
    expect(xml).toContain('<a:t>42</a:t>');
  });
});
