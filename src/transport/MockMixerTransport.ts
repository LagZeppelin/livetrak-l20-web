import type { IMixerTransport, MixerMessage } from './types'

/** Offline transport for development: echoes every sent message back. */
export class MockMixerTransport implements IMixerTransport {
  private listeners = new Set<(message: MixerMessage) => void>()

  async connect() {}

  async disconnect() {
    this.listeners.clear()
  }

  send(message: MixerMessage) {
    // shortcut: plain echo, no fake meters yet; extend once the data model exists
    for (const listener of this.listeners) listener(message)
  }

  onMessage(listener: (message: MixerMessage) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
