import { applyCommand, createMixer, FADER_MIN, type Mixer, type MixerCommand } from '@/lib/mixer'
import type { IMixerTransport, MixerEvent } from './types'

const METER_MS = 50

/** Demo band from the designs: 1 Guitar, 2 Bass, 3/4 Keys, 5/6 DJ, 7/8 Drums (stereo pairs linked). */
export function createDemoMixer(): Mixer {
  const seed: [string, string][] = [
    ['Guitar', '#5aa9f0'],
    ['Bass', '#a98bf0'],
    ['Keys L', '#3ecf8e'],
    ['Keys R', '#3ecf8e'],
    ['DJ L', '#f2667a'],
    ['DJ R', '#f2667a'],
    ['Drums L', '#f2a04b'],
    ['Drums R', '#f2a04b'],
  ]
  let mixer = createMixer()
  seed.forEach(([name, color], i) => {
    mixer = applyCommand(mixer, { type: 'channel', ch: i + 1, patch: { name, color } })
  })
  // fader, mix C send, FX1 send, EQ low/mid/high (dB) per channel, so the demo looks like the designs
  const levels: [number, number, number, number, number, number][] = [
    [-6, 2, -14, 2, -3, 1],
    [-3, -12, -40, 4, -2, -4],
    [-8, -8, -50, 2, -3, 1],
    [-8, -8, -50, 2, -3, 1],
    [-4, -60, -60, 0, 2, 3],
    [-4, -60, -60, 0, 2, 3],
    [-1, -20, -45, 3, -4, 2],
    [-1, -20, -45, 3, -4, 2],
  ]
  levels.forEach(([fader, c, fx1, low, midGain, high], i) => {
    const ch = i + 1
    mixer = applyCommand(mixer, { type: 'channel', ch, patch: { fader } })
    mixer = applyCommand(mixer, { type: 'send', ch, mix: 'C', patch: { level: c } })
    mixer = applyCommand(mixer, { type: 'send', ch, mix: 'fx1', patch: { level: fx1 } })
    mixer = applyCommand(mixer, { type: 'eq', ch, patch: { lowCut: true, low, midGain, high } })
  })
  mixer = applyCommand(mixer, { type: 'bus', mix: 'C', patch: { fader: -2 } })
  for (const left of [3, 5, 7]) {
    mixer = applyCommand(mixer, { type: 'link', ch: left, linked: true })
    mixer = applyCommand(mixer, { type: 'channel', ch: left, patch: { pan: -100 } })
    mixer = applyCommand(mixer, { type: 'channel', ch: left + 1, patch: { pan: 100 } })
  }
  return mixer
}

/** Length of the demo take, so the progress bar has something to show. */
const DEMO_TAKE_S = 240

/**
 * Offline stand-in for the L-20: keeps its own state, stores scenes,
 * runs a fake recorder clock and emits fake meters.
 */
export class MockMixerTransport implements IMixerTransport {
  private listeners = new Set<(event: MixerEvent) => void>()
  private mixer = createDemoMixer()
  private scenes = new Map<number, Mixer>()
  private timer: ReturnType<typeof setInterval> | undefined
  private ticks = 0

  async connect() {
    this.timer ??= setInterval(() => this.tick(), METER_MS)
    this.emit({ type: 'snapshot', mixer: this.mixer })
  }

  async disconnect() {
    clearInterval(this.timer)
    this.timer = undefined
  }

  send(command: MixerCommand) {
    this.mixer = applyCommand(this.mixer, command)
    if (command.type !== 'scene') return
    if (command.action === 'save') this.scenes.set(command.slot, this.mixer)
    const saved = this.scenes.get(command.slot)
    if (command.action === 'recall' && saved) {
      // the recorder keeps running across scene changes, like on the hardware
      this.mixer = { ...saved, scene: command.slot, recorder: this.mixer.recorder }
      this.emit({ type: 'snapshot', mixer: this.mixer })
    }
  }

  onEvent(listener: (event: MixerEvent) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: MixerEvent) {
    for (const listener of this.listeners) listener(event)
  }

  private tick() {
    const { channels, main, fx, recorder } = this.mixer
    // noise around fader level; muted channels and a muted main read silent
    const level = (fader: number, mute: boolean) =>
      mute ? FADER_MIN : Math.min(0, fader - 12 + Math.random() * 10)
    const levels = channels.map((c) => level(c.fader, c.mute))
    const sum = Math.max(...levels)
    levels.push(level(sum + main.fader, main.mute), level(sum + main.fader, main.mute))
    for (const id of ['fx1', 'fx2'] as const) {
      // loudest channel send into the effect, then the return fader
      const peak = Math.max(...channels.map((c, i) => levels[i] + c.sends[id].level))
      levels.push(level(peak + fx[id].fader, fx[id].mute), level(peak + fx[id].fader, fx[id].mute))
    }
    this.emit({ type: 'meters', levels })

    this.ticks++
    if (
      this.ticks % (1000 / METER_MS) === 0 &&
      (recorder.state === 'playing' || recorder.state === 'recording')
    ) {
      const position = recorder.position + 1
      const patch = { position, length: Math.max(DEMO_TAKE_S, position) }
      this.mixer = applyCommand(this.mixer, { type: 'recorder', patch })
      this.emit({ type: 'recorder', patch })
    }
  }
}
