import { expect, test } from 'vitest'
import { blePacket, encode, HELLO } from '@/lib/l20Midi'
import { BleMidiTransport, type BleLink } from './BleMidiTransport'
import type { MixerEvent } from './types'

test('works over any link: greets the L-20 and reports moves made on the desk', async () => {
  const written: number[][] = []
  let incoming: (bytes: Uint8Array) => void = () => {}
  const link: BleLink = {
    write: async (p) => void written.push([...p]),
    onData: (l) => (incoming = l),
    close: () => {},
  }
  const t = new BleMidiTransport(async () => link)
  const events: MixerEvent[] = []
  t.onEvent((e) => events.push(e))
  await t.connect()
  await new Promise((r) => setTimeout(r, 300))
  expect(written).toEqual(HELLO.map((m) => [...blePacket(m)]))
  const [msg] = encode({ type: 'channel', ch: 2, patch: { mute: true } })
  incoming(blePacket(msg!))
  expect(events).toEqual([{ type: 'channel', ch: 2, patch: { mute: true } }])
})
