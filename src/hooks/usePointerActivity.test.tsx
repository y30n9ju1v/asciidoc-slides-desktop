import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { POINTER_IDLE_MS, usePointerActivity } from './usePointerActivity';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const active = usePointerActivity(ref);
  return <div ref={ref} data-active={active} />;
}

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.useRealTimers();
  document.body.replaceChildren();
});

async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
  return container.firstElementChild as HTMLElement;
}

it('extends activity from the most recent movement, not the first movement', async () => {
  const element = await mount();
  expect(element.dataset.active).toBe('false');
  await act(async () => element.dispatchEvent(new Event('pointermove')));
  expect(element.dataset.active).toBe('true');
  await act(async () => vi.advanceTimersByTime(POINTER_IDLE_MS - 1));
  await act(async () => element.dispatchEvent(new Event('pointermove')));
  await act(async () => vi.advanceTimersByTime(1));
  expect(element.dataset.active).toBe('true');
  await act(async () => vi.advanceTimersByTime(POINTER_IDLE_MS - 1));
  expect(element.dataset.active).toBe('false');
});

it('removes movement listeners and the pending timer on unmount', async () => {
  const element = await mount();
  await act(async () => element.dispatchEvent(new MouseEvent('mousemove')));
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  element.dispatchEvent(new Event('pointermove'));
  element.dispatchEvent(new MouseEvent('mousemove'));
  expect(vi.getTimerCount()).toBe(0);
});
