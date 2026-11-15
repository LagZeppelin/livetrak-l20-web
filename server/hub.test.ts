import { expect, test } from 'vitest'
import type { MixerCommand } from '@/lib/mixer'
import type { HubMessage, IMixerTransport, MixerEvent } from '@/transport/types'
import { Hub, parseClientMessage, type Client } from './hub'

/** A fake L-20 that records what the hub sends and lets the test "move a fader on the desk". */
function fakeL20() {
  const sent: MixerCommand[] = []
  let listener: (e: MixerEvent) => void = () => {}
  const l20: IMixerTransport = {
    connect: async () => {},
    disconnect: async () => {},
    send: (c) => sent.push(c),
    onEvent: (l) => ((listener = l), () => {}),
  }
  return { l20, sent, desk: (e: MixerEvent) => listener(e) }
}

const browser = (): Client & { got: HubMessage[] } => {
  const got: HubMessage[] = []
  return { got, send: (m) => got.push(m) }
}
const say = (hub: Hub, c: Client, msg: object) => hub.receive(c, JSON.stringify(msg))

test('a change from the iPad reaches the L-20 and the other browsers, but is not echoed back', () => {
  const { l20, sent } = fakeL20()
  const hub = new Hub(l20)
  const ipad = browser()
  const phone = browser()
  hub.join(ipad)
  hub.join(phone)
  expect(ipad.got.map((m) => m.type)).toEqual(['snapshot', 'devices'])
  const cmd: MixerCommand = { type: 'channel', ch: 1, patch: { fader: -6 } }
  say(hub, ipad, { type: 'mixer', cmd })
  expect(sent).toEqual([cmd])
  expect(phone.got.at(-1)).toEqual(cmd)
  expect(ipad.got).toHaveLength(2)
  expect(hub.mixer.channels[0].fader).toBe(-6)
})

test('a phone may only move its own mix, unless the admin gave it the full desk', () => {
  const { l20, sent } = fakeL20()
  const hub = new Hub(l20)
  const ipad = browser()
  const phone = browser()
  hub.join(ipad)
  hub.join(phone)
  say(hub, phone, { type: 'hello', id: 'p1', phone: true })
  say(hub, phone, { type: 'device', cmd: { type: 'join', id: 'p1', name: 'Lisa' } })
  say(hub, phone, { type: 'device', cmd: { type: 'claim', id: 'p1', mix: 'C' } })
  // a phone can't act for another phone or hand itself rights
  say(hub, phone, { type: 'device', cmd: { type: 'claim', id: 'p2', mix: 'D' } })
  say(hub, phone, { type: 'device', cmd: { type: 'foh', id: 'p1', allowed: true } })
  expect(hub.devices).toEqual([{ id: 'p1', name: 'Lisa', mix: 'C', foh: false }])
  expect(ipad.got.at(-1)).toEqual({ type: 'devices', devices: hub.devices })

  say(hub, phone, { type: 'mixer', cmd: { type: 'send', ch: 1, mix: 'C', patch: { level: -3 } } })
  say(hub, phone, { type: 'mixer', cmd: { type: 'bus', mix: 'C', patch: { fader: -1 } } })
  say(hub, phone, { type: 'mixer', cmd: { type: 'send', ch: 1, mix: 'D', patch: { level: -3 } } })
  say(hub, phone, { type: 'mixer', cmd: { type: 'channel', ch: 1, patch: { mute: true } } })
  expect(sent.map((c) => c.type)).toEqual(['send', 'bus'])

  say(hub, ipad, { type: 'device', cmd: { type: 'foh', id: 'p1', allowed: true } })
  say(hub, phone, { type: 'mixer', cmd: { type: 'channel', ch: 1, patch: { mute: true } } })
  expect(sent).toHaveLength(3)
})

test('a move on the L-20 itself goes to all browsers, with the stereo partner added', () => {
  const { l20, sent, desk } = fakeL20()
  const hub = new Hub(l20)
  const ipad = browser()
  hub.join(ipad)
  say(hub, ipad, { type: 'mixer', cmd: { type: 'link', ch: 3, linked: true } })
  desk({ type: 'channel', ch: 3, patch: { fader: -10 } })
  expect(hub.mixer.channels[3].fader).toBe(-10)
  expect(sent.at(-1)).toEqual({ type: 'channel', ch: 4, patch: { fader: -10 } })
  expect(ipad.got.slice(-2).map((m) => 'ch' in m && m.ch)).toEqual([3, 4])
})

test('malformed messages are ignored', () => {
  for (const raw of [
    'nope',
    '[]',
    '{"type":"mixer"}',
    '{"type":"mixer","cmd":{"type":"rm -rf"}}',
    '{"type":"mixer","cmd":{"type":"channel","ch":1,"patch":{"fader":{"x":1}}}}',
    '{"type":"hello","id":1,"phone":true}',
  ])
    expect(parseClientMessage(raw)).toBeNull()
  const hub = new Hub(fakeL20().l20)
  // a command the reducer chokes on must not take the hub down
  expect(() =>
    hub.receive(browser(), '{"type":"mixer","cmd":{"type":"channel","ch":1}}'),
  ).not.toThrow()
})
