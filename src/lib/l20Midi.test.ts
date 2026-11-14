import { expect, test } from 'vitest'
import type { MixerCommand } from './mixer'
import {
  BleMidiParser,
  blePacket,
  decode,
  decodeClock,
  decodeKnob,
  decodeMeters,
  decodeState,
  encode,
} from './l20Midi'
// State reply from Ron's 2nd capture, taken after presetting known values in the official app (docs/protocol-l20-ble.md)
import stateHex from './__fixtures__/l20-state.hex?raw'
// State reply from capture 4 (2026-11-14): FX returns at 0 dB, Mix A/B/F outputs up, FX1 Vocal 1, FX2 Chorus 1
import state4Hex from './__fixtures__/l20-state-4.hex?raw'

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
  expect(ch(1, 'eq')).toMatchObject({ low: 15, midGain: -15, midFreq: 7625, high: -15 })
  expect(ch(2, 'eq')).toMatchObject({ lowCut: true, lowCutHz: 600 })
  expect(send(1, 'A')).toMatchObject({ patch: { level: 10 } })
  expect(send(1, 'B')).toMatchObject({ patch: { level: 0 } })
  expect(send(1, 'F')).toMatchObject({ patch: { level: -60 } })
  expect(send(1, 'fx1')).toMatchObject({ patch: { level: 10 } })
  expect(send(1, 'fx2')).toMatchObject({ patch: { level: 0 } })
  const bus = (mix: string) =>
    cmds.find((c) => c.type === 'bus' && c.mix === mix && 'fader' in c.patch)
  expect(bus('fx2')).toMatchObject({ patch: { effect: 3 } })
  expect(bus('main')).toMatchObject({ patch: { fader: expect.closeTo(-18.3, 1) } }) // raw 30
})

test('uses the dB and frequency points read off the app in capture 3', () => {
  const fader = (db: number) => encode({ type: 'channel', ch: 1, patch: { fader: db } })[0]![2]
  expect([-60, -40, -20, -10, 0, 10].map(fader)).toEqual([0, 8, 27, 45, 82, 120])
  const mid = (hz: number) => encode({ type: 'eq', ch: 1, patch: { midFreq: hz } })[0]![2]
  expect([100, 200, 497, 1017, 3065, 8000].map(mid)).toEqual([0, 16, 37, 53, 76, 96])
  const lowCut = (hz: number) => encode({ type: 'eq', ch: 1, patch: { lowCutHz: hz } })[0]![2]
  expect([40, 60, 204.9, 403.9, 600].map(lowCut)).toEqual([1, 11, 37, 49, 56])
  expect(decode([0xb0, 0x2e, 24])).toMatchObject({ patch: { lowCutHz: 101 } })
  expect(encode({ type: 'send', ch: 1, mix: 'fx1', patch: { level: 10 } })).toEqual([
    [0xb0, 0x34, 60],
  ])
  expect(encode({ type: 'bus', mix: 'main', patch: { mute: true } })).toEqual([[0xb9, 0x54, 1]])
  expect(encode({ type: 'geq', band: 6, gain: 0 })).toEqual([[0xb6, 0x55, 30]])
  for (const cmd of [
    { type: 'channel', ch: 2, patch: { phase: true } },
    { type: 'channel', ch: 2, patch: { solo: true } },
    { type: 'bus', mix: 'main', patch: { mute: false } },
    { type: 'geq', band: 14, gain: -3 },
  ] as MixerCommand[])
    expect(decode(encode(cmd)[0]!)).toEqual(cmd)
})

test('meters: test-tone calibration from capture 4; recorder clocks', () => {
  // ch 1 clipping (0x2a), ch 2 at -3 dB, ch 20 at -45 dB; main L at -9 dB
  const m = decodeMeters(
    hex('f0520000310400' + '2a19' + '00'.repeat(17) + '10' + '00'.repeat(28) + '07' + '00f7'),
  )!
  expect(m.slice(0, 3)).toEqual([0, -3, -60])
  expect(m[19]).toBe(-45)
  expect(m[20]).toBe(-9)
  expect(m[21]).toBe(-60)
  const digits: number[] = []
  const clock = (first: number, values: number[]) =>
    values.map((v, i) => decodeClock([0xb0 | (first + i), 0x58, v], digits)).at(-1)
  expect(clock(8, [0, 0, 1, 5])).toEqual({ type: 'recorder', patch: { position: 65 } })
  // L-20 display 299:23:14 left on the SD card
  expect(clock(12, [2, 43, 23, 14])).toEqual({
    type: 'recorder',
    patch: { remaining: (299 * 60 + 23) * 60 + 14 },
  })
  expect(clock(4, [0, 0, 2, 16])).toEqual({ type: 'recorder', patch: { length: 136 } })
})

test('capture 4: per-mix FX returns, effect knobs, state block', () => {
  expect(encode({ type: 'bus', mix: 'B', patch: { fx2: 10 } })).toEqual([[0xb5, 0x51, 120]])
  expect(encode({ type: 'bus', mix: 'F', patch: { fx1: 0 } })).toEqual([[0xb4, 0x52, 82]])
  expect(decode([0xbd, 0x51, 120])).toEqual({ type: 'bus', mix: 'D', patch: { fx2: 10 } })
  expect(decode([0xb1, 0x52, 0])).toEqual({ type: 'bus', mix: 'E', patch: { fx2: -60 } })
  expect(decode([0xb2, 0x51, 0])).toBeNull()
  // Delay time 1000 ms = raw 999 = MSB 7, LSB 0x67
  expect(encode({ type: 'fxParam', mix: 'fx2', index: 0, value: 999 })).toEqual([
    [0xb6, 0x4e, 7],
    [0xb7, 0x4e, 0x67],
  ])
  const msb: number[] = []
  expect(decodeKnob([0xbc, 0x4e, 0], msb)).toBeNull()
  expect(decodeKnob([0xbd, 0x4e, 49], msb)).toEqual({
    type: 'fxParam',
    mix: 'fx1',
    index: 1,
    value: 49,
  })
  const cmds = decodeState(hex(state4Hex))
  const bus = (mix: string) =>
    Object.assign(
      {},
      ...cmds.map((c) => (c.type === 'bus' && c.mix === mix ? c.patch : {})),
    ) as Record<string, number>
  expect(bus('fx1')).toMatchObject({ effect: 7, fader: 0, params: [499, 50] })
  expect(bus('fx2')).toMatchObject({ effect: 7, params: [50, 49] })
  expect(bus('A').fader).toBeCloseTo(6.6, 0)
  expect(bus('C')).toMatchObject({ fader: -60, fx1: -60, fx2: -60 })
  expect(bus('F').fader).toBeCloseTo(-0.4, 0)
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
