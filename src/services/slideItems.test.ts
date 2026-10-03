import { expect, it } from 'vitest';
import type { SafeBlock } from '../../packages/asciidoc-typst/typescript/src';
import { slideItems } from './slideItems';
import type { SlideVideo } from './slideDeck';

const block = (n: number) => ({ type: 'thematicBreak', location: { line: n } }) as SafeBlock;
const video = (at: number): SlideVideo => ({
  at,
  source: { kind: 'youtube', id: 'dQw4w9WgXcQ' },
  poster: null,
  title: `v${at}`,
  start: null,
  layout: null,
});

it('interleaves videos before the block at their position', () => {
  const items = slideItems({ blocks: [block(1), block(2)], blockLayouts: [], videos: [video(2), video(0), video(1)] });
  expect(items.map((item) => (item.kind === 'video' ? item.video.title : `b${item.block.location.line}`))).toEqual([
    'v0',
    'b1',
    'v1',
    'b2',
    'v2',
  ]);
});

it('keeps a video-only slide', () => {
  expect(slideItems({ blocks: [], blockLayouts: [], videos: [video(0)] })).toHaveLength(1);
});
