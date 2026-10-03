import type { SafeBlock } from '../../packages/asciidoc-typst/typescript/src';
import type { BlockLayout, Slide, SlideVideo } from './slideDeck';

export type SlideItem =
  { kind: 'block'; block: SafeBlock; layout: BlockLayout | null } | { kind: 'video'; video: SlideVideo };

/**
 * A slide's top-level content in source order: each video is placed before
 * `blocks[video.at]`. Every renderer (preview, PPTX, and the Rust PDF writer)
 * uses this same rule.
 */
export function slideItems(slide: Pick<Slide, 'blocks' | 'blockLayouts' | 'videos'>): SlideItem[] {
  const items: SlideItem[] = [];
  const videos = [...slide.videos].sort((a, b) => a.at - b.at);
  let next = 0;
  slide.blocks.forEach((block, index) => {
    while (next < videos.length && videos[next].at <= index) items.push({ kind: 'video', video: videos[next++] });
    items.push({ kind: 'block', block, layout: slide.blockLayouts[index] ?? null });
  });
  while (next < videos.length) items.push({ kind: 'video', video: videos[next++] });
  return items;
}
