/**
 * L-20 MIDI mapping (docs/protocol-l20-ble.md): MixerCommand <-> MIDI bytes, plus BLE-MIDI framing.
 * Pure and DOM-free so the browser (Web Bluetooth) and later the Pi (BlueZ) share it.
 */
import {
  FADER_MAX,
  FADER_MIN,
  FX_MIXES,
  LOW_CUT_MAX_HZ,
  LOW_CUT_MIN_HZ,
  MONITOR_MIXES,
  type Channel,
  type Eq,
  type MixId,
  type MixerCommand,
  type RecSelect,
  type RecorderState,
  type SendMixId,
  type TransportButton,
} from './mixer'

export const BLE_MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700'
export const BLE_MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3'

/** Sent after connecting, like the official app: full state (reply F0 52 00 00 2A), then start meters (F0 52 00 00 31 …). */
export const HELLO = [
  [0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7],
  [0xf0, 0x52, 0x00, 0x00, 0x50, 0xf7],
]

type Msg = number[]
const cc = (midiCh: number, n: number, v: number): Msg => [0xb0 | midiCh, n, v]
const clamp = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)))

/**
 * A dB scale on the wire: 0 = off (FADER_MIN), `zero` = 0 dB, `top` = FADER_MAX.
 * shortcut: straight lines between those three captured points; replace with a measured table if the readouts drift
 */
const dbScale = (top: number, zero: number) => ({
  to: (db: number) =>
    db <= FADER_MIN
      ? 0
      : clamp(
          db <= 0 ? zero + (db / -FADER_MIN) * zero : zero + (db / FADER_MAX) * (top - zero),
          0,
          top,
        ),
  from: (v: number) =>
    v <= 0
      ? FADER_MIN
      : v <= zero
        ? (FADER_MIN * (zero - v)) / zero + 0
        : ((v - zero) / (top - zero)) * FADER_MAX,
})
/** Channel faders, mix A–F sends and bus faders: 0…120, 0 dB = 82. */
const FADER = dbScale(120, 82)
/** FX sends: 0…60, 0 dB = 45 (seen in the state dump; the top end is assumed to be +10 dB). */
const FXSEND = dbScale(60, 45)
/** EQ and GEQ gains: 0…60, 30 = 0 dB, 0.5 dB steps (both ends captured as ±15 dB). */
const GAIN = { to: (db: number) => clamp(db * 2 + 30, 0, 60), from: (v: number) => (v - 30) / 2 }
/** A log frequency knob 1…top (0 is reserved) or 0…top. shortcut: log curve assumed, verify against the app's readout */
const logKnob = (lo: number, hi: number, first: number, top: number) => ({
  to: (hz: number) =>
    clamp(first + (top - first) * (Math.log(hz / lo) / Math.log(hi / lo)), first, top),
  from: (v: number) => Math.round(lo * (hi / lo) ** ((v - first) / (top - first))),
})
/** Low cut pot: 0 = off, 1…56 = 40…600 Hz. */
const LOWCUT = logKnob(LOW_CUT_MIN_HZ, LOW_CUT_MAX_HZ, 1, 56)
/** Mid frequency: 0…95, assumed 100 Hz…8 kHz (48 ≈ 1 kHz matches the default). */
const MIDFREQ = logKnob(100, 8000, 0, 95)

/** Per-channel controls: CC number for channels 1–16; channels 17–20 use the next CC (n+1) on MIDI channel 0–3. */
const CH = {
  select: 0x08,
  pan: 0x0c,
  high: 0x14,
  midFreq: 0x18,
  midGain: 0x1a,
  low: 0x2c,
  lowCut: 0x2e,
  mute: 0x30,
  solo: 0x32,
  fx1: 0x34,
  fx2: 0x36,
  fader: 0x3c,
  // Mix A–F sends; A at 0x3E is inferred from the gap between the fader and Mix B, the others were captured
  A: 0x3e,
  B: 0x40,
  C: 0x42,
  D: 0x44,
  E: 0x46,
  F: 0x48,
} as const

/** MIDI channel and CC offset of a mixer channel; 18 and 20 are the right half of a fixed stereo pair and have none. */
function addr(ch: number): { m: number; bank: number } | null {
  if (ch >= 1 && ch <= 16) return { m: ch - 1, bank: 0 }
  if (ch === 17 || ch === 19) return { m: ch - 17, bank: 1 }
  return null
}

/** Bus outputs. Main, FX 1/2 returns and Mix A were captured; Mix B–F on MIDI channels 1–5 follow Mix A's pattern (unverified). */
const BUS: Partial<Record<MixId, [number, number]>> = {
  main: [0x0a, 0x54],
  fx1: [0x0c, 0x50],
  fx2: [0x0d, 0x50],
  ...Object.fromEntries(MONITOR_MIXES.map((m, i) => [m, [i, 0x53]])),
}

