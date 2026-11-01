import { afterEach, expect, test, vi } from 'vitest'
import { MockMixerTransport } from './MockMixerTransport'
import type { MixerEvent } from './types'

afterEach(() => {
  vi.useRealTimers()
})

test('sends a snapshot on connect, then meters and a running recorder clock', async () => {
  vi.useFakeTimers()
  const transport = new MockMixerTransport()
  const events: MixerEvent[] = []
  transport.onEvent((e) => events.push(e))

  await transport.connect()
  const first = events[0]
  expect(first.type === 'snapshot' && first.mixer.channels[0].name).toBe('Guitar')

  transport.send({ type: 'recorder', patch: { state: 'recording' } })
  vi.advanceTimersByTime(2000)
  await transport.disconnect()

  const meters = events.find((e) => e.type === 'meters')
  expect(meters?.type === 'meters' && meters.levels).toHaveLength(22)
  expect(events.filter((e) => e.type === 'recorder').at(-1)).toEqual({
    type: 'recorder',
    patch: { position: 2 },
  })
})

test('scene recall restores the saved state', async () => {
  const transport = new MockMixerTransport()
  const events: MixerEvent[] = []
  transport.onEvent((e) => events.push(e))

  transport.send({ type: 'scene', action: 'save', slot: 3, name: 'Probe' })
  transport.send({ type: 'channel', ch: 1, patch: { fader: -20 } })
  transport.send({ type: 'scene', action: 'recall', slot: 3 })

  const snapshot = events.at(-1)
  if (snapshot?.type !== 'snapshot') throw new Error('expected snapshot')
  expect(snapshot.mixer.scene).toBe(3)
  expect(snapshot.mixer.channels[0].fader).toBe(0)
  expect(snapshot.mixer.sceneNames[2]).toBe('Probe')
})
