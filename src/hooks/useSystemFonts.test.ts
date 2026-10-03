import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { renderHook } from '../test/renderHook';
import { listSystemFonts } from '../services/systemFontAdapter';
import { useSystemFonts } from './useSystemFonts';

vi.mock('../services/systemFontAdapter');

it('loads installed families without requesting arbitrary filesystem paths', async () => {
  vi.mocked(listSystemFonts).mockResolvedValue(['AppleMyungjo', 'Menlo']);
  const hook = await renderHook(() => useSystemFonts(true));
  await act(async () => {});
  expect(hook.current).toEqual({ fonts: ['AppleMyungjo', 'Menlo'], error: null, loading: false });
  expect(listSystemFonts).toHaveBeenCalledWith();
});

it('reports scan failures instead of displaying a made-up font list', async () => {
  vi.mocked(listSystemFonts).mockRejectedValue(new Error('not available'));
  const hook = await renderHook(() => useSystemFonts(true));
  await act(async () => {});
  expect(hook.current.fonts).toEqual([]);
  expect(hook.current.error).toContain('not available');
  expect(hook.current.loading).toBe(false);
});
