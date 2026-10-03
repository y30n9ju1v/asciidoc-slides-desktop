import { act, type PointerEvent as ReactPointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useDragResize } from './useDragResize';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('ignores other pointers and restores styles and listeners when unmounted mid-drag', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const onDrag = vi.fn();
  let start!: ReturnType<typeof useDragResize>;
  function Probe() {
    start = useDragResize(onDrag);
    return null;
  }
  const target = document.createElement('div');
  target.setPointerCapture = vi.fn();
  target.hasPointerCapture = () => true;
  target.releasePointerCapture = vi.fn();
  const initialCursor = document.body.style.cursor;
  const initialSelect = document.body.style.userSelect;
  const move = (pointerId: number) => window.dispatchEvent(Object.assign(new Event('pointermove'), { pointerId }));
  try {
    document.body.style.cursor = 'crosshair';
    document.body.style.userSelect = 'text';
    await act(async () => root.render(<Probe />));
    start({
      button: 0,
      pointerId: 1,
      currentTarget: target,
      preventDefault: vi.fn(),
    } as unknown as ReactPointerEvent<HTMLElement>);
    move(2);
    expect(onDrag).not.toHaveBeenCalled();
    move(1);
    expect(onDrag).toHaveBeenCalledOnce();
    await act(async () => root.render(null));
    expect(document.body.style.cursor).toBe('crosshair');
    expect(document.body.style.userSelect).toBe('text');
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
    move(1);
    expect(onDrag).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    document.body.style.cursor = initialCursor;
    document.body.style.userSelect = initialSelect;
  }
});
