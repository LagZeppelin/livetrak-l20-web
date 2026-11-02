/**
 * L-20 MIDI mapping (docs/protocol-l20-ble.md): MixerCommand <-> MIDI bytes, plus BLE-MIDI framing.
 * Pure and DOM-free so the browser (Web Bluetooth) and later the Pi (BlueZ) share it.
 */
import {
  FADER_MAX,
  FADER_MIN,
  LOW_CUT_MAX_HZ,
  LOW_CUT_MIN_HZ,
  type Channel,
  type Eq,
  type MixerCommand,
  type SendMixId,
} from './mixer'

export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700'
export const BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3'

/** Asks for the full state; the reply (F0 52 00 00 2A) starts with the channel names. */
export const REQUEST_STATE = [0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7]

type Msg = number[]
const cc = (midiCh: number, n: number, v: number): Msg => [0xb0 | midiCh, n, v]
const clamp = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)))

// Fader scale 0…120 with 0 dB = 82, seen in the capture (0 and 120 are the ends).
// shortcut: straight lines between the three known points; replace with a measured dB table after the next capture
const dbToFader = (db: number) =>
  db <= FADER_MIN
    ? 0
    : clamp(db <= 0 ? 82 + (db / -FADER_MIN) * 82 : 82 + (db / FADER_MAX) * 38, 0, 120)
const faderToDb = (v: number) =>
  v <= 0 ? FADER_MIN : v <= 82 ? (FADER_MIN * (82 - v)) / 82 + 0 : ((v - 82) / 38) * FADER_MAX
// FX sends run 0…60 on the wire. shortcut: assumed to be the fader scale halved, not yet verified
const dbToFx = (db: number) => Math.round(dbToFader(db) / 2)
const fxToDb = (v: number) => faderToDb(v * 2)
// EQ gain 0…60, assumed 30 = 0 dB in 0.5 dB steps (±15 dB)
const dbToEq = (db: number) => clamp(db * 2 + 30, 0, 60)
const eqToDb = (v: number) => (v - 30) / 2
// Low cut pot: 0 = off, 1…56 = 40…600 Hz. shortcut: log curve assumed, verify against the app's readout
const LC_TOP = 56
const hzToLc = (hz: number) =>
  clamp(
    1 + (LC_TOP - 1) * (Math.log(hz / LOW_CUT_MIN_HZ) / Math.log(LOW_CUT_MAX_HZ / LOW_CUT_MIN_HZ)),
    1,
    LC_TOP,
  )
const lcToHz = (v: number) =>
  LOW_CUT_MIN_HZ * (LOW_CUT_MAX_HZ / LOW_CUT_MIN_HZ) ** ((v - 1) / (LC_TOP - 1))

/** Channel n sits on MIDI channel n-1. Seen for 1 and 2; 3–16 assumed, 17–20 don't fit 16 MIDI channels (unknown). */
const midiCh = (ch: number) => (ch >= 1 && ch <= 16 ? ch - 1 : null)

const SEND_CC: Partial<Record<SendMixId, number>> = { fx1: 0x34, fx2: 0x36, A: 0x53 }

/** MIDI messages for a command; parts the L-20 mapping doesn't know yet are left out. */
export function encode(cmd: MixerCommand): Msg[] {
  const out: Msg[] = []
  if (cmd.type === 'channel' || cmd.type === 'eq' || cmd.type === 'send') {
    const m = midiCh(cmd.ch)
    if (m === null) return out
    if (cmd.type === 'channel') {
      const p = cmd.patch
      if (p.fader !== undefined) out.push(cc(m, 0x3c, dbToFader(p.fader)))
      if (p.mute !== undefined) out.push(cc(m, 0x30, +p.mute))
      if (p.solo !== undefined) out.push(cc(m, 0x32, +p.solo))
      if (p.pan !== undefined) out.push(cc(m, 0x0c, clamp((p.pan + 100) / 2, 0, 100)))
      if (p.recSelect !== undefined) out.push(cc(m, 0x08, p.recSelect ? 2 : 0))
    } else if (cmd.type === 'eq') {
      const p = cmd.patch
      if (p.high !== undefined) out.push(cc(m, 0x14, dbToEq(p.high)))
      if (p.lowCut === false) out.push(cc(m, 0x2e, 0))
      // shortcut: switching low cut on without a frequency sends 40 Hz, the hardware pot has no separate on/off
      else if (p.lowCutHz !== undefined || p.lowCut)
        out.push(cc(m, 0x2e, hzToLc(p.lowCutHz ?? LOW_CUT_MIN_HZ)))
    } else {
      const n = SEND_CC[cmd.mix]
      const level = cmd.patch.level
      if (n !== undefined && level !== undefined)
        out.push(cc(m, n, cmd.mix === 'A' ? dbToFader(level) : dbToFx(level)))
    }
  } else if (cmd.type === 'bus' && cmd.patch.fader !== undefined) {
    if (cmd.mix === 'main') out.push(cc(0x0a, 0x54, dbToFader(cmd.patch.fader)))
    if (cmd.mix === 'fx1') out.push(cc(0x0c, 0x50, dbToFader(cmd.patch.fader)))
  }
  return out
}

