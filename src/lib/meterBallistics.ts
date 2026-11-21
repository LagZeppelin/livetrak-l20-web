import { FADER_MIN } from './mixer'

/**
 * LED-chain ballistics for the meters: the L-20 only sends 3 dB steps a few times per second,
 * so the display rises quickly but smoothly and falls back slowly instead of jumping.
 */
export const ATTACK_MS = 15
export const RELEASE_DB_PER_S = 36

/** Next shown level (dBFS) after `dtMs`, moving from `shown` toward `target`. */
export function meterStep(shown: number, target: number, dtMs: number): number {
  if (target >= shown) return shown + (target - shown) * (1 - Math.exp(-dtMs / ATTACK_MS))
  return Math.max(target, FADER_MIN, shown - (RELEASE_DB_PER_S * dtMs) / 1000)
}
