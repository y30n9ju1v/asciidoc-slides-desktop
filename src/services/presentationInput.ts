const CONTROLS = 'button, video[controls], iframe, a[href], input, select, textarea, [tabindex="0"]';

/** DOM boundary: allow player controls to own their keys while keeping Tab in the presentation. */
export function handlePresentationControlKey(event: KeyboardEvent, root: HTMLElement | null): boolean {
  if (!root || !(event.target instanceof Element) || !root.contains(event.target)) return false;
  if (event.key === 'Escape') return false;
  if (event.key !== 'Tab') return event.target.closest(CONTROLS) !== null;
  event.preventDefault();
  event.stopPropagation();
  const controls = Array.from(root.querySelectorAll<HTMLElement>(CONTROLS)).filter(
    (element) => !element.hasAttribute('disabled') && !element.hidden,
  );
  const active = controls.indexOf(document.activeElement as HTMLElement);
  const current = active < 0 && event.shiftKey ? 0 : active;
  const next = (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
  (controls[next] ?? root).focus();
  return true;
}
