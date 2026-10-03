import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { setPresentationFullscreen } from '../../services/windowAdapter';
import type { SlideDeck } from '../../services/slideDeck';
import { SlideView } from './SlideView';
import { usePointerActivity } from '../../hooks/usePointerActivity';
import { usePresentationFocus } from '../../hooks/usePresentationFocus';
import { handlePresentationControlKey } from '../../services/presentationInput';

interface PresenterProps {
  deck: SlideDeck;
  startIndex: number;
  documentDir: string | null;
  onExit: (lastIndex: number) => void;
}

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n']);
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p']);

/** Full-window slideshow: arrows/space/click to advance, Esc to leave. */
export function Presenter({ deck, startIndex, documentDir, onExit }: PresenterProps) {
  const presenterRef = usePresentationFocus();
  const pointerActive = usePointerActivity(presenterRef);
  const [index, setIndex] = useState(startIndex);
  const last = deck.slides.length - 1;
  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(last, next))), [last]);

  useEffect(() => {
    void setPresentationFullscreen(true);
    return () => void setPresentationFullscreen(false);
  }, []);

  // Clicking into an embedded player (YouTube) moves keyboard focus into its
  // frame, where the arrow keys and Escape no longer reach the presenter. The
  // next click on the slide then only takes focus back instead of advancing.
  const playerFocused = useRef(false);
  useEffect(() => {
    const onBlur = () => {
      playerFocused.current = document.activeElement instanceof HTMLIFrameElement;
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (playerFocused.current) {
      playerFocused.current = false;
      presenterRef.current?.focus();
      return;
    }
    go(event.clientX < window.innerWidth / 4 ? index - 1 : index + 1);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (handlePresentationControlKey(event, presenterRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') onExit(index);
      else if (NEXT_KEYS.has(event.key)) go(index + 1);
      else if (PREVIOUS_KEYS.has(event.key)) go(index - 1);
      else if (event.key === 'Home') go(0);
      else if (event.key === 'End') go(last);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [go, index, last, onExit, presenterRef]);

  return createPortal(
    <div
      ref={presenterRef}
      tabIndex={-1}
      className="presenter"
      role="dialog"
      aria-modal="true"
      aria-description="Use arrow keys to navigate. Press Escape to exit the presentation."
      aria-label={`Slide ${index + 1} of ${deck.slides.length}`}
      data-pointer-active={pointerActive}
      onClick={onClick}
    >
      <button
        type="button"
        className="presenter-exit"
        onClick={(event) => {
          event.stopPropagation();
          onExit(index);
        }}
      >
        Exit presentation (Esc)
      </button>
      <div className="presenter-stage">
        <SlideView deck={deck} index={index} documentDir={documentDir} playback />
      </div>
    </div>,
    document.body,
  );
}
