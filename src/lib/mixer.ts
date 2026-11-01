/**
 * L-20 data model and the one pure reducer that applies commands to it.
 * Lives in src/lib so transport (mock/BLE/WebSocket), state and UI share it.
 * Everything here is plain JSON so it can travel browser -> Pi -> L-20 unchanged.
 */

export const CHANNEL_COUNT = 20
/** Fader floor; the design scale ends at -60 and doubles as "off" (JSON has no -Infinity). */
export const FADER_MIN = -60
export const FADER_MAX = 10
export const EQ_GAIN_MAX = 15
export const GEQ_BANDS = [
  25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000,
] as const
export const SCENE_SLOTS = 9
/** Effect types per FX bus (L-20 operation manual); `FxBus.effect` indexes the bus's list, `params` names its two knobs. */
const fx = (name: string, p1: string, p2: string) => ({ name, params: [p1, p2] as const })
export const EFFECTS = {
  fx1: [
    fx('Hall 1', 'Tone', 'Decay'),
    fx('Hall 2', 'Tone', 'Decay'),
    fx('Room 1', 'Tone', 'Decay'),
    fx('Plate', 'Tone', 'Decay'),
    fx('Church', 'Tone', 'Decay'),
    fx('DrumAmb', 'Tone', 'Decay'),
    fx('GateRev', 'Tone', 'Decay'),
    fx('Vocal 1', 'Time', 'Decay'),
    fx('Vocal 2', 'Time', 'Decay'),
    fx('Vocal 3', 'Time', 'Decay'),
  ],
  fx2: [
    fx('Hall 3', 'Tone', 'Decay'),
    fx('Room 2', 'Tone', 'Decay'),
    fx('Spring', 'Tone', 'Decay'),
    fx('Delay', 'Time', 'Feedback'),
    fx('Analog', 'Time', 'Feedback'),
    fx('P-P Dly', 'Time', 'Feedback'),
    fx('Vocal 4', 'Time', 'Decay'),
    fx('Chorus 1', 'Tone', 'Rate'),
    fx('Chorus 2', 'Tone', 'Rate'),
    fx('Cho+Dly', 'Time', 'Rate'),
  ],
}
/** Channel names on the L-20 hold at most 8 characters. */
export const NAME_MAX = 8
/** Low cut corner frequency range of the channel EQ (12 dB/oct). */
export const LOW_CUT_MIN_HZ = 40
export const LOW_CUT_MAX_HZ = 600
/** Left channel of the pairs the hardware wires as stereo inputs (17/18, 19/20); never unlinked. */
export const FIXED_STEREO = [17, 19] as const

export const MONITOR_MIXES = ['A', 'B', 'C', 'D', 'E', 'F'] as const
export const FX_MIXES = ['fx1', 'fx2'] as const
export type MonitorMixId = (typeof MONITOR_MIXES)[number]
export type FxMixId = (typeof FX_MIXES)[number]
export type SendMixId = MonitorMixId | FxMixId
export type MixId = 'main' | SendMixId

export interface Eq {
  on: boolean
  lowCut: boolean
  /** Low cut corner, LOW_CUT_MIN_HZ … LOW_CUT_MAX_HZ. */
  lowCutHz: number
  /** All gains in dB, ±EQ_GAIN_MAX. */
  low: number
  midGain: number
  midFreq: number
  high: number
}

/** Send level of a channel into a mix. Like the L-20, each mix A–F has its own fader per channel, independent of the main fader (no pre/post). */
export interface Send {
  level: number
}

export interface Channel {
  /** 1-based, as printed on the mixer. */
  id: number
  name: string
  color: string
  fader: number
  mute: boolean
  solo: boolean
  /** -100 (L100) … 100 (R100). */
  pan: number
  phase: boolean
  recSelect: boolean
  eq: Eq
  sends: Record<SendMixId, Send>
  /** Adjacent channel this one is stereo-linked with, or null. */
  linkedWith: number | null
}

export interface Bus {
  fader: number
  mute: boolean
}

export interface FxBus extends Bus {
  /** Index into the L-20 effect list (dropdown). */
  effect: number
  /** The effect's two parameter knobs (names in EFFECTS), 0–100 each. */
  params: [number, number]
}

/** `standby` = REC pressed, waiting for PLAY; `recPaused` = recording paused (REC blinks). */
export type RecorderState = 'stopped' | 'standby' | 'recording' | 'recPaused' | 'playing' | 'paused'
export type TransportButton = 'rec' | 'play' | 'stop'

/**
 * The L-20 recorder buttons as a state machine (operation manual p. 39–43):
 * REC → standby, then PLAY starts recording. With OVER DUB on, REC during playback punches in, REC again punches out.
 * shortcut: REC in standby cancels and PLAY during recording pauses it; the manual implies both but doesn't spell them out, verify on the device.
 */
