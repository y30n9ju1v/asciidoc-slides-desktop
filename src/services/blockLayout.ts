import type { BlockLayout } from './slideDeck';
import { parseCodeHighlights } from './codeHighlight';

/** Width of the content-slide body in logical pixels (1280 - 2 x 58 padding). */
const BODY_WIDTH_PX = 1164;

const ROLE_SCALES: Record<string, number> = {
  tiny: 0.5,
  smaller: 0.65,
  small: 0.8,
  lead: 1.25,
  large: 1.2,
  larger: 1.4,
  huge: 1.7,
};
const ROLE_ALIGNS: Record<string, BlockLayout['align']> = { left: 'left', center: 'center', right: 'right' };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** "60%" -> 0.6; a bare number is logical pixels of the 1280-wide slide (image `width=400`). */
function parseWidth(value: unknown): number | null {
  const text = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(text);
  if (percent) return clamp(Number(percent[1]) / 100, 0.1, 1);
  const pixels = /^(\d+(?:\.\d+)?)(px)?$/.exec(text);
  return pixels ? clamp(Number(pixels[1]) / BODY_WIDTH_PX, 0.1, 1) : null;
}

function parseScale(value: unknown): number | null {
  const percent = typeof value === 'string' ? /^(\d+(?:\.\d+)?)%$/.exec(value.trim()) : null;
  return percent ? clamp(Number(percent[1]) / 100, 0.4, 2) : null;
}

function lastMatch<T>(roles: string[], table: Record<string, T>): T | null {
  const role = [...roles].reverse().find((name) => Object.prototype.hasOwnProperty.call(table, name));
  return role ? table[role] : null;
}

/** Reads `[.small]`/`[.center]`/`[width=60%]`/`[font-size=80%]` from a block; null when none apply. */
export function blockLayoutOf(roles: string[], attributes: Record<string, unknown> | undefined): BlockLayout | null {
  const layout: BlockLayout = {
    width: parseWidth(attributes?.width),
    scale: parseScale(attributes?.['font-size']) ?? lastMatch(roles, ROLE_SCALES),
    align: lastMatch(roles, ROLE_ALIGNS),
  };
  const highlights = parseCodeHighlights(attributes?.highlight);
  if (highlights.length) layout.codeHighlights = highlights;
  return layout.width === null && layout.scale === null && layout.align === null && !highlights.length ? null : layout;
}