/** Channel REC/PLAY button on CC 0x08. */
const SELECT: Record<RecSelect, number> = { off: 0, rec: 2, play: 1 }
const SELECT_OF: Record<number, RecSelect> = { 0: 'off', 2: 'rec', 1: 'play' }
/** Recorder buttons on CC 0x57: [MIDI channel, values]; REC/PLAY/STOP send 3, FF/REW send press (5) and release (4). */
const REC_BUTTON: Record<TransportButton, [number, number[]]> = {
  rec: [0x09, [3]],
  play: [0x0a, [3]],
  stop: [0x0b, [3]],
  ff: [0x0d, [5, 4]],
  rew: [0x0c, [5, 4]],
}
/** Recorder state the L-20 reports on B8 57. 4 was seen for a paused recording; paused playback (2?) not captured. */
const REC_STATE: Record<number, RecorderState> = {
  0: 'stopped',
  1: 'playing',
  2: 'paused',
  3: 'standby',
  4: 'recPaused',
  5: 'recording',
}

/** MIDI messages for a command; parts the L-20 mapping doesn't know are left out. */
export function encode(cmd: MixerCommand): Msg[] {
  const out: Msg[] = []
  if (cmd.type === 'channel' || cmd.type === 'eq' || cmd.type === 'send') {
    const a = addr(cmd.ch)
    if (!a) return out
    const put = (n: number, v: number) => out.push(cc(a.m, n + a.bank, v))
    if (cmd.type === 'channel') {
      const p = cmd.patch
      if (p.fader !== undefined) put(CH.fader, FADER.to(p.fader))
      if (p.mute !== undefined) put(CH.mute, +p.mute)
      if (p.solo !== undefined) put(CH.solo, +p.solo)
      if (p.pan !== undefined) put(CH.pan, clamp((p.pan + 100) / 2, 0, 100))
      if (p.recSelect !== undefined) put(CH.select, SELECT[p.recSelect])
    } else if (cmd.type === 'eq') {
      const p = cmd.patch
      if (p.high !== undefined) put(CH.high, GAIN.to(p.high))
      if (p.midGain !== undefined) put(CH.midGain, GAIN.to(p.midGain))
      if (p.low !== undefined) put(CH.low, GAIN.to(p.low))
      if (p.midFreq !== undefined) put(CH.midFreq, MIDFREQ.to(p.midFreq))
      if (p.lowCut === false) put(CH.lowCut, 0)
      // shortcut: switching low cut on without a frequency sends 40 Hz, the hardware pot has no separate on/off
      else if (p.lowCutHz !== undefined || p.lowCut)
        put(CH.lowCut, LOWCUT.to(p.lowCutHz ?? LOW_CUT_MIN_HZ))
    } else if (cmd.patch.level !== undefined) {
      const fx = cmd.mix === 'fx1' || cmd.mix === 'fx2'
      put(CH[cmd.mix], (fx ? FXSEND : FADER).to(cmd.patch.level))
    }
  } else if (cmd.type === 'bus') {
    const fxIndex = FX_MIXES.indexOf(cmd.mix as never)
    if (fxIndex >= 0 && cmd.patch.effect !== undefined)
      out.push(cc(fxIndex, 0x4e, cmd.patch.effect))
    const bus = BUS[cmd.mix]
    if (bus && cmd.patch.fader !== undefined)
      out.push(cc(bus[0], bus[1], FADER.to(cmd.patch.fader)))
  } else if (cmd.type === 'transport') {
    const [m, values] = REC_BUTTON[cmd.button]
    for (const v of values) out.push(cc(m, 0x57, v))
  }
  return out
}

/** The command a MIDI message from the L-20 stands for, or null if unknown. */
export function decode(msg: Msg): MixerCommand | null {
  if ((msg[0]! & 0xf0) !== 0xb0 || msg.length < 3) return null
  const m = msg[0]! & 0x0f
  const [, n, v] = msg as [number, number, number]
  if (n === 0x4e && m < 2) return { type: 'bus', mix: FX_MIXES[m]!, patch: { effect: v } }
  if (n === 0x57 && m === 0x08 && v in REC_STATE)
    return { type: 'recorder', patch: { state: REC_STATE[v] } }
  for (const [mix, [bm, bn]] of Object.entries(BUS))
    if (m === bm && n === bn)
      return { type: 'bus', mix: mix as MixId, patch: { fader: FADER.from(v) } }
  if (n > CH.F + 1) return null
  const bank = n & 1
  if (bank && m > 3) return null
  const ch = bank ? 17 + m : m + 1
  const base = n - bank
  const channel = (patch: Partial<Channel>): MixerCommand => ({ type: 'channel', ch, patch })
  const eq = (patch: Partial<Eq>): MixerCommand => ({ type: 'eq', ch, patch })
  const send = (mix: SendMixId, level: number): MixerCommand => ({
    type: 'send',
    ch,
    mix,
    patch: { level },
  })
  switch (base) {
    case CH.fader:
      return channel({ fader: FADER.from(v) })
    case CH.mute:
      return channel({ mute: v > 0 })
    case CH.solo:
      return channel({ solo: v > 0 })
    case CH.pan:
      return channel({ pan: v * 2 - 100 })
    case CH.select:
      return channel({ recSelect: SELECT_OF[v] ?? 'off' })
    case CH.high:
      return eq({ high: GAIN.from(v) })
    case CH.midGain:
      return eq({ midGain: GAIN.from(v) })
    case CH.low:
      return eq({ low: GAIN.from(v) })
    case CH.midFreq:
      return eq({ midFreq: MIDFREQ.from(v) })
    case CH.lowCut:
      return eq(v === 0 ? { lowCut: false } : { lowCut: true, lowCutHz: LOWCUT.from(v) })
    case CH.fx1:
      return send('fx1', FXSEND.from(v))
    case CH.fx2:
      return send('fx2', FXSEND.from(v))
  }
  const mix = MONITOR_MIXES.find((k) => CH[k] === base)
  return mix ? send(mix, FADER.from(v)) : null
}