export function pressTransport(r: Recorder, button: TransportButton): RecorderState {
  if (button === 'stop') return 'stopped'
  const next: Record<RecorderState, RecorderState> =
    button === 'rec'
      ? {
          stopped: 'standby',
          standby: 'stopped',
          playing: r.overdub ? 'recording' : 'playing',
          recording: r.overdub ? 'playing' : 'recording',
          recPaused: 'recPaused',
          paused: 'paused',
        }
      : {
          stopped: 'playing',
          standby: 'recording',
          playing: 'paused',
          paused: 'playing',
          recording: 'recPaused',
          recPaused: 'recording',
        }
  return next[r.state]
}

export interface Recorder {
  state: RecorderState
  overdub: boolean
  /** Seconds. */
  position: number
}

export interface Mixer {
  channels: Channel[]
  main: Bus & { geq: number[] }
  monitors: Record<MonitorMixId, Bus>
  fx: Record<FxMixId, FxBus>
  /** Last recalled/saved scene slot (1–9) or null. */
  scene: number | null
  sceneNames: string[]
  recorder: Recorder
}

export type ChannelPatch = Partial<
  Pick<Channel, 'name' | 'color' | 'fader' | 'mute' | 'solo' | 'pan' | 'phase' | 'recSelect'>
>

/** Every change to the mixer, from any device, is one of these. */
export type MixerCommand =
  | { type: 'channel'; ch: number; patch: ChannelPatch }
  | { type: 'eq'; ch: number; patch: Partial<Eq> }
  | { type: 'send'; ch: number; mix: SendMixId; patch: Partial<Send> }
  /** Links ch with ch+1 (linked=true) or dissolves whatever link ch is in. */
  | { type: 'link'; ch: number; linked: boolean }
  | { type: 'bus'; mix: MixId; patch: Partial<FxBus> }
  | { type: 'geq'; band: number; gain: number }
  | { type: 'scene'; action: 'save' | 'recall'; slot: number; name?: string }
  /** A press on REC, PLAY/PAUSE or STOP; the reducer works out the new state like the L-20 does. */
  | { type: 'transport'; button: TransportButton }
  | { type: 'recorder'; patch: Partial<Recorder> }

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const fader = (v: number) => clamp(v, FADER_MIN, FADER_MAX)
const gain = (v: number) => clamp(v, -EQ_GAIN_MAX, EQ_GAIN_MAX)

export function createMixer(): Mixer {
  const sends = () =>
    Object.fromEntries(
      [...MONITOR_MIXES, ...FX_MIXES].map((m) => [m, { level: FADER_MIN }]),
    ) as Record<SendMixId, Send>
  const channels: Channel[] = Array.from({ length: CHANNEL_COUNT }, (_, i) => ({
    id: i + 1,
    name: `CH ${i + 1}`,
    color: '#8b8f98',
    fader: 0,
    mute: false,
    solo: false,
    pan: 0,
    phase: false,
    recSelect: false,
    eq: { on: true, lowCut: false, lowCutHz: 80, low: 0, midGain: 0, midFreq: 1000, high: 0 },
    sends: sends(),
    linkedWith: null,
  }))
  for (const left of FIXED_STEREO) {
    channels[left - 1].linkedWith = left + 1
    channels[left].linkedWith = left
  }
  const bus = (): Bus => ({ fader: 0, mute: false })
  return {
    channels,
    main: { ...bus(), geq: GEQ_BANDS.map(() => 0) },
    monitors: Object.fromEntries(MONITOR_MIXES.map((m) => [m, bus()])) as Record<MonitorMixId, Bus>,
    fx: {
      fx1: { ...bus(), effect: 0, params: [50, 50] },
      fx2: { ...bus(), effect: 0, params: [50, 50] },
    },
    scene: null,
    sceneNames: Array.from({ length: SCENE_SLOTS }, (_, i) => `Szene ${i + 1}`),
    recorder: { state: 'stopped', overdub: false, position: 0 },
  }
}

/** Can ch be linked with ch+1? Both must exist and be unlinked. */
export function canLink(mixer: Mixer, ch: number): boolean {
  const a = mixer.channels[ch - 1]
  const b = mixer.channels[ch]
  return !!a && !!b && a.linkedWith === null && b.linkedWith === null
}

/**
 * Applies one command and returns a new Mixer (input untouched).
 * Values are clamped and unknown targets ignored: commands may arrive from any browser over the LAN.
 * Shape checks of raw JSON (unknown keys, wrong types) belong to the future WebSocket layer.
 * Scene commands are hardware actions; the mixer answers with a full snapshot, so they are no-ops here
 * apart from remembering the slot.
 */
