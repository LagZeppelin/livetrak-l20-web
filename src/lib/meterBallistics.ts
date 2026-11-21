import { FADER_MIN } from './mixer'

/**
 * LED-chain ballistics for the meters: the L-20 only sends 3 dB steps a few times per second,
 * so the display rises quickly but smoothly and falls back slowly instead of jumping.
 */
export const ATTACK_MS = 15
export const RELEASE_DB_PER_S = 36
/** Peak-hold line: stays this long at the highest level, then falls. */
export const PEAK_HOLD_MS = 1500
export const PEAK_RELEASE_DB_PER_S = 20

/** Next shown level (dBFS) after `dtMs`, moving from `shown` toward `target`. */
export function meterStep(shown: number, target: number, dtMs: number): number {
  if (target >= shown) return shown + (target - shown) * (1 - Math.exp(-dtMs / ATTACK_MS))
  return Math.max(target, FADER_MIN, shown - (RELEASE_DB_PER_S * dtMs) / 1000)
}

/** Next peak-hold state: jumps up with the level, holds PEAK_HOLD_MS, then falls to it. */
export function peakStep(
  peak: { db: number; heldMs: number },
  level: number,
  dtMs: number,
): { db: number; heldMs: number } {
  if (level >= peak.db) return { db: level, heldMs: 0 }
  const heldMs = peak.heldMs + dtMs
  if (heldMs < PEAK_HOLD_MS) return { db: peak.db, heldMs }
  return { db: Math.max(level, peak.db - (PEAK_RELEASE_DB_PER_S * dtMs) / 1000), heldMs }
}
