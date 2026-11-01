import { expect, test } from 'vitest'
import { applyCommand, createMixer } from '@/lib/mixer'
import { channelGroups, linkCommand, mixLevel, sendLevel } from './mixView'

test('stereo pairs become one row named without L/R', () => {
  let m = createMixer()
  m = applyCommand(m, { type: 'channel', ch: 3, patch: { name: 'Keys L' } })
  m = applyCommand(m, { type: 'link', ch: 3, linked: true })
  const groups = channelGroups(m)
  expect(groups).toHaveLength(17) // 20 channels, pairs 3/4, 17/18, 19/20
  expect(groups[2]).toMatchObject({ ids: [3, 4], label: '03·04', name: 'Keys' })
})

test('link button unlinks, links right, else left, else nothing', () => {
  let m = createMixer()
  expect(linkCommand(m, 1)).toEqual({ type: 'link', ch: 1, linked: true })
  m = applyCommand(m, { type: 'link', ch: 1, linked: true })
  expect(linkCommand(m, 2)).toEqual({ type: 'link', ch: 2, linked: false })
  expect(linkCommand(m, 3)).toEqual({ type: 'link', ch: 3, linked: true })
  m = applyCommand(m, { type: 'link', ch: 3, linked: true })
  expect(linkCommand(m, 16)).toEqual({ type: 'link', ch: 15, linked: true })
  m = applyCommand(m, { type: 'link', ch: 15, linked: true })
  m = applyCommand(m, { type: 'link', ch: 5, linked: true })
  m = applyCommand(m, { type: 'link', ch: 7, linked: true })
  expect(linkCommand(m, 9)).toEqual({ type: 'link', ch: 9, linked: true })
})

test('send meter ignores the main fader and follows mute and the mix fader', () => {
  let m = createMixer()
  const meters = Array(22).fill(-20)
  m = applyCommand(m, { type: 'channel', ch: 1, patch: { fader: -10 } })
  m = applyCommand(m, { type: 'send', ch: 1, mix: 'A', patch: { level: -5 } })
  expect(sendLevel(m, meters, 1, 'A')).toBe(-15) // -20 meter, +10 back before the main fader, -5 send
  m = applyCommand(m, { type: 'bus', mix: 'A', patch: { fader: -3 } })
  expect(mixLevel(m, meters, 'A')).toBe(-18)
  m = applyCommand(m, { type: 'channel', ch: 1, patch: { mute: true } })
  expect(sendLevel(m, meters, 1, 'A')).toBe(-99)
  expect(mixLevel(m, [], 'A')).toBeUndefined()
})
