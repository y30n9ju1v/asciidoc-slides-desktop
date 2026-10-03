import type { SlideDeck } from './slideDeck';

/** The slide whose source starts at or before `line` - the one the cursor is in. */
export function slideIndexForLine(deck: SlideDeck, line: number): number {
  let found = 0;
  deck.slides.forEach((slide, index) => {
    if (slide.line !== null && slide.line <= line) found = index;
  });
  return found;
}