/** Recorder position: the L-20 counts on B8–BB 58 (hours?, minutes, seconds); `digits` keeps the last values. */
export function decodeClock(msg: Msg, digits: number[]): MixerCommand | null {
  const m = msg[0]! & 0x0f
  if ((msg[0]! & 0xf0) !== 0xb0 || msg[1] !== 0x58 || m < 0x08 || m > 0x0b) return null
  digits[m - 8] = msg[2]!
  if (m !== 0x0b) return null
  const [, h = 0, min = 0, s = 0] = digits
  return { type: 'recorder', patch: { position: (h * 60 + min) * 60 + s } }
}

/** Offsets of 18-byte arrays (one byte per strip: 1–16, 17/18, 19/20) in the state block after the names. */
const STATE = {
  select: 18,
  mute: 36,
  pan: 90,
  high: 126,
  midFreq: 144,
  midGain: 162,
  low: 180,
  lowCut: 198,
  fx1: 216,
  fx2: 234,
  fader: 252,
  sends: 270, // Mix A–F, 18 bytes each
  fxType: 378, // FX 1, FX 2
  geq: 416, // 15 bands
}

/** Names and settings from the state reply F0 52 00 00 2A (names: 4 bytes, then 18 × 9 bytes; settings after). */
export function decodeState(msg: Msg): MixerCommand[] {
  if (msg[4] !== 0x2a || msg.length < 171 + 431) return []
  const out: MixerCommand[] = []
  const at = (off: number) => msg[171 + off]!
  for (let s = 0; s < 18; s++) {
    const raw = msg.slice(9 + s * 9, 18 + s * 9)
    const name = String.fromCharCode(...raw.filter((c) => c >= 0x20 && c < 0x7f))
    const v = (off: number) => at(off + s)
    const chs = s < 16 ? [s + 1] : [17 + (s - 16) * 2, 18 + (s - 16) * 2]
    for (const ch of chs) {
      const patch: Partial<Channel> = {
        name,
        fader: FADER.from(v(STATE.fader)),
        mute: v(STATE.mute) > 0,
        recSelect: SELECT_OF[v(STATE.select)] ?? 'off',
      }
      if (s < 16) patch.pan = v(STATE.pan) * 2 - 100
      out.push({ type: 'channel', ch, patch })
      const lc = v(STATE.lowCut)
      out.push({
        type: 'eq',
        ch,
        patch: {
          high: GAIN.from(v(STATE.high)),
          midGain: GAIN.from(v(STATE.midGain)),
          low: GAIN.from(v(STATE.low)),
          midFreq: MIDFREQ.from(v(STATE.midFreq)),
          lowCut: lc > 0,
          ...(lc > 0 && { lowCutHz: LOWCUT.from(lc) }),
        },
      })
      out.push({ type: 'send', ch, mix: 'fx1', patch: { level: FXSEND.from(v(STATE.fx1)) } })
      out.push({ type: 'send', ch, mix: 'fx2', patch: { level: FXSEND.from(v(STATE.fx2)) } })
      MONITOR_MIXES.forEach((mix, i) =>
        out.push({ type: 'send', ch, mix, patch: { level: FADER.from(v(STATE.sends + i * 18)) } }),
      )
    }
  }
  FX_MIXES.forEach((mix, i) =>
    out.push({ type: 'bus', mix, patch: { effect: at(STATE.fxType + i) } }),
  )
  for (let b = 0; b < 15; b++)
    out.push({ type: 'geq', band: b, gain: GAIN.from(at(STATE.geq + b)) })
  return out
}

/**
 * Meter levels from F0 52 00 00 31 04 …: byte 6+n is channel n (1–20). Main and FX meters are not mapped yet.
 * Values seen are 0 (silent) or 16…25, never 2…15: read as bit 4 = signal, low 4 bits = level step 0…15.
 * shortcut: steps spread evenly over −48…0 dBFS (15 = top/clip); calibrate against the L-20's LEDs with a test tone
 */
export function decodeMeters(msg: Msg): number[] | null {
  if (msg[4] !== 0x31 || msg.length < 27) return null
  const levels = Array.from({ length: 26 }, () => FADER_MIN)
  for (let ch = 1; ch <= 20; ch++) {
    const v = msg[6 + ch]!
    levels[ch - 1] = v & 0x10 ? -48 + ((v & 0x0f) * 48) / 15 : FADER_MIN
  }
  return levels
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
