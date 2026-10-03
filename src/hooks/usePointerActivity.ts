import { useEffect, useState, type RefObject } from 'react';

/** How long the pointer must rest before presentation chrome hides again. */
export const POINTER_IDLE_MS = 2000;

/**
 * True while the mouse has moved over `ref` within the last `idleMs`.
 * Presentation chrome (the exit button, the cursor) shows only then, so the
 * audience sees just the slide while the presenter is not using the mouse.
 */
export function usePointerActivity(ref: RefObject<HTMLElement | null>, idleMs = POINTER_IDLE_MS): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let timer: number | undefined;
    const onMove = () => {
      setActive(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setActive(false), idleMs);
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('mousemove', onMove);
    return () => {
      window.clearTimeout(timer);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('mousemove', onMove);
    };
  }, [ref, idleMs]);
  return active;
}
