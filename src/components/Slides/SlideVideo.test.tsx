import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SlideView } from './SlideView';
import { parseSlideDeck } from '../../services/slideDeckService';
import { localVideoUrl, openYoutubeVideo } from '../../services/videoStore';

vi.mock('../../services/videoStore', () => ({
  localVideoUrl: vi.fn(async () => 'asset://clip.mp4'),
  openYoutubeVideo: vi.fn(),
}));
vi.mock('./useSlideImageUrl', () => ({ useSlideImageUrl: () => ({ url: null, error: null, loading: false }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
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

it.each(['= Cover\n\n', '[.section]\n== Section\n\n'])(
  'shows video-only hero content without requesting media: %s',
  async (header) => {
    const deck = await parseSlideDeck(`${header}video::dQw4w9WgXcQ[youtube]`);
    await act(async () => root.render(<SlideView deck={deck} index={0} documentDir="/deck" />));
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    expect(container.querySelector('iframe,video')).toBeNull();
    expect(localVideoUrl).not.toHaveBeenCalled();
  },
);

it('requires a fresh play action when navigating to another slide, even with the same video', async () => {
  const deck = await parseSlideDeck('== A\n\nvideo::dQw4w9WgXcQ[youtube]\n\n== B\n\nvideo::dQw4w9WgXcQ[youtube]');
  await act(async () => root.render(<SlideView deck={deck} index={0} documentDir={null} playback />));
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Play YouTube video"]')!.click());
  expect(container.querySelector('iframe')).not.toBeNull();
  await act(async () => root.render(<SlideView deck={deck} index={1} documentDir={null} playback />));
  expect(container.querySelector('iframe')).toBeNull();
});

it('shows browser-opening failures to the user', async () => {
  vi.mocked(openYoutubeVideo).mockRejectedValueOnce(new Error('denied'));
  const deck = await parseSlideDeck('== A\n\nvideo::dQw4w9WgXcQ[youtube]');
  await act(async () => root.render(<SlideView deck={deck} index={0} documentDir={null} playback />));
  await act(async () => container.querySelector<HTMLButtonElement>('.slide-video-external')!.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('denied');
});

it('shows local playback failures instead of a silent broken player', async () => {
  const deck = await parseSlideDeck('== A\n\nvideo::clip.mp4[]');
  await act(async () => root.render(<SlideView deck={deck} index={0} documentDir="/deck" playback />));
  await act(async () => container.querySelector('video')!.dispatchEvent(new Event('error')));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not play clip.mp4');
});
