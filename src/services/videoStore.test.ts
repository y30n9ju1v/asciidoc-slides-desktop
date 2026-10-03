import { beforeEach, expect, it, vi } from 'vitest';
import { readFile, stat } from '@tauri-apps/plugin-fs';
import { loadVideoData, localVideoUrl } from './videoStore';
import { youtubeEmbedUrl, youtubePowerPointUrl, youtubeWatchUrl } from './slideVideo';

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn(), stat: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

it.each(['../secret.mp4', '/tmp/secret.mp4', 'https://example.com/clip.mp4'])(
  'rejects unsafe runtime paths before any IO: %s',
  async (path) => {
    expect(await loadVideoData('/deck', path)).toHaveProperty('error');
    expect(() => localVideoUrl('/deck', path, null)).toThrow();
    expect(stat).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  },
);

it('revalidates IDs at every URL boundary', () => {
  for (const build of [youtubeEmbedUrl, youtubePowerPointUrl, youtubeWatchUrl]) {
    expect(() => build('../invalid?autoplay=1', null)).toThrow('Invalid YouTube');
  }
});
