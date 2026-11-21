import { expect, test } from 'vitest'
import { meterStep, peakStep, PEAK_HOLD_MS } from './meterBallistics'

test('rises quickly but not in one jump', () => {
  const s = meterStep(-60, 0, 5)
  expect(s).toBeGreaterThan(-60)
  expect(s).toBeLessThan(0)
  let v = -60
  for (let i = 0; i < 6; i++) v = meterStep(v, 0, 16) // ~100 ms
  expect(v).toBeGreaterThan(-0.5)
})

test('falls slowly and never below the target', () => {
  expect(meterStep(0, -60, 100)).toBeCloseTo(-3.6)
  expect(meterStep(-10, -11, 1000)).toBe(-11)
  expect(meterStep(-59, -99, 1000)).toBe(-60)
})

test('peak holds, then falls to the level', () => {
  let p = peakStep({ db: -60, heldMs: 0 }, -3, 16)
  expect(p.db).toBe(-3)
  p = peakStep(p, -30, PEAK_HOLD_MS - 1)
  expect(p.db).toBe(-3)
  p = peakStep(p, -30, 1000)
  expect(p.db).toBeCloseTo(-23)
  expect(peakStep(p, -30, 10_000).db).toBe(-30)
})
