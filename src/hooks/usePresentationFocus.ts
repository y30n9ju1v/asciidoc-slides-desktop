import { useLayoutEffect, useRef } from 'react';

/** Presenter is portaled beside the app, allowing the complete background to be inert. */
export function usePresentationFocus() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const presenter = ref.current;
    if (!presenter) return;
    const previous = document.activeElement;
    const siblings = Array.from(document.body.children).filter((element) => element !== presenter);
    const priorInert = siblings.map((element) => element.hasAttribute('inert'));
    siblings.forEach((element) => element.setAttribute('inert', ''));
    const keepFocus = (event: FocusEvent) => {
      if (!presenter.contains(event.target as Node)) presenter.focus();
    };
    document.addEventListener('focusin', keepFocus);
    presenter.focus();
    return () => {
      document.removeEventListener('focusin', keepFocus);
      siblings.forEach((element, index) => {
        if (!priorInert[index]) element.removeAttribute('inert');
      });
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return ref;
}
