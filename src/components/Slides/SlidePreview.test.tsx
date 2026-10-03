import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { SlidePreview } from './SlidePreview';
import { parseSlideDeck } from '../../services/slideDeckService';
import type { SlideDeck } from '../../services/slideDeck';

vi.mock('./SlideView', () => ({ SlideView: ({ index }: { index: number }) => <div>Slide {index + 1}</div> }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

let root: Root;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
});

async function renderPreview(deck: SlideDeck, onSelect = vi.fn()) {
  function Harness() {
    const [index, setIndex] = useState(0);
    return (
      <SlidePreview
        deck={deck}
        parseError={null}
        isParsing={false}
        currentIndex={index}
        documentDir={null}
        onSelect={(next) => {
          onSelect(next);
          setIndex(next);
        }}
      />
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
  const strip = document.querySelector<HTMLElement>('[role="listbox"]')!;
  const selected = () => strip.querySelector('[aria-selected="true"]')!.getAttribute('data-index');
  return { strip, selected, onSelect };
}

const wheel = (deltaY: number) => new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });

it('reviews slides with arrow keys, keeping focus on the selected thumbnail', async () => {
  const { strip, selected } = await renderPreview(await parseSlideDeck('== A\n\n== B\n\n== C'));
  const options = strip.querySelectorAll<HTMLElement>('[role="option"]');
  expect([...options].map((option) => option.tabIndex)).toEqual([0, -1, -1]);
  options[0].focus();
  await act(async () => options[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(selected()).toBe('1');
  expect(document.activeElement).toBe(options[1]);
  await act(async () => options[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
  expect(selected()).toBe('2');
  await act(async () => options[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  expect(selected()).toBe('2');
});

it('steps through slides with the wheel instead of scrolling the strip', async () => {
  const { strip, selected } = await renderPreview(await parseSlideDeck('== A\n\n== B\n\n== C'));
  const down = wheel(120);
  await act(async () => strip.dispatchEvent(down));
  expect(down.defaultPrevented).toBe(true);
  expect(selected()).toBe('1');
  await act(async () => strip.dispatchEvent(wheel(-120)));
  expect(selected()).toBe('0');
  await act(async () => strip.dispatchEvent(wheel(-120)));
  expect(selected()).toBe('0');
});

it('keeps every wheel step received before React commits, including reversals and boundaries', async () => {
  const { strip, selected, onSelect } = await renderPreview(await parseSlideDeck('== A\n\n== B\n\n== C'));
  await act(async () => {
    strip.dispatchEvent(wheel(40));
    strip.dispatchEvent(wheel(40));
  });
  expect(selected()).toBe('2');
  expect(onSelect.mock.calls.map(([index]) => index)).toEqual([1, 2]);
  onSelect.mockClear();
  await act(async () => {
    strip.dispatchEvent(wheel(40)); // already at the last slide
    strip.dispatchEvent(wheel(-40));
    strip.dispatchEvent(wheel(-40));
    strip.dispatchEvent(wheel(-40)); // already at the first slide
    strip.dispatchEvent(wheel(40));
  });
  expect(selected()).toBe('1');
  expect(onSelect.mock.calls.map(([index]) => index)).toEqual([1, 0, 1]);
});
