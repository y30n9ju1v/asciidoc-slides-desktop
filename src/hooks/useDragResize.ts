import { useEffect, useRef } from 'react';

/**
 * Wires up pointer-driven resizing for mouse, trackpad, Apple Pencil, and
 * touch. `onDrag` is read fresh at drag-start time, so it always sees the
 * state from the latest render without continually re-registering handlers.
 */
export function useDragResize(onDrag: (moveEvent: MouseEvent) => void) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    cleanup.current?.();
    event.preventDefault();
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    const previous = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    target.setPointerCapture(pointerId);

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      onDrag(moveEvent);
    };

    const finishDrag = () => {
      document.body.style.cursor = previous.cursor;
      document.body.style.userSelect = previous.userSelect;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      target.removeEventListener('lostpointercapture', finishDrag);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      cleanup.current = null;
    };

    const onPointerEnd = (endEvent: PointerEvent) => {
      if (endEvent.pointerId === pointerId) finishDrag();
    };
    cleanup.current = finishDrag;

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    target.addEventListener('lostpointercapture', finishDrag);
  };

  return startDrag;
}
