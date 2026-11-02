import { expect, test } from 'vitest'
import type { MixerCommand } from './mixer'
import {
  BleMidiParser,
  blePacket,
  decode,
  decodeClock,
  decodeMeters,
  decodeState,
  encode,
} from './l20Midi'
// State reply from Ron's 2nd capture, taken after presetting known values in the official app (docs/protocol-l20-ble.md)
import stateHex from './__fixtures__/l20-state.hex?raw'

const hex = (h: string) =>
  h
    .trim()
    .match(/../g)!
    .map((b) => parseInt(b, 16))

test('encodes captured controls, incl. channels 17-20 on the second CC bank', () => {
  expect(encode({ type: 'channel', ch: 1, patch: { fader: 0, mute: true } })).toEqual([
    [0xb0, 0x3c, 82],
    [0xb0, 0x30, 1],
  ])
  expect(encode({ type: 'channel', ch: 17, patch: { fader: 0 } })).toEqual([[0xb0, 0x3d, 82]])
  expect(encode({ type: 'channel', ch: 19, patch: { mute: true } })).toEqual([[0xb2, 0x31, 1]])
  expect(encode({ type: 'channel', ch: 18, patch: { mute: true } })).toEqual([])
  expect(encode({ type: 'bus', mix: 'main', patch: { fader: 0 } })).toEqual([[0xba, 0x54, 82]])
  expect(encode({ type: 'bus', mix: 'fx2', patch: { effect: 3 } })).toEqual([[0xb1, 0x4e, 3]])
  expect(encode({ type: 'transport', button: 'rec' })).toEqual([[0xb9, 0x57, 3]])
  expect(encode({ type: 'transport', button: 'ff' })).toEqual([
    [0xbd, 0x57, 5],
    [0xbd, 0x57, 4],
  ])
})

test('decodes what it encodes', () => {
  const cmds: MixerCommand[] = [
    { type: 'channel', ch: 3, patch: { fader: 0 } },
    { type: 'channel', ch: 19, patch: { fader: 0 } },
    { type: 'channel', ch: 1, patch: { pan: 50 } },
    { type: 'channel', ch: 1, patch: { recSelect: 'rec' } },
    { type: 'eq', ch: 1, patch: { high: -4.5 } },
    { type: 'eq', ch: 2, patch: { low: 15 } },
    { type: 'send', ch: 1, mix: 'B', patch: { level: 0 } },
    { type: 'send', ch: 1, mix: 'F', patch: { level: 10 } },
    { type: 'send', ch: 1, mix: 'fx2', patch: { level: 0 } },
    { type: 'bus', mix: 'A', patch: { fader: 0 } },
    { type: 'bus', mix: 'fx1', patch: { effect: 3 } },
  ]
  for (const cmd of cmds) expect(decode(encode(cmd)[0]!)).toEqual(cmd)
  expect(decode([0xb8, 0x57, 5])).toEqual({ type: 'recorder', patch: { state: 'recording' } })
})

test('reads the presets back from the captured state reply', () => {
  const cmds = decodeState(hex(stateHex))
  const ch = (n: number, type: string) =>
    Object.assign(
      {},
      ...cmds
        .filter((c) => 'ch' in c && c.ch === n && c.type === type)
        .map((c) => ('patch' in c ? c.patch : {})),
    )
  const send = (n: number, mix: string) =>
    cmds.find((c) => c.type === 'send' && c.ch === n && c.mix === mix)
  expect(ch(1, 'channel')).toMatchObject({ name: 'CH1', fader: -60, mute: true, recSelect: 'rec' })
  expect(ch(2, 'channel')).toMatchObject({ fader: 0, mute: false })
  expect(ch(3, 'channel')).toMatchObject({ fader: 10, pan: -100 })
  expect(ch(1, 'eq')).toMatchObject({ low: 15, midGain: -15, midFreq: 8000, high: -15 })
  expect(ch(2, 'eq')).toMatchObject({ lowCut: true, lowCutHz: 600 })
  expect(send(1, 'A')).toMatchObject({ patch: { level: 10 } })
  expect(send(1, 'B')).toMatchObject({ patch: { level: 0 } })
  expect(send(1, 'F')).toMatchObject({ patch: { level: -60 } })
  expect(send(1, 'fx1')).toMatchObject({ patch: { level: 10 } })
  expect(send(1, 'fx2')).toMatchObject({ patch: { level: 0 } })
  expect(cmds).toContainEqual({ type: 'bus', mix: 'fx2', patch: { effect: 3 } })
})

test('meters: channel n is byte 6+n; recorder clock counts h, min, s', () => {
  const m = decodeMeters(
    hex('f05200003104001f' + '00'.repeat(17) + '1011' + '00'.repeat(31) + 'f7'),
  )!
  expect(m[0]).toBe(0)
  expect(m[1]).toBe(-60)
  expect(m[18]).toBe(-48)
  expect(m[19]).toBeCloseTo(-44.8)
  const digits: number[] = []
  const last = [8, 9, 10, 11].map((m, i) => decodeClock([0xb0 | m, 0x58, [0, 0, 1, 5][i]!], digits))
  expect(last[3]).toEqual({ type: 'recorder', patch: { position: 65 } })
})

test('parses BLE-MIDI packets, including SysEx split over packets', () => {
  const p = new BleMidiParser()
  expect(p.parse(Uint8Array.from([0x80, 0x80, 0xb0, 0x3c, 0x52, 0x81, 0x3c, 0x53]))).toEqual([
    [0xb0, 0x3c, 0x52],
    [0xb0, 0x3c, 0x53],
  ])
  expect(p.parse(Uint8Array.from([0x80, 0x80, 0xf0, 0x52, 0, 0]))).toEqual([])
  expect(p.parse(Uint8Array.from([0x80, 0x2b, 0x80, 0xf7]))).toEqual([
    [0xf0, 0x52, 0, 0, 0x2b, 0xf7],
  ])
  expect(Array.from(blePacket([0xf0, 0x52, 0, 0, 0x2b, 0xf7]))).toEqual([
    0x80, 0x80, 0xf0, 0x52, 0, 0, 0x2b, 0x80, 0xf7,
  ])
})
