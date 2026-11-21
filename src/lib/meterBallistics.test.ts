import { expect, test } from 'vitest'
import { meterStep } from './meterBallistics'

test('rises quickly but not in one jump', () => {
  const s = meterStep(-60, 0, 16)
  expect(s).toBeGreaterThan(-60)
  expect(s).toBeLessThan(0)
  let v = -60
  for (let i = 0; i < 15; i++) v = meterStep(v, 0, 16) // ~250 ms
  expect(v).toBeGreaterThan(-0.5)
})

test('falls slowly and never below the target', () => {
  expect(meterStep(0, -60, 100)).toBeCloseTo(-2.4)
  expect(meterStep(-10, -11, 1000)).toBe(-11)
  expect(meterStep(-59, -99, 1000)).toBe(-60)
})
