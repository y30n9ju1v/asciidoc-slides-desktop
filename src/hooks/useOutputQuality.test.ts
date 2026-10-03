import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { deferred, renderHook } from '../test/renderHook';
import { useOutputQuality } from './useOutputQuality';
import { checkOutputQuality } from '../services/qualityCheckService';
import { parseSlideDeck } from '../services/slideDeckService';
import type { QualityIssue } from '../services/outputQuality';

vi.mock('../services/qualityCheckService');

it('hides a late check result after the document changes', async () => {
  let deck = await parseSlideDeck('== A\n\nText');
  const pending = deferred<QualityIssue[]>();
  vi.mocked(checkOutputQuality).mockReturnValueOnce(pending.promise);
  const hook = await renderHook(() => useOutputQuality(deck, '/deck'));
  let running!: Promise<void>;
  await act(async () => {
    running = hook.current.run('pdf');
  });
  deck = await parseSlideDeck('== B\n\nOther');
  await hook.rerender();
  await act(async () => {
    pending.resolve([{ severity: 'warning', slideIndex: 0, message: 'Old result' }]);
    await running;
  });
  expect(hook.current.result).toBeNull();
});

it('exposes errors and permits another check', async () => {
  const deck = await parseSlideDeck('== A\n\nText');
  vi.mocked(checkOutputQuality).mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce([]);
  const hook = await renderHook(() => useOutputQuality(deck, '/deck'));
  await act(async () => hook.current.run('pdf'));
  expect(hook.current.result?.issues[0].severity).toBe('error');
  await act(async () => hook.current.run('pdf'));
  expect(hook.current.result?.issues).toEqual([]);
});