/** The command a MIDI message from the L-20 stands for, or null if unknown. */
export function decode(msg: Msg): MixerCommand | null {
  if (msg[0] === 0xf0) return null
  if ((msg[0] & 0xf0) !== 0xb0 || msg.length < 3) return null
  const m = msg[0] & 0x0f
  const [, n, v] = msg as [number, number, number]
  if (m === 0x0a && n === 0x54) return { type: 'bus', mix: 'main', patch: { fader: faderToDb(v) } }
  if (m === 0x0c && n === 0x50) return { type: 'bus', mix: 'fx1', patch: { fader: faderToDb(v) } }
  const ch = m + 1
  const channel = (patch: Partial<Channel>): MixerCommand => ({ type: 'channel', ch, patch })
  const eq = (patch: Partial<Eq>): MixerCommand => ({ type: 'eq', ch, patch })
  switch (n) {
    case 0x3c:
      return channel({ fader: faderToDb(v) })
    case 0x30:
      return channel({ mute: v > 0 })
    case 0x32:
      return channel({ solo: v > 0 })
    case 0x0c:
      return channel({ pan: v * 2 - 100 })
    case 0x08:
      return channel({ recSelect: v === 2 })
    case 0x14:
      return eq({ high: eqToDb(v) })
    case 0x2e:
      return eq(v === 0 ? { lowCut: false } : { lowCut: true, lowCutHz: Math.round(lcToHz(v)) })
  }
  const mix = (Object.keys(SEND_CC) as SendMixId[]).find((k) => SEND_CC[k] === n)
  if (mix)
    return { type: 'send', ch, mix, patch: { level: mix === 'A' ? faderToDb(v) : fxToDb(v) } }
  return null
}

/** Channel names from the state reply F0 52 00 00 2A: 4 bytes, then 18 names of 9 bytes (17/18 and 19/20 share one). */
export function decodeNames(msg: Msg): MixerCommand[] {
  if (msg[4] !== 0x2a) return []
  const out: MixerCommand[] = []
  for (let i = 0; i < 18; i++) {
    const raw = msg.slice(9 + i * 9, 18 + i * 9)
    const name = String.fromCharCode(...raw.filter((c) => c >= 0x20 && c < 0x7f))
    const chs = i < 16 ? [i + 1] : [17 + (i - 16) * 2, 18 + (i - 16) * 2]
    for (const ch of chs) out.push({ type: 'channel', ch, patch: { name } })
  }
  return out
}

/** One MIDI message as a BLE-MIDI packet (header + timestamp 0). */
export function blePacket(msg: Msg): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    msg[0] === 0xf0 ? [0x80, 0x80, ...msg.slice(0, -1), 0x80, 0xf7] : [0x80, 0x80, ...msg],
  )
}

const DATA_LEN: Record<number, number> = {
  0x80: 2,
  0x90: 2,
  0xa0: 2,
  0xb0: 2,
  0xe0: 2,
  0xc0: 1,
  0xd0: 1,
}

/** Parses BLE-MIDI packets into MIDI messages; keeps a SysEx open across packets. */
export class BleMidiParser {
  private sysex: number[] | null = null

  parse(p: Uint8Array): Msg[] {
    const out: Msg[] = []
    let run: number | null = null
    let i = 1
    while (i < p.length) {
      const c = p[i]!
      if (this.sysex) {
        if (c & 0x80) {
          if (p[i + 1] === 0xf7) {
            out.push([...this.sysex, 0xf7])
            this.sysex = null
            i += 2
          } else i++
          continue
        }
        this.sysex.push(c)
        i++
        continue
      }
      if (c & 0x80) {
        i++
        if (i >= p.length) break
        if (p[i] === 0xf0) {
          this.sysex = [0xf0]
          i++
          continue
        }
        if (p[i]! & 0x80) run = p[i++]!
      }
      const n = run === null ? 0 : (DATA_LEN[run & 0xf0] ?? 0)
      if (!n) {
        i++
        continue
      }
      while (i + n <= p.length && !(p[i]! & 0x80)) {
        out.push([run!, ...p.slice(i, i + n)])
        i += n
      }
    }
    return out
  }
}
