import { create } from 'zustand'
import { applyCommand, createMixer, type Mixer, type MixerCommand } from '@/lib/mixer'
import { MockMixerTransport } from '@/transport/MockMixerTransport'
import type { ConnectionStatus, IMixerTransport } from '@/transport/types'

interface MixerState {
  status: ConnectionStatus
  mixer: Mixer
  /** Latest meter levels (dBFS), channels 1–20 then main L/R. Kept apart from mixer so meters don't churn it. */
  meters: number[]
  /** Channels this device shows in "Ausgewählt" (phone view). Local only, never sent to the mixer. */
  visibleChannels: number[]
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Applies a change locally and sends it to the mixer, mirroring it onto a stereo partner. */
  dispatch: (command: MixerCommand) => void
  toggleVisible: (ch: number) => void
}

// shortcut: mock is hard-wired; pick BLE/WebSocket/mock at runtime once those transports exist
const transport: IMixerTransport = new MockMixerTransport()

/** The command for the stereo partner, or null. Pan is mirrored; name, color and phase stay per channel. */
export function partnerCommand(mixer: Mixer, cmd: MixerCommand): MixerCommand | null {
  if (cmd.type !== 'channel' && cmd.type !== 'eq' && cmd.type !== 'send') return null
  const partner = mixer.channels[cmd.ch - 1]?.linkedWith
  if (!partner) return null
  if (cmd.type !== 'channel') return { ...cmd, ch: partner }
  const { name: _n, color: _c, phase: _p, ...patch } = cmd.patch
  if (patch.pan !== undefined) patch.pan = -patch.pan
  return Object.keys(patch).length ? { type: 'channel', ch: partner, patch } : null
}

export const useMixerStore = create<MixerState>()((set, get) => ({
  status: 'disconnected',
  mixer: createMixer(),
  meters: [],
  visibleChannels: [],
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
    set({ status: 'disconnected', meters: [] })
  },
  dispatch: (command) => {
    const partner = partnerCommand(get().mixer, command)
    for (const cmd of partner ? [command, partner] : [command]) {
      set((s) => ({ mixer: applyCommand(s.mixer, cmd) }))
      transport.send(cmd)
    }
  },
  toggleVisible: (ch) =>
    set((s) => ({
      visibleChannels: s.visibleChannels.includes(ch)
        ? s.visibleChannels.filter((c) => c !== ch)
        : [...s.visibleChannels, ch].sort((a, b) => a - b),
    })),
}))

// Events from the mixer (or, later, other devices via the iPad) are applied as-is: the sender already linked them.
transport.onEvent((event) => {
  if (event.type === 'meters') useMixerStore.setState({ meters: event.levels })
  else if (event.type === 'snapshot') useMixerStore.setState({ mixer: event.mixer })
  else useMixerStore.setState((s) => ({ mixer: applyCommand(s.mixer, event) }))
})
