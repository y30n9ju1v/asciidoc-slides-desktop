import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

export async function renderHook<T>(hook: () => T) {
  let current: T;
  function Probe() {
    current = hook();
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const rerender = async () => {
    await act(async () => root.render(createElement(Probe)));
  };
  cleanups.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });
  await rerender();
  return {
    get current() {
      return current;
    },
    rerender,
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
