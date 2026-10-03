import { describe, expect, it } from 'vitest';
import { createWheelStepper, slideForKey, WHEEL_STEP_PX } from './filmstripNavigation';

describe('slideForKey', () => {
  it('moves by one, by a page, or to either end, clamped to the deck', () => {
    expect(slideForKey('ArrowRight', 2, 10)).toBe(3);
    expect(slideForKey('ArrowDown', 2, 10)).toBe(3);
    expect(slideForKey('ArrowLeft', 2, 10)).toBe(1);
    expect(slideForKey('ArrowUp', 0, 10)).toBe(0);
    expect(slideForKey('PageDown', 7, 10)).toBe(9);
    expect(slideForKey('PageUp', 3, 10)).toBe(0);
    expect(slideForKey('Home', 5, 10)).toBe(0);
    expect(slideForKey('End', 5, 10)).toBe(9);
  });

  it('ignores other keys and empty decks', () => {
    expect(slideForKey('a', 2, 10)).toBeNull();
    expect(slideForKey('toString', 2, 10)).toBeNull();
    expect(slideForKey('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('createWheelStepper', () => {
  const sample = (deltaY: number, timeStamp: number, deltaMode = 0, deltaX = 0) => ({
    deltaX,
    deltaY,
    deltaMode,
    timeStamp,
  });

  it('accumulates small trackpad deltas into single steps', () => {
    const step = createWheelStepper();
    const results = [10, 10, 10, 10, 10, 10, 10, 10].map((delta, i) => step(sample(delta, i * 16)));
    expect(results.filter((value) => value === 1)).toHaveLength(2);
    expect(results.every((value) => value >= 0)).toBe(true);
  });

  it('moves one slide per coarse mouse notch, never skipping', () => {
    const step = createWheelStepper();
    expect(step(sample(400, 0))).toBe(1);
    expect(step(sample(400, 300))).toBe(1);
    expect(step(sample(-1, 600, 1))).toBe(-1);
  });

  it.each([1, -1])('does not turn a coarse notch into another step on a tiny tail (direction %s)', (direction) => {
    const step = createWheelStepper();
    expect(step(sample(direction * 120, 0))).toBe(direction);
    expect(step(sample(direction, 16))).toBe(0);
  });

  it.each([1, -1])('preserves only the true partial remainder (direction %s)', (direction) => {
    const step = createWheelStepper();
    expect(step(sample(direction * 125, 0))).toBe(direction);
    expect(step(sample(direction * 34, 16))).toBe(0);
    expect(step(sample(direction, 32))).toBe(direction);
  });

  it('uses horizontal scrolling when it dominates', () => {
    const step = createWheelStepper();
    expect(step(sample(2, 0, 0, -WHEEL_STEP_PX))).toBe(-1);
  });

  it('starts over after reversing or pausing', () => {
    const step = createWheelStepper();
    expect(step(sample(WHEEL_STEP_PX - 5, 0))).toBe(0);
    expect(step(sample(-10, 16))).toBe(0);
    expect(step(sample(WHEEL_STEP_PX - 5, 32))).toBe(0);
    expect(step(sample(WHEEL_STEP_PX - 5, 1000))).toBe(0);
  });
});
