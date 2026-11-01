import { expect, test } from 'vitest'
import { applyCommand, createMixer, FADER_MIN } from './mixer'

test('defaults: 20 channels, 17/18 and 19/20 linked, 15-band GEQ', () => {
  const m = createMixer()
  expect(m.channels).toHaveLength(20)
  expect(m.channels.map((c) => c.linkedWith).slice(15)).toEqual([null, 18, 17, 20, 19])
  expect(m.main.geq).toHaveLength(15)
})

test('clamps values and ignores unknown targets', () => {
  let m = createMixer()
  m = applyCommand(m, { type: 'channel', ch: 1, patch: { fader: -200, pan: 150 } })
  m = applyCommand(m, { type: 'eq', ch: 1, patch: { high: 40 } })
  expect(m.channels[0]).toMatchObject({ fader: FADER_MIN, pan: 100, eq: { high: 15 } })
  expect(applyCommand(m, { type: 'channel', ch: 21, patch: { mute: true } })).toBe(m)
  expect(applyCommand(m, { type: 'geq', band: 15, gain: 3 })).toBe(m)
})

test('links only free adjacent channels; fixed stereo pairs stay linked', () => {
  let m = applyCommand(createMixer(), { type: 'link', ch: 2, linked: true })
  expect([m.channels[1].linkedWith, m.channels[2].linkedWith]).toEqual([3, 2])
  expect(applyCommand(m, { type: 'link', ch: 3, linked: true })).toBe(m)
  expect(applyCommand(m, { type: 'link', ch: 16, linked: true })).toBe(m)
  expect(applyCommand(m, { type: 'link', ch: 18, linked: false })).toBe(m)
  m = applyCommand(m, { type: 'link', ch: 3, linked: false })
  expect([m.channels[1].linkedWith, m.channels[2].linkedWith]).toEqual([null, null])
})

test('send pre/post and bus patches', () => {
  let m = applyCommand(createMixer(), {
    type: 'send',
    ch: 4,
    mix: 'C',
    patch: { level: -5 },
  })
  m = applyCommand(m, { type: 'bus', mix: 'main', patch: { fader: -3, effect: 9 } })
  m = applyCommand(m, { type: 'bus', mix: 'fx2', patch: { effect: 12, params: [120, -5] } })
  expect(m.channels[3].sends.C).toEqual({ level: -5 })
  expect(m.main).not.toHaveProperty('effect')
  expect(m.main.fader).toBe(-3)
  expect(m.fx.fx2).toMatchObject({ effect: 9, params: [100, 0] })
})

test('names and low cut stay within the hardware limits', () => {
  let m = applyCommand(createMixer(), { type: 'channel', ch: 1, patch: { name: 'Lead Vocals' } })
  m = applyCommand(m, { type: 'eq', ch: 1, patch: { lowCut: true, lowCutHz: 1000 } })
  m = applyCommand(m, { type: 'eq', ch: 2, patch: { lowCutHz: 10 } })
  expect(m.channels[0].name).toBe('Lead Voc')
  expect(m.channels[0].eq).toMatchObject({ lowCut: true, lowCutHz: 600 })
  expect(m.channels[1].eq.lowCutHz).toBe(40)
})
