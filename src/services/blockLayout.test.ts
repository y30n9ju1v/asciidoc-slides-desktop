import { describe, expect, it } from 'vitest';
import { blockLayoutOf } from './blockLayout';
import { parseSlideDeck } from './slideDeckService';
import { withHeaderAttribute } from './headerAttributes';

describe('blockLayoutOf', () => {
  it('reads roles and attributes, clamped', () => {
    expect(blockLayoutOf([], undefined)).toBeNull();
    expect(blockLayoutOf(['small', 'center'], { width: '60%' })).toEqual({ width: 0.6, scale: 0.8, align: 'center' });
    expect(blockLayoutOf([], { 'font-size': '300%', width: '582' })).toEqual({ width: 0.5, scale: 2, align: null });
    expect(blockLayoutOf(['lead'], {})).toEqual({ width: null, scale: 1.25, align: null });
  });
});

describe('sized blocks and styles in a deck', () => {
  it('pairs each top-level block with its layout', async () => {
    const deck = await parseSlideDeck(
      '= T\n:slide-style: banner\n\n== S\nIntro.\n\n[.small,width=50%]\n|===\n| a | b\n|===\n\n[source,js,font-size=70%]\n----\nx()\n----\n',
    );
    expect(deck.style.id).toBe('banner');
    const slide = deck.slides[1];
    expect(slide.blocks.map((block) => block.type)).toEqual(['paragraph', 'table', 'code']);
    expect(slide.blockLayouts).toEqual([
      null,
      { width: 0.5, scale: 0.8, align: null },
      { width: null, scale: 0.7, align: null },
    ]);
  });

  it('falls back to the classic style', async () => {
    expect((await parseSlideDeck('= T\n:slide-style: nope\n')).style.id).toBe('classic');
  });
});

describe('withHeaderAttribute', () => {
  it('updates an existing attribute line', () => {
    expect(withHeaderAttribute('= T\n:slide-theme: light\n\nx', 'slide-theme', 'dark')).toBe(
      '= T\n:slide-theme: dark\n\nx',
    );
  });

  it('inserts after the title, author, and attribute lines', () => {
    expect(withHeaderAttribute('= T\nJane\n:revdate: 2026\n\n== A', 'slide-style', 'minimal')).toBe(
      '= T\nJane\n:revdate: 2026\n:slide-style: minimal\n\n== A',
    );
    expect(withHeaderAttribute('== A', 'slide-style', 'minimal')).toBe(':slide-style: minimal\n\n== A');
  });

  it('never edits attribute-looking lines in the body', () => {
    const body = '\n\n== Syntax\n\n----\n:slide-theme: dark\n----\n';
    expect(withHeaderAttribute(`= T${body}`, 'slide-theme', 'ocean')).toBe(`= T\n:slide-theme: ocean${body}`);
    expect(withHeaderAttribute(`:slide-theme: warm${body}`, 'slide-theme', 'ocean')).toBe(`:slide-theme: ocean${body}`);
    expect(withHeaderAttribute(`== A${body}`, 'slide-theme', 'ocean')).toBe(`:slide-theme: ocean\n\n== A${body}`);
  });

  it('keeps leading comments ahead of the header', () => {
    expect(withHeaderAttribute('// draft\n= T\nJane\n\nx', 'slide-style', 'banner')).toBe(
      '// draft\n= T\nJane\n:slide-style: banner\n\nx',
    );
  });
});
