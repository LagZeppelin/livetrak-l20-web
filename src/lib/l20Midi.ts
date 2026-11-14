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
 * A control's wire value through points read off the official app (capture 3), straight lines in between.
 * `log` interpolates in log space (frequency knobs). Both columns must rise.
 */
const curve = (pts: [number, number][], log = false) => {
  const f = log ? Math.log : (x: number) => x
  const seg = (x: number, col: 0 | 1) => {
    let k = 1
    while (k < pts.length - 1 && x > pts[k]![col]) k++
    return [pts[k - 1]!, pts[k]!] as const
  }
  const top = pts[pts.length - 1]![0]
  return {
    to: (v: number) => {
      const [[r0, v0], [r1, v1]] = seg(v, 1)
      return clamp(r0 + ((f(v) - f(v0)) * (r1 - r0)) / (f(v1) - f(v0)), pts[0]![0], top)
    },
    from: (raw: number) => {
      const [[r0, v0], [r1, v1]] = seg(raw, 0)
      const y = f(v0) + ((raw - r0) * (f(v1) - f(v0))) / (r1 - r0)
      return log ? Math.round(Math.exp(y)) : y
    },
  }
}
/** Channel faders, mix A–F sends and bus faders: 0…120 (0 = off; −40/−20/−10/0/+10 dB at 8/27/45/82/120). */
const FADER = curve([
  [0, FADER_MIN],
  [8, -40],
  [27, -20],
  [45, -10],
  [82, 0],
  [120, FADER_MAX],
])
/** FX sends: 0…60, 0 dB = 45, top = +10 dB. shortcut: straight lines below 0 dB, only the ends were read off */
const FXSEND = curve([
  [0, FADER_MIN],
  [45, 0],
  [60, FADER_MAX],
])
/** EQ and GEQ gains: 0…60, 30 = 0 dB, 0.5 dB steps (both ends captured as ±15 dB). */
const GAIN = { to: (db: number) => clamp(db * 2 + 30, 0, 60), from: (v: number) => (v - 30) / 2 }
/** Low cut pot: 0 = off, 1…56 = 40…600 Hz; points in between from captures 3 and 4. */
const LOWCUT = curve(
  [
    [1, LOW_CUT_MIN_HZ],
    [11, 60],
    [24, 101.4],
    [37, 204.9],
    [49, 403.9],
    [56, LOW_CUT_MAX_HZ],
  ],
  true,
)
/** Mid frequency: 0…96 = 100 Hz…8 kHz; points in between from captures 3 and 4. */
const MIDFREQ = curve(
  [
    [0, 100],
    [16, 200],
    [37, 497],
    [53, 1017],
    [76, 3065],
    [96, 8000],
  ],
  true,
)

