import type { SafeAdmonition } from '../../packages/asciidoc-typst/typescript/src';

/**
 * Presentation rules the live preview and PPTX share, so both outputs decide
 * the same way. `slide_writer.rs` mirrors them for PDF.
 */

const SAFE_LINK_RE = /^(https?:\/\/|mailto:)/i;

/** Only web and mail links become clickable; anything else renders as plain text. */
export function isSafeLinkTarget(target: string): boolean {
  return SAFE_LINK_RE.test(target);
}

/** One group per column: contiguous, roughly even, always exactly `count` groups. */
export function splitIntoColumns<T>(items: T[], count: number): T[][] {
  if (items.length === 0) return Array.from({ length: count }, () => []);
  const size = Math.ceil(items.length / count);
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export const ADMONITION_LABELS: Record<SafeAdmonition['kind'], string> = {
  note: 'NOTE',
  tip: 'TIP',
  important: 'IMPORTANT',
  warning: 'WARNING',
  caution: 'CAUTION',
};
