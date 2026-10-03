/** How far PageUp/PageDown jump in the filmstrip. */
export const FILMSTRIP_PAGE = 5;

/** Wheel distance (pixels) that moves one slide. */
export const WHEEL_STEP_PX = 40;

/** Gap after which a new wheel gesture starts from zero. */
const WHEEL_IDLE_MS = 250;

const clampIndex = (index: number, count: number) => Math.max(0, Math.min(count - 1, index));

/** The slide a navigation key moves to, or null when the key is not a navigation key. */
export function slideForKey(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  const targets: Record<string, number> = {
    ArrowRight: index + 1,
    ArrowDown: index + 1,
    ArrowLeft: index - 1,
    ArrowUp: index - 1,
    PageDown: index + FILMSTRIP_PAGE,
    PageUp: index - FILMSTRIP_PAGE,
    Home: 0,
    End: count - 1,
  };
  return Object.prototype.hasOwnProperty.call(targets, key) ? clampIndex(targets[key], count) : null;
}

export interface WheelSample {
  deltaX: number;
  deltaY: number;
  /** WheelEvent.deltaMode: 0 pixels, 1 lines, 2 pages. */
  deltaMode: number;
  timeStamp: number;
}

/**
 * Turns wheel events into slide steps. Trackpads send many small deltas and
 * mice send few large ones, so distance accumulates until it crosses
 * `WHEEL_STEP_PX`; each event moves at most one slide so a single coarse
 * notch never skips slides. Reversing direction or pausing starts over.
 */
export function createWheelStepper(stepPx = WHEEL_STEP_PX) {
  let accumulated = 0;
  let lastTime = -Infinity;
  return (sample: WheelSample): -1 | 0 | 1 => {
    const dominant = Math.abs(sample.deltaX) > Math.abs(sample.deltaY) ? sample.deltaX : sample.deltaY;
    const delta = sample.deltaMode === 0 ? dominant : Math.sign(dominant) * stepPx;
    const reversed = Math.sign(delta) !== 0 && Math.sign(delta) !== Math.sign(accumulated);
    if (sample.timeStamp - lastTime > WHEEL_IDLE_MS || reversed) accumulated = 0;
    lastTime = sample.timeStamp;
    accumulated += delta;
    if (Math.abs(accumulated) < stepPx) return 0;
    const step = accumulated > 0 ? 1 : -1;
    // Discard extra whole steps from a coarse notch, retaining only the true
    // fractional distance. A 120px notch must not leave a 39px near-step.
    accumulated %= stepPx;
    return step;
  };
}
