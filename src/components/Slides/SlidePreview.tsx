import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, StickyNote } from 'lucide-react';
import { createWheelStepper, slideForKey } from '../../services/filmstripNavigation';
import type { SlideDeck } from '../../services/slideDeck';
import { SlideView } from './SlideView';

interface SlidePreviewProps {
  deck: SlideDeck | null;
  parseError: string | null;
  isParsing?: boolean;
  currentIndex: number;
  documentDir: string | null;
  onSelect: (index: number) => void;
}

/** Largest 16:9 width that fits the stage in both dimensions. */
function useStageWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // clientWidth/Height include padding; size the slide to the content box
    // so the stage keeps equal margins on every side.
    const update = () => {
      const style = getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setWidth(Math.max(0, Math.min(width, (height * 16) / 9)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function ParseFailure({ message, hasPreview }: { message: string; hasPreview: boolean }) {
  return (
    <div role="alert" className="flex gap-1.5 text-[var(--destructive)]">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>
        Preview could not update. {hasPreview && 'Showing the last successful preview. '}
        {message}
      </span>
    </div>
  );
}

function PreviewMessages({
  deck,
  parseError,
  notes,
  isParsing,
}: {
  deck: SlideDeck | null;
  parseError: string | null;
  notes: string;
  isParsing?: boolean;
}) {
  const warnings = deck?.diagnostics ?? [];
  if (!notes && warnings.length === 0 && !parseError && !isParsing) return null;
  return (
    <div className="mx-5 mb-3 max-h-28 shrink-0 space-y-1.5 overflow-y-auto text-xs text-[var(--text-muted)]">
      {isParsing && <div role="status">Updating preview…</div>}
      {parseError && <ParseFailure message={parseError} hasPreview={deck !== null} />}
      {warnings.map((warning, i) => (
        <div key={i} className="flex gap-1.5 text-[var(--color-warning)]">
          <AlertTriangle className="size-3.5 shrink-0" />
          {warning.severity === 'error' ? 'Error: ' : 'Warning: '}
          {warning.location.line ? `Line ${warning.location.line}: ` : ''}
          {warning.message}
        </div>
      ))}
      {notes && (
        <div className="flex gap-1.5 whitespace-pre-wrap" aria-label="Speaker notes">
          <StickyNote className="mt-0.5 size-3.5 shrink-0" />
          <span>{notes}</span>
        </div>
      )}
    </div>
  );
}

interface FilmstripProps {
  deck: SlideDeck | null;
  index: number;
  documentDir: string | null;
  onSelect: (index: number) => void;
}

/**
 * Thumbnail strip for quick review: arrow keys, Page Up/Down, and Home/End
 * move the selection when the strip has focus (only the selected thumbnail
 * is in the Tab order), and the mouse wheel or trackpad over the strip steps
 * through slides instead of scrolling it.
 */
function Filmstrip({ deck, index, documentDir, onSelect }: FilmstripProps) {
  const filmstripRef = useRef<HTMLDivElement>(null);
  const count = deck?.slides.length ?? 0;
  const latest = useRef({ index, count, onSelect });
  useLayoutEffect(() => {
    latest.current = { index, count, onSelect };
  });

  // Keep the selected thumbnail visible, and keep focus on it while the user navigates the strip.
  useEffect(() => {
    const strip = filmstripRef.current;
    const item = strip?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    item?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (item && strip?.contains(document.activeElement)) item.focus({ preventScroll: true });
  }, [index]);

  // Native listener: React's wheel handler is passive and cannot stop the strip from scrolling.
  useEffect(() => {
    const strip = filmstripRef.current;
    if (!strip) return;
    const step = createWheelStepper();
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return; // pinch-zoom gestures
      event.preventDefault();
      const direction = step(event);
      const { index: current, count: total, onSelect: select } = latest.current;
      const next = Math.max(0, Math.min(total - 1, current + direction));
      if (direction !== 0 && next !== current) {
        // Another wheel event can arrive before React commits this selection.
        latest.current.index = next;
        select(next);
      }
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = slideForKey(event.key, index, count);
    if (next === null) return;
    event.preventDefault();
    if (next !== index) onSelect(next);
  };

  return (
    <div
      ref={filmstripRef}
      className="flex h-[124px] shrink-0 items-center gap-3 overflow-x-auto border-t bg-[var(--bg-header)] px-4"
      role="listbox"
      aria-label="Slides"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
    >
      {deck?.slides.map((item, i) => (
        <button
          key={i}
          type="button"
          role="option"
          data-index={i}
          tabIndex={i === index ? 0 : -1}
          aria-selected={i === index}
          aria-current={i === index}
          aria-label={`Slide ${i + 1}: ${item.title || 'Untitled'}`}
          className="filmstrip-item"
          onClick={() => onSelect(i)}
        >
          <SlideView deck={deck} index={i} documentDir={documentDir} />
        </button>
      ))}
    </div>
  );
}

export function SlidePreview({ deck, parseError, isParsing, currentIndex, documentDir, onSelect }: SlidePreviewProps) {
  const [stageRef, stageWidth] = useStageWidth();
  const slideCount = deck?.slides.length ?? 0;
  const index = Math.min(currentIndex, Math.max(0, slideCount - 1));
  const emptyMessage = deck ? 'Add a "== Title" line to create a slide.' : 'Loading…';

  return (
    <div className="pane-preview">
      <div ref={stageRef} className="grid min-h-0 flex-1 place-items-center p-5">
        {deck && slideCount > 0 ? (
          <div style={{ width: stageWidth }} className="overflow-hidden rounded-md shadow-lg">
            <SlideView deck={deck} index={index} documentDir={documentDir} />
          </div>
        ) : (
          <div className="pane-loading">{emptyMessage}</div>
        )}
      </div>
      <PreviewMessages
        deck={deck}
        parseError={parseError}
        isParsing={isParsing}
        notes={deck?.slides[index]?.notes ?? ''}
      />

      <Filmstrip deck={deck} index={index} documentDir={documentDir} onSelect={onSelect} />
    </div>
  );
}
