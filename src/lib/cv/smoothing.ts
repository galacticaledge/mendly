/**
 * Temporal smoothing.
 *
 * Landmark positions jitter a few pixels between frames even when a person is
 * perfectly still, and that jitter turns into several degrees of angle noise.
 * Unsmoothed, a threshold sitting near the resting angle would be crossed back
 * and forth many times a second and the repetition counter would invent reps.
 *
 * An exponential moving average is enough, and has the property that matters
 * here: it needs one number of state, so it costs nothing per frame.
 *
 *     smoothed = alpha * current + (1 - alpha) * previous
 *
 * Alpha is how much the newest frame is worth. Lower is smoother but lags
 * behind the real movement, which shows up as reps being counted slightly late
 * and range of motion reading slightly short. 0.4 was chosen by watching arm
 * raises at 30fps: it removes the visible jitter while the counted rep still
 * lands when the arm does.
 */

export const DEFAULT_ALPHA = 0.4;

export class ExponentialSmoother {
  private value: number | null = null;

  constructor(private readonly alpha: number = DEFAULT_ALPHA) {}

  /** Feed a new reading and get the smoothed value back. */
  push(current: number): number {
    this.value = this.value === null ? current : this.alpha * current + (1 - this.alpha) * this.value;
    return this.value;
  }

  get current(): number | null {
    return this.value;
  }

  /**
   * Forget the history.
   *
   * Called when tracking has been lost for long enough that the person may
   * have moved somewhere else entirely; averaging across the gap would drag
   * the first good frames back towards a position that no longer exists.
   */
  reset(): void {
    this.value = null;
  }
}

/** Mean of a list, or 0 for an empty one. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
