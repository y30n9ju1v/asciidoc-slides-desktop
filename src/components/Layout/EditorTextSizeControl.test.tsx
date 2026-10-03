import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { EditorTextSizeControl } from './EditorTextSizeControl';
import { useAppPreferences } from '../../hooks/useAppPreferences';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
const key = 'asciidoc-slides:preferences';

function PreferencesControl() {
  const [preferences, update] = useAppPreferences();
  return (
    <EditorTextSizeControl
      fontSize={preferences.editorFontSize}
      onChange={(editorFontSize) => update({ editorFontSize })}
    />
  );
}

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<PreferencesControl />));
  return container;
}

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  localStorage.clear();
  delete document.documentElement.dataset.colorMode;
});

it('adjusts by one pixel, persists, and restores after remount', async () => {
  const container = await mount();
  expect(container.textContent).toBe('14px');
  await act(async () =>
    container.querySelector<HTMLButtonElement>('[aria-label="Increase editor text size"]')!.click(),
  );
  expect(container.textContent).toBe('15px');
  expect(JSON.parse(localStorage.getItem(key)!).editorFontSize).toBe(15);
  await act(async () => root.unmount());
  const restored = await mount();
  expect(restored.textContent).toBe('15px');
  await act(async () => restored.querySelector<HTMLButtonElement>('[aria-label="Decrease editor text size"]')!.click());
  expect(restored.textContent).toBe('14px');
});

it.each([
  [10, '12px', 'Decrease'],
  [24, '22px', 'Increase'],
] as const)('clamps legacy size %s and disables its boundary button', async (stored, label, direction) => {
  localStorage.setItem(key, JSON.stringify({ editorFontSize: stored, vimMode: true }));
  const container = await mount();
  expect(container.textContent).toBe(label);
  expect(container.querySelector<HTMLButtonElement>(`[aria-label="${direction} editor text size"]`)!.disabled).toBe(
    true,
  );
  expect(JSON.parse(localStorage.getItem(key)!).vimMode).toBe(true);
});
