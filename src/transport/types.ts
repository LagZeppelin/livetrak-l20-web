export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

/**
 * Placeholder message shape. Replaced by the real parameter model
 * once the user flows and the L-20 protocol are clear.
 */
export interface MixerMessage {
  type: string
  payload?: unknown
}

/** The only door between state and the mixer (mock, BLE, later WebSocket client). */
export interface IMixerTransport {
  connect(): Promise<void>
  disconnect(): Promise<void>
  send(message: MixerMessage): void
  /** Returns an unsubscribe function. */
  onMessage(listener: (message: MixerMessage) => void): () => void
}
