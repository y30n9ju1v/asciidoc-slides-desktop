import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SlideFontControl } from './SlideFontControl';

vi.mock('../../hooks/useSystemFonts', () => ({
  useSystemFonts: () => ({ fonts: ['Arial'], loading: false, error: null }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
});

it('shows the current family and updates the toolbar label when the value changes', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onChange = vi.fn();
  await act(async () => root.render(<SlideFontControl onChange={onChange} />));
  const trigger = container.querySelector('button')!;
  expect(trigger.textContent).toBe('System default');
  const family = 'Apple SD Gothic Neo';
  await act(async () => root.render(<SlideFontControl value={family} onChange={onChange} />));
  expect(trigger.textContent).toBe(family);
  expect(trigger.title).toBe(family);
  expect(trigger.getAttribute('aria-label')).toBe(`Slide font: ${family}`);
  await act(async () => trigger.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(`Current: ${family}`);
  const option = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Arial')!;
  await act(async () => option.click());
  expect(onChange).toHaveBeenCalledWith('Arial');
});
