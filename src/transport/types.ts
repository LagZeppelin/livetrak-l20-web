import type { Mixer, MixerCommand } from '@/lib/mixer'
import type { Device, DeviceCommand } from '@/lib/devices'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

/** What a transport reports back: changes made elsewhere, full state, or meter levels. */
export type MixerEvent =
  | MixerCommand
  /** Full state, e.g. after connect or scene recall. */
  | { type: 'snapshot'; mixer: Mixer }
  /** Post-fader levels in dBFS: channels 1–20, then main L/R, FX1 L/R, FX2 L/R. */
  | { type: 'meters'; levels: number[] }

/**
 * The only door between state and the mixer: mock now; later the browsers (iPad, phones) use a
 * WebSocket client to the Raspberry Pi, which talks BLE to the L-20. Commands are plain JSON so the Pi can relay
 * a phone's commands to the L-20 unchanged.
 */
export interface IMixerTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(command: MixerCommand): void
  /** Returns an unsubscribe function. */
  onEvent(listener: (event: MixerEvent) => void): () => void
}

/** The Pi's Bluetooth link to the L-20, for the admin panel. demo = the Pi runs the built-in fake mixer. */
export interface L20Link {
  state: 'searching' | 'connected' | 'error' | 'demo'
  /** ms since 1970, when this state began */
  since: number
  error?: string
}

/** One line of the Pi's server log. */
export interface PiLogLine {
  t: number
  error: boolean
  text: string
}

/**
 * What the Pi sends to each browser: mixer events plus the phone list; the iPad (not phones) also gets
 * the L-20 link and the server log (pi: after hello link + whole log, then each change: link alone or one new line).
 */
export type HubMessage =
  | MixerEvent
  | { type: 'devices'; devices: Device[] }
  | { type: 'pi'; link?: L20Link; log?: PiLogLine[] }

/** What a browser sends to the Pi. hello comes first and says who it is. */
export type ClientMessage =
  | { type: 'hello'; id: string; phone: boolean }
  | { type: 'mixer'; cmd: MixerCommand }
  | { type: 'device'; cmd: DeviceCommand }
