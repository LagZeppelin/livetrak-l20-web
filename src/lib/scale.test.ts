import { expect, test } from 'vitest'
import { createMixer } from './mixer'
import { dbToPos, eqResponse, formatDb, formatPan, formatTime, posToDb } from './scale'

test('fader taper round-trips and clamps', () => {
  for (const db of [10, 2, 0, -8, -20, -42.5, -60]) expect(posToDb(dbToPos(db))).toBe(db)
  expect(dbToPos(99)).toBe(0)
  expect(dbToPos(-99)).toBe(1)
  expect(posToDb(-1)).toBe(10)
  expect(posToDb(2)).toBe(-60)
})

test('formats values like the designs', () => {
  expect(formatDb(-8)).toBe('-8,0')
  expect(formatDb(-60)).toBe('-∞')
  expect(formatPan(-30)).toBe('L30')
  expect(formatPan(0)).toBe('C')
  expect(formatTime(754)).toBe('00:12:34')
})

test('flat EQ is flat, boosts show up where they belong', () => {
  const eq = createMixer().channels[0].eq
  expect(eqResponse(eq, 1000)).toBe(0)
  const boosted = { ...eq, midGain: 6, midFreq: 800 }
  expect(eqResponse(boosted, 800)).toBeCloseTo(6)
  expect(eqResponse({ ...eq, lowCut: true }, 30)).toBeLessThan(-10)
  expect(eqResponse({ ...boosted, on: false }, 800)).toBe(0)
})
