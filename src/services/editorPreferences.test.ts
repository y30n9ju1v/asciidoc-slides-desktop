import { expect, it } from 'vitest';
import { clampEditorFontSize } from './editorPreferences';

it.each([
  [11, 12],
  [23, 22],
  [15.6, 16],
  [undefined, 14],
  [null, 14],
  ['18', 14],
  [NaN, 14],
  [Infinity, 14],
])('normalizes %s to %s', (value, expected) => {
  expect(clampEditorFontSize(value)).toBe(expected);
});
