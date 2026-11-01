import { create } from 'zustand'
import { MockMixerTransport } from '@/transport/MockMixerTransport'
import type { ConnectionStatus, IMixerTransport } from '@/transport/types'

interface MixerState {
  status: ConnectionStatus
  connect: () => Promise<void>
  disconnect: () => Promise<void>
}

// shortcut: mock is hard-wired; pick BLE/mock at runtime once BleMixerTransport exists
const transport: IMixerTransport = new MockMixerTransport()

export const useMixerStore = create<MixerState>()((set) => ({
  status: 'disconnected',
  connect: async () => {
    set({ status: 'connecting' })
    try {
      await transport.connect()
      set({ status: 'connected' })
    } catch (error) {
      set({ status: 'disconnected' })
      throw error
    }
  },
  disconnect: async () => {
    await transport.disconnect()
    set({ status: 'disconnected' })
  },
}))
