import { describe, expect, it } from 'vitest';
import { clampEditorFraction, editorFractionAt } from './editorLayout';

describe('editor sizing', () => {
  it('does not jump when dragging with an explorer or workspace offset', () => {
    expect(editorFractionAt(220 + 1440 * 0.42, 220, 1440)).toBeCloseTo(0.42);
    expect(editorFractionAt(100 + 220 + 1440 * 0.42, 320, 1440)).toBeCloseTo(0.42);
    expect(editorFractionAt(1440 * 0.42, 0, 1440)).toBeCloseTo(0.42);
  });
  it('keeps a usable preview at the minimum window width', () => {
    const fraction = clampEditorFraction(0.75, 960, 220);
    expect(960 - 220 - 7 - fraction * 960).toBeGreaterThanOrEqual(240);
    expect(editorFractionAt(-50, 220, 960)).toBe(0.2);
  });
});
