import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SlideDeck } from '../services/slideDeck';
import { parseSlideDeck } from '../services/slideDeckService';
import { deferred, renderHook } from '../test/renderHook';
import { useSlideDeck } from './useSlideDeck';

vi.mock('../services/slideDeckService');
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});
afterEach(() => vi.useRealTimers());
const deck = { slides: [] } as unknown as SlideDeck;

it('marks an edited source stale immediately, even before debounce runs', async () => {
  vi.mocked(parseSlideDeck).mockResolvedValue(deck);
  let source = 'A';
  const hook = await renderHook(() => useSlideDeck(source));
  await act(async () => vi.advanceTimersByTimeAsync(0));
  expect(hook.current.isStale).toBe(false);
  source = 'B';
  await hook.rerender();
  expect(hook.current).toMatchObject({ deck, isStale: true, isParsing: true });
  await act(async () => vi.advanceTimersByTimeAsync(180));
  expect(hook.current.isStale).toBe(false);
});

it('never shows a prior document under the next document path, even for identical source', async () => {
  vi.mocked(parseSlideDeck).mockResolvedValue(deck);
  let id = 0;
  const hook = await renderHook(() => useSlideDeck('same source', id));
  await act(async () => vi.advanceTimersByTimeAsync(0));
  id++;
  await hook.rerender();
  expect(hook.current).toMatchObject({ deck: null, isStale: true });
});

it('keeps the last same-document preview on failure and rejects older results', async () => {
  vi.mocked(parseSlideDeck).mockResolvedValueOnce(deck);
  let source = 'A';
  const hook = await renderHook(() => useSlideDeck(source));
  await act(async () => vi.advanceTimersByTimeAsync(0));
  const older = deferred<SlideDeck>();
  vi.mocked(parseSlideDeck).mockReturnValueOnce(older.promise);
  source = 'B';
  await hook.rerender();
  await act(async () => vi.advanceTimersByTimeAsync(180));
  vi.mocked(parseSlideDeck).mockRejectedValueOnce(new Error('invalid source'));
  source = 'C';
  await hook.rerender();
  await act(async () => vi.advanceTimersByTimeAsync(180));
  await act(async () => older.resolve({ ...deck }));
  expect(hook.current).toMatchObject({ deck, isStale: true, isParsing: false });
  expect(hook.current.error).toContain('invalid source');
});
