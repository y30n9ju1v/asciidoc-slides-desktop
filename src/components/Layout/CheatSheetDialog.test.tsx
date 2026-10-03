import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CheatSheetDialog } from './CheatSheetDialog';
import { CHEAT_SHEET_ENTRIES } from './cheatSheetEntries';
import { parseSlideDeck } from '../../services/slideDeckService';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
});

it('shows selectable syntax examples and closes with Escape', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const onOpenChange = vi.fn();
  await act(async () => root.render(<CheatSheetDialog open onOpenChange={onOpenChange} />));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('슬라이드 글자 크기');
  expect(document.querySelectorAll('pre code')).toHaveLength(CHEAT_SHEET_ENTRIES.length);
  expect(document.body.textContent).toContain('첫 번째 줄 +');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it.each(CHEAT_SHEET_ENTRIES)('parses the $title example without errors', async ({ code }) => {
  const deck = await parseSlideDeck(code);
  expect(deck.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
});
