import { describe, expect, it } from 'vitest';
import { parseSlideDeck } from './slideDeckService';

const DECK = `= Deck Title: The Subtitle
Jane Doe
:revdate: 2026-10-03
:slide-theme: dark

Preamble text.

[.section]
== Part One

== Agenda
* First
* Second

[.notes]
--
Say *this* first.
--

<<<

Continued.

[NOTE.speaker]
Remember the demo.

=== Detail
Detail body.

[%notitle]
== Hidden title
Only body.
`;

describe('parseSlideDeck', () => {
  it('reads an optional system font and permits reverting to the default', async () => {
    expect((await parseSlideDeck('= Deck\n:slide-font: Apple SD Gothic Neo\n\n== Body\nText')).fontFamily).toBe(
      'Apple SD Gothic Neo',
    );
    expect((await parseSlideDeck('= Deck\n:slide-font:\n\n== Body\nText')).fontFamily).toBeUndefined();
    expect((await parseSlideDeck(DECK)).fontFamily).toBeUndefined();
  });
  it('builds title, section, content, continuation and child slides', async () => {
    const deck = await parseSlideDeck(DECK);
    expect(deck.metadata).toMatchObject({
      title: 'Deck Title',
      subtitle: 'The Subtitle',
      author: 'Jane Doe',
      date: '2026-10-03',
    });
    expect(deck.theme.id).toBe('dark');
    expect(deck.slides.map((s) => [s.layout, s.title])).toEqual([
      ['title', 'Deck Title'],
      ['section', 'Part One'],
      ['content', 'Agenda'],
      ['content', 'Agenda'],
      ['content', 'Detail'],
      ['content', 'Hidden title'],
    ]);
    expect(deck.slides[0].blocks[0]).toMatchObject({ type: 'paragraph', text: 'Preamble text.' });
    expect(deck.slides[2].blocks.map((b) => b.type)).toEqual(['list']);
    expect(deck.slides[2].notes).toBe('Say this first.\nRemember the demo.');
    expect(deck.slides[3].blocks.map((b) => b.type)).toEqual(['paragraph']);
    expect(deck.slides[3].notes).toBe('');
    expect(deck.slides[5].hideTitle).toBe(true);
    expect(deck.slides[2].line).toBe(11);
    expect(deck.slides[3].line).toBe(22);
  });

  it('treats an untitled document preamble as a content slide', async () => {
    const deck = await parseSlideDeck('Just text.\n\n== One\nBody.');
    expect(deck.slides.map((s) => s.layout)).toEqual(['content', 'content']);
    expect(deck.theme.id).toBe('light');
  });

  it('keeps the text of a delimited quote block', async () => {
    const deck = await parseSlideDeck('== Q\n[quote, Author]\n____\nFirst *line*.\n\nSecond.\n____\n');
    expect(deck.slides[0].blocks[0]).toMatchObject({
      type: 'quote',
      attribution: 'Author',
      text: 'First *line*. Second.',
    });
  });

  it('makes an empty section with sub-slides a divider', async () => {
    const deck = await parseSlideDeck('= T\n\n== Part\n\n=== A\nx\n');
    expect(deck.slides.map((s) => s.layout)).toEqual(['title', 'section', 'content']);
  });
});

describe('slideIndexForLine', () => {
  it('maps a cursor line to the slide it is in', async () => {
    const { slideIndexForLine } = await import('./slideNavigation');
    const deck = await parseSlideDeck('= T\n\n== A\na\n\n<<<\n\nb\n\n== B\nc\n');
    expect(deck.slides.map((s) => s.line)).toEqual([1, 3, 8, 10]);
    expect([1, 2, 4, 7, 8, 9, 11].map((line) => slideIndexForLine(deck, line))).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
});
