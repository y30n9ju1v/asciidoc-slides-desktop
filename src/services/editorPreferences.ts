/** Same editor text-size policy as AsciiDoc Pages; independent of slide typography. */
export const MIN_EDITOR_FONT_SIZE = 12;
export const MAX_EDITOR_FONT_SIZE = 22;
export const DEFAULT_EDITOR_FONT_SIZE = 14;

export function clampEditorFontSize(size: unknown): number {
  if (typeof size !== 'number' || !Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE;
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(size)));
}