/** Per-channel controls: CC number for channels 1–16; channels 17–20 use the next CC (n+1) on MIDI channel 0–3. */
const CH = {
  select: 0x08,
  phase: 0x0a,
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

/** Bus outputs: main, FX 1/2 returns, Mix A–F on MIDI channels 0–5 (all captured). */
const BUS: Partial<Record<MixId, [number, number]>> = {
  main: [0x0a, 0x54],
  fx1: [0x0c, 0x50],
  fx2: [0x0d, 0x50],
  ...Object.fromEntries(MONITOR_MIXES.map((m, i) => [m, [i, 0x53]])),
}

/**
 * FX return into Mix A–F: 12 slots of four (FX 1, FX 2, two unused) running over CC 0x51 and 0x52 (capture 4):
 * A = B0/B1 51, B = B4/B5 51, C = B8/B9 51, D = BC/BD 51, E = B0/B1 52, F = B4/B5 52.
 */
const mixFxAddr = (mix: number, fx: number) => {
  const i = mix * 4 + fx
  return { m: i & 15, n: 0x51 + (i >> 4) }
}
/** Effect knobs on CC 0x4E as MSB/LSB pairs: [MSB channel] per FX bus and knob (LSB is the next channel). */
const KNOB = { fx1: [0x04, 0x0c], fx2: [0x06, 0x0e] } as const

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
      if (p.phase !== undefined) put(CH.phase, +p.phase)
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
    if (cmd.mix === 'main' && cmd.patch.mute !== undefined)
      out.push(cc(0x09, 0x54, +cmd.patch.mute))
    const mix = MONITOR_MIXES.indexOf(cmd.mix as never)
    FX_MIXES.forEach((fx, f) => {
      const level = cmd.patch[fx]
      if (mix < 0 || level === undefined) return
      const a = mixFxAddr(mix, f)
      out.push(cc(a.m, a.n, FADER.to(level)))
    })
    if (fxIndex >= 0)
      cmd.patch.params?.forEach((value, index) =>
        out.push(
          ...encode({ type: 'fxParam', mix: FX_MIXES[fxIndex]!, index: index as 0 | 1, value }),
        ),
      )
  } else if (cmd.type === 'fxParam') {
    const m = KNOB[cmd.mix][cmd.index]
    const v = clamp(cmd.value, 0, 0x3fff)
    out.push(cc(m, 0x4e, v >> 7), cc(m + 1, 0x4e, v & 0x7f))
  } else if (cmd.type === 'geq') {
    out.push(cc(cmd.band, 0x55, GAIN.to(cmd.gain)))
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
  if (n === 0x54 && m === 0x09) return { type: 'bus', mix: 'main', patch: { mute: v > 0 } }
  if (n === 0x55 && m < 15) return { type: 'geq', band: m, gain: GAIN.from(v) }
  if (n === 0x51 || n === 0x52) {
    const i = (n - 0x51) * 16 + m
    const mix = MONITOR_MIXES[i >> 2]
    const fx = FX_MIXES[i & 3]
    return mix && fx ? { type: 'bus', mix, patch: { [fx]: FADER.from(v) } } : null
  }
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
    case CH.phase:
      return channel({ phase: v > 0 })
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

const CLOCK = { 0x07: 'length', 0x0b: 'position', 0x0f: 'remaining' } as const
/**
 * Recorder counters on CC 58, four channels each (hours MSB, hours LSB, minutes, seconds; capture 4):
 * B4–B7 = length of the take, B8–BB = position, BC–BF = recording time left on the SD card.
 * `digits` keeps the last values; a counter is reported when its seconds byte arrives.
 */
export function decodeClock(msg: Msg, digits: number[]): MixerCommand | null {
  const m = msg[0]! & 0x0f
  if ((msg[0]! & 0xf0) !== 0xb0 || msg[1] !== 0x58 || m < 0x04) return null
  digits[m] = msg[2]!
  if (!(m in CLOCK)) return null
  const [hHi = 0, hLo = 0, min = 0, s = 0] = digits.slice(m - 3, m + 1)
  const secs = ((hHi * 128 + hLo) * 60 + min) * 60 + s
  return { type: 'recorder', patch: { [CLOCK[m as keyof typeof CLOCK]]: secs } }
}

/** Effect knob from its MSB/LSB pair on CC 0x4E; `msb` keeps the last MSB per MIDI channel. */
export function decodeKnob(msg: Msg, msb: number[]): MixerCommand | null {
  const m = msg[0]! & 0x0f
  if ((msg[0]! & 0xf0) !== 0xb0 || msg[1] !== 0x4e) return null
  for (const mix of FX_MIXES)
    for (const index of [0, 1] as const) {
      const hi = KNOB[mix][index]
      if (m === hi) msb[m] = msg[2]!
      if (m === hi + 1)
        return { type: 'fxParam', mix, index, value: (msb[hi] ?? 0) * 128 + msg[2]! }
    }
  return null
}

/** Offsets of 18-byte arrays (one byte per strip: 1–16, 17/18, 19/20) in the state block after the names. */
const STATE = {
  select: 18,
  mute: 36,
  solo: 54,
  phase: 72,
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
  knobs: 380, // MSB/LSB pairs: FX1 knob 1, FX2 knob 1, FX1 knob 2, FX2 knob 2
  fxReturn: 392, // FX 1, FX 2 into the main mix
  mixFx: 394, // FX 1, FX 2 into Mix A, then B … F (❓ order, all zero so far)
  main: 408,
  monitors: 409, // Mix A–F outputs
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
        solo: v(STATE.solo) > 0,
        phase: v(STATE.phase) > 0,
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
    out.push({
      type: 'bus',
      mix,
      patch: {
        effect: at(STATE.fxType + i),
        fader: FADER.from(at(STATE.fxReturn + i)),
        params: [0, 1].map((k) => {
          const o = STATE.knobs + (k * 2 + i) * 2
          return at(o) * 128 + at(o + 1)
        }) as [number, number],
      },
    }),
  )
  out.push({ type: 'bus', mix: 'main', patch: { fader: FADER.from(at(STATE.main)) } })
  MONITOR_MIXES.forEach((mix, i) =>
    out.push({
      type: 'bus',
      mix,
      patch: {
        fader: FADER.from(at(STATE.monitors + i)),
        fx1: FADER.from(at(STATE.mixFx + i * 2)),
        fx2: FADER.from(at(STATE.mixFx + i * 2 + 1)),
      },
    }),
  )
  for (let b = 0; b < 15; b++)
    out.push({ type: 'geq', band: b, gain: GAIN.from(at(STATE.geq + b)) })
  return out
}

/**
 * One meter byte in dBFS, calibrated with the 1 kHz test tone in 3 dB steps (capture 4): low 4 bits = step,
 * 10 = 0 dBFS, each step below = −3 dB down to 2 = −24; 1 covers −27…−42, 0 ≈ −45. Channel bytes also set
 * bit 4 (signal) and bit 5 (clip); without bit 4 a channel is silent.
 */
const meterDb = (v: number) => {
  const step = v & 0x0f
  return step >= 2 ? step * 3 - 30 : step === 1 ? -33 : -45
}

/**
 * Meter levels from F0 52 00 00 31 04 …: byte 6 = the app's view (B5 57), byte 6+n = channel n (1–20),
 * bytes 55/56 = main L/R after the master fader (capture 4; R ❓, the test tone was panned hard left).
 * FX meters are not found yet.
 */
export function decodeMeters(msg: Msg): number[] | null {
  if (msg[4] !== 0x31 || msg.length < 58) return null
  const levels = Array.from({ length: 26 }, () => FADER_MIN)
  for (let ch = 1; ch <= 20; ch++) {
    const v = msg[6 + ch]!
    levels[ch - 1] = v & 0x30 ? meterDb(v) : FADER_MIN
  }
  for (const side of [0, 1]) {
    const v = msg[55 + side]!
    levels[20 + side] = v ? meterDb(v) : FADER_MIN
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
