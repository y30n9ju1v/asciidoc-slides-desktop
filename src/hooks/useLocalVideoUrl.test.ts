import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { deferred, renderHook } from '../test/renderHook';
import { localVideoUrl } from '../services/videoStore';
import { useLocalVideoUrl } from './useLocalVideoUrl';

vi.mock('../services/videoStore', () => ({ localVideoUrl: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

it('does not reuse an old video URL after changing documents', async () => {
  const old = deferred<string>();
  vi.mocked(localVideoUrl).mockReturnValueOnce(old.promise).mockResolvedValueOnce('asset://new');
  let folder = '/old';
  const hook = await renderHook(() => useLocalVideoUrl(folder, 'clip.mp4', null));
  folder = '/new';
  await hook.rerender();
  expect(hook.current.url).toBe('asset://new');
  await act(async () => old.resolve('asset://old'));
  expect(hook.current.url).toBe('asset://new');
});

it('exposes native path rejection without returning a media URL', async () => {
  vi.mocked(localVideoUrl).mockRejectedValueOnce(new Error('outside the deck'));
  const hook = await renderHook(() => useLocalVideoUrl('/deck', 'escape.mp4', null));
  expect(hook.current).toMatchObject({ url: null, error: expect.stringContaining('outside the deck') });
});
