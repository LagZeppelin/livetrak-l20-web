import type { Mixer, MixerCommand } from '@/lib/mixer'

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
