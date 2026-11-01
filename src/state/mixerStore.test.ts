import { beforeAll, expect, test } from 'vitest'
import { useMixerStore } from './mixerStore'

const store = useMixerStore.getState
const ch = (id: number) => store().mixer.channels[id - 1]

beforeAll(async () => {
  await store().connect() // loads the demo mixer: 3/4, 5/6, 7/8 linked
  await store().disconnect()
})

test('linked channels move together; pan is mirrored, name stays', () => {
  store().dispatch({
    type: 'channel',
    ch: 3,
    patch: { fader: -8, mute: true, pan: -40, name: 'X' },
  })
  expect(ch(4)).toMatchObject({ fader: -8, mute: true, pan: 40, name: 'Keys R' })
  expect(ch(3).name).toBe('X')

  store().dispatch({ type: 'eq', ch: 4, patch: { lowCut: true } })
  store().dispatch({ type: 'send', ch: 4, mix: 'A', patch: { level: -6 } })
  expect(ch(3).eq.lowCut).toBe(true)
  expect(ch(3).sends.A).toEqual({ level: -6 })
})

test('unlinked channels stay independent', () => {
  store().dispatch({ type: 'channel', ch: 1, patch: { fader: -15 } })
  expect(ch(2).fader).toBe(-3) // demo value for Bass
})

test('phone channel selection is sorted and toggles', () => {
  store().toggleVisible(7)
  store().toggleVisible(1)
  expect(store().visibleChannels).toEqual([1, 7])
  store().toggleVisible(7)
  expect(store().visibleChannels).toEqual([1])
})
