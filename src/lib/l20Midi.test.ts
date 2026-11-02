import { expect, test } from 'vitest'
import { BleMidiParser, blePacket, decode, decodeNames, encode } from './l20Midi'

test('encodes the controls seen in the capture', () => {
  expect(encode({ type: 'channel', ch: 1, patch: { fader: 0, mute: true } })).toEqual([
    [0xb0, 0x3c, 82],
    [0xb0, 0x30, 1],
  ])
  expect(encode({ type: 'channel', ch: 2, patch: { pan: -100 } })).toEqual([[0xb1, 0x0c, 0]])
  expect(encode({ type: 'bus', mix: 'main', patch: { fader: 0 } })).toEqual([[0xba, 0x54, 82]])
  expect(encode({ type: 'eq', ch: 1, patch: { lowCut: false } })).toEqual([[0xb0, 0x2e, 0]])
  // unknown mappings are left out rather than guessed
  expect(encode({ type: 'send', ch: 1, mix: 'B', patch: { level: 0 } })).toEqual([])
  expect(encode({ type: 'channel', ch: 17, patch: { mute: true } })).toEqual([])
})

test('decodes what it encodes', () => {
  for (const cmd of [
    { type: 'channel', ch: 3, patch: { fader: 0 } },
    { type: 'channel', ch: 1, patch: { pan: 50 } },
    { type: 'channel', ch: 1, patch: { recSelect: 'rec' } },
    { type: 'eq', ch: 1, patch: { high: -4.5 } },
    { type: 'send', ch: 1, mix: 'A', patch: { level: 0 } },
    { type: 'bus', mix: 'fx1', patch: { fader: 0 } },
  ] as const)
    expect(decode(encode(cmd)[0]!)).toEqual(cmd)
  expect(decode([0xb0, 0x3c, 0])).toEqual({ type: 'channel', ch: 1, patch: { fader: -60 } })
  expect(decode([0xb0, 0x3c, 120])).toEqual({ type: 'channel', ch: 1, patch: { fader: 10 } })
})

test('parses BLE-MIDI packets from the capture, including SysEx split over packets', () => {
  const p = new BleMidiParser()
  // running status: two fader values in one packet
  expect(p.parse(Uint8Array.from([0x80, 0x80, 0xb0, 0x3c, 0x52, 0x81, 0x3c, 0x53]))).toEqual([
    [0xb0, 0x3c, 0x52],
    [0xb0, 0x3c, 0x53],
  ])
  const names = [0xf0, 0x52, 0, 0, 0x2a, 8, 5, 0, 0, ...[...'Vox'].map((c) => c.charCodeAt(0))]
  expect(p.parse(Uint8Array.from([0x80, 0x80, ...names]))).toEqual([])
  const [msg] = p.parse(Uint8Array.from([0x80, 0, 0, 0, 0, 0, 0, 0x80, 0xf7]))
  expect(decodeNames(msg!)[0]).toEqual({ type: 'channel', ch: 1, patch: { name: 'Vox' } })
  expect(Array.from(blePacket([0xf0, 0x52, 0, 0, 0x2b, 0xf7]))).toEqual([
    0x80, 0x80, 0xf0, 0x52, 0, 0, 0x2b, 0x80, 0xf7,
  ])
})
