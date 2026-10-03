import { act } from 'react';
import { useSyncExternalStore } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { readFile } from '@tauri-apps/plugin-fs';
import { clearImageCache, imageCacheRevision, loadImageResult, subscribeImages } from './imageStore';
import { deferred, renderHook } from '../test/renderHook';
import { useImageRefresh } from '../hooks/useImageRefresh';

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  clearImageCache();
});

it('re-reads replaced images and notifies mounted consumers', async () => {
  vi.mocked(readFile)
    .mockResolvedValueOnce(new Uint8Array([1]))
    .mockResolvedValueOnce(new Uint8Array([2, 3]));
  const hook = await renderHook(() => useSyncExternalStore(subscribeImages, imageCacheRevision));
  const previous = hook.current;
  expect((await loadImageResult('/deck', 'a.png')).blob?.size).toBe(1);
  await act(async () => clearImageCache());
  expect(hook.current).toBeGreaterThan(previous);
  expect((await loadImageResult('/deck', 'a.png')).blob?.size).toBe(2);
});

it('retries missing images after refresh and does not reuse in-flight old reads', async () => {
  vi.mocked(readFile).mockRejectedValueOnce(new Error('missing'));
  expect((await loadImageResult('/deck', 'a.png')).blob).toBeNull();
  const oldRead = deferred<Uint8Array>();
  vi.mocked(readFile)
    .mockReturnValueOnce(oldRead.promise)
    .mockResolvedValueOnce(new Uint8Array([3, 4]));
  clearImageCache();
  const old = loadImageResult('/deck', 'a.png');
  clearImageCache();
  const fresh = await loadImageResult('/deck', 'a.png');
  oldRead.resolve(new Uint8Array([1]));
  await old;
  expect(await loadImageResult('/deck', 'a.png')).toBe(fresh);
  expect(fresh.blob?.size).toBe(2);
});

it('invalidates images on app focus even without an explorer', async () => {
  await renderHook(useImageRefresh);
  const before = imageCacheRevision();
  window.dispatchEvent(new Event('focus'));
  expect(imageCacheRevision()).toBeGreaterThan(before);
});
