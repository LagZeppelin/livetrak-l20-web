import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyCommand, createMixer, type Mixer, type MixerCommand } from '@/lib/mixer'
import { BleMidiTransport } from '@/transport/BleMidiTransport'
import { MockMixerTransport } from '@/transport/MockMixerTransport'
import type { ConnectionStatus, IMixerTransport } from '@/transport/types'

interface MixerState {
  /** 'demo' = built-in fake mixer, 'l20' = real L-20 over Bluetooth (needs a click to connect). */
  source: 'demo' | 'l20'
  status: ConnectionStatus
  mixer: Mixer
  /** Latest meter levels (dBFS), channels 1–20, main L/R, FX1 L/R, FX2 L/R. Kept apart from mixer so meters don't churn it. */
  meters: number[]
  /** Channels this device shows in "Ausgewählt" (phone view). Local only, never sent to the mixer. */
  visibleChannels: number[]
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  /** Applies a change locally and sends it to the mixer, mirroring it onto a stereo partner. */
  dispatch: (command: MixerCommand) => void
  toggleVisible: (ch: number) => void
}

// shortcut: picked once per page load by URL (?l20 = real mixer); the WebSocket client to the Pi joins here later
const source = new URLSearchParams(globalThis.location?.search).has('l20') ? 'l20' : 'demo'
const transport: IMixerTransport =
  source === 'l20' ? new BleMidiTransport() : new MockMixerTransport()

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

export const useMixerStore = create<MixerState>()(
  persist(
    (set, get) => ({
      source,
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
    }),
    // only the phone's own channel choice survives a reload; mixer state always comes from the mixer
    { name: 'l20-view', partialize: (s) => ({ visibleChannels: s.visibleChannels }) },
  ),
)

// Events from other devices (later via the Pi) are applied as-is: the sender already linked them.
// Moves on the L-20 itself know nothing of our stereo links, so the partner is sent along here.
transport.onEvent((event) => {
  if (event.type === 'meters') useMixerStore.setState({ meters: event.levels })
  else if (event.type === 'snapshot') useMixerStore.setState({ mixer: event.mixer })
  else {
    const partner = source === 'l20' ? partnerCommand(useMixerStore.getState().mixer, event) : null
    for (const cmd of partner ? [event, partner] : [event])
      useMixerStore.setState((s) => ({ mixer: applyCommand(s.mixer, cmd) }))
    if (partner) transport.send(partner)
  }
})