export function applyCommand(mixer: Mixer, cmd: MixerCommand): Mixer {
  const updateChannel = (ch: number, fn: (c: Channel) => Channel): Mixer => {
    if (!mixer.channels[ch - 1]) return mixer
    return { ...mixer, channels: mixer.channels.map((c) => (c.id === ch ? fn(c) : c)) }
  }

  switch (cmd.type) {
    case 'channel': {
      const p = { ...cmd.patch }
      if (p.fader !== undefined) p.fader = fader(p.fader)
      if (p.pan !== undefined) p.pan = clamp(Math.round(p.pan), -100, 100)
      if (p.name !== undefined) p.name = p.name.slice(0, NAME_MAX)
      return updateChannel(cmd.ch, (c) => ({ ...c, ...p }))
    }
    case 'eq': {
      const p = { ...cmd.patch }
      for (const k of ['low', 'midGain', 'high'] as const) if (p[k] !== undefined) p[k] = gain(p[k])
      if (p.midFreq !== undefined) p.midFreq = clamp(p.midFreq, 100, 8000)
      if (p.lowCutHz !== undefined)
        p.lowCutHz = clamp(Math.round(p.lowCutHz), LOW_CUT_MIN_HZ, LOW_CUT_MAX_HZ)
      return updateChannel(cmd.ch, (c) => ({ ...c, eq: { ...c.eq, ...p } }))
    }
    case 'send': {
      if (!(cmd.mix in mixer.channels[0].sends)) return mixer
      const p = { ...cmd.patch }
      if (p.level !== undefined) p.level = fader(p.level)
      return updateChannel(cmd.ch, (c) => ({
        ...c,
        sends: { ...c.sends, [cmd.mix]: { ...c.sends[cmd.mix], ...p } },
      }))
    }
    case 'link': {
      const { ch } = cmd
      if (cmd.linked) {
        if (!canLink(mixer, ch)) return mixer
        return {
          ...mixer,
          channels: mixer.channels.map((c) =>
            c.id === ch
              ? { ...c, linkedWith: ch + 1 }
              : c.id === ch + 1
                ? { ...c, linkedWith: ch }
                : c,
          ),
        }
      }
      const partner = mixer.channels[ch - 1]?.linkedWith
      if (!partner || FIXED_STEREO.includes(Math.min(ch, partner) as 17 | 19)) return mixer
      return {
        ...mixer,
        channels: mixer.channels.map((c) =>
          c.id === ch || c.id === partner ? { ...c, linkedWith: null } : c,
        ),
      }
    }
    case 'bus': {
      const p = { ...cmd.patch }
      if (p.fader !== undefined) p.fader = fader(p.fader)
      if (p.params !== undefined)
        p.params = p.params.map((v) => clamp(v, 0, 100)) as [number, number]
      if (p.effect !== undefined) p.effect = clamp(Math.round(p.effect), 0, EFFECTS.fx1.length - 1)
      if (cmd.mix === 'main') {
        const { fader: f, mute } = p
        return { ...mixer, main: { ...mixer.main, ...strip({ fader: f, mute }) } }
      }
      if (cmd.mix === 'fx1' || cmd.mix === 'fx2')
        return { ...mixer, fx: { ...mixer.fx, [cmd.mix]: { ...mixer.fx[cmd.mix], ...p } } }
      if (!(cmd.mix in mixer.monitors)) return mixer
      const { fader: f, mute } = p
      return {
        ...mixer,
        monitors: {
          ...mixer.monitors,
          [cmd.mix]: { ...mixer.monitors[cmd.mix], ...strip({ fader: f, mute }) },
        },
      }
    }
    case 'geq': {
      if (!(cmd.band in mixer.main.geq)) return mixer
      const geq = mixer.main.geq.map((g, i) => (i === cmd.band ? gain(cmd.gain) : g))
      return { ...mixer, main: { ...mixer.main, geq } }
    }
    case 'scene': {
      if (cmd.slot < 1 || cmd.slot > SCENE_SLOTS) return mixer
      const sceneNames =
        cmd.action === 'save' && cmd.name
          ? mixer.sceneNames.map((n, i) => (i === cmd.slot - 1 ? cmd.name! : n))
          : mixer.sceneNames
      return { ...mixer, scene: cmd.slot, sceneNames }
    }
    case 'transport':
      return {
        ...mixer,
        recorder: { ...mixer.recorder, state: pressTransport(mixer.recorder, cmd.button) },
      }
    case 'recorder':
      return { ...mixer, recorder: { ...mixer.recorder, ...cmd.patch } }
  }
}

/** Drops undefined keys so a partial patch never overwrites a value with undefined. */
function strip<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>
}
