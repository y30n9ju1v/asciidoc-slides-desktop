import { describe, expect, it } from 'vitest';
import { parseSlideDeck } from './slideDeckService';
import { youtubeEmbedUrl, youtubeIdOf, youtubeWatchUrl } from './slideVideo';

describe('youtubeIdOf', () => {
  it('accepts bare IDs and the common YouTube link forms', () => {
    for (const target of [
      'dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      expect(youtubeIdOf(target)).toBe('dQw4w9WgXcQ');
    }
  });

  it('rejects anything that is not exactly an 11-character ID on a YouTube host', () => {
    for (const target of [
      'short',
      'dQw4w9WgXcQ"><',
      'http://youtu.be/dQw4w9WgXcQ',
      'https://evil.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(youtubeIdOf(target)).toBeNull();
    }
  });

  it('builds watch and privacy-enhanced embed URLs', () => {
    expect(youtubeWatchUrl('dQw4w9WgXcQ', 30)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s');
    expect(youtubeEmbedUrl('dQw4w9WgXcQ', 30, true)).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=30&autoplay=1&rel=0',
    );
  });
});

describe('videos in a deck', () => {
  it.each([
    '[quote]\n____\nvideo::clip.mp4[]\n____',
    'Term:: Description\n+\nvideo::clip.mp4[]',
    '* Item\n+\nvideo::clip.mp4[]',
  ])('reports nested video loss in %s', async (body) => {
    const deck = await parseSlideDeck(`== Nested\n\n${body}`);
    expect(deck.diagnostics.some((d) => d.message.includes('Place videos directly'))).toBe(true);
  });
  it('places local and YouTube videos among the slide blocks', async () => {
    const deck = await parseSlideDeck(
      [
        '== Demo',
        'Before.',
        '',
        '.Demo clip',
        '[.small,width=60%]',
        'video::media/demo.mp4[poster=media/demo.png,start=5]',
        '',
        'After.',
        '',
        'video::https://youtu.be/dQw4w9WgXcQ?t=42[cover=media/thumb.jpg]',
      ].join('\n'),
    );
    const slide = deck.slides[0];
    expect(slide.blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph']);
    expect(slide.videos).toEqual([
      {
        at: 1,
        source: { kind: 'file', relativePath: 'media/demo.mp4' },
        poster: 'media/demo.png',
        title: 'Demo clip',
        start: 5,
        layout: { width: 0.6, scale: 0.8, align: null },
      },
      {
        at: 2,
        source: { kind: 'youtube', id: 'dQw4w9WgXcQ' },
        poster: 'media/thumb.jpg',
        title: null,
        start: 42,
        layout: null,
      },
    ]);
    expect(deck.diagnostics).toEqual([]);
  });

  it('reports videos it cannot safely play instead of dropping them silently', async () => {
    const deck = await parseSlideDeck(
      [
        '== S',
        'video::../secret.mp4[]',
        '',
        'video::123[vimeo]',
        '',
        'video::notes.txt[]',
        '',
        'video::bad[youtube]',
        '',
        'video::clip.mp4[poster=https://x.test/a.png]',
        '',
        '[columns]',
        '--',
        'video::clip.mp4[]',
        '--',
      ].join('\n'),
    );
    expect(deck.slides[0].videos).toHaveLength(1);
    expect(deck.slides[0].videos[0]).toMatchObject({
      source: { kind: 'file', relativePath: 'clip.mp4' },
      poster: null,
    });
    expect(deck.diagnostics.map((d) => [d.location.line, d.code])).toEqual([
      [2, 'unsafe-asset-target'],
      [4, 'unsupported-block'],
      [6, 'unsupported-block'],
      [8, 'unsupported-block'],
      [10, 'unsafe-asset-target'],
      [14, 'unsupported-block'],
    ]);
    expect(deck.diagnostics.filter((d) => d.code === 'unsafe-asset-target').every((d) => d.severity === 'error')).toBe(
      true,
    );
  });
});
