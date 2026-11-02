import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyDeviceCommand, type Device, type DeviceCommand } from '@/lib/devices'

interface DevicesState {
  devices: Device[]
  dispatch: (command: DeviceCommand) => void
}

const KEY = 'l20-devices'

// shortcut: localStorage stands in for the Pi, so only tabs of one browser see each other; the Pi's WebSocket replaces this in the Pi phase
export const useDevicesStore = create<DevicesState>()(
  persist(
    (set) => ({
      devices: [],
      dispatch: (command) => set((s) => ({ devices: applyDeviceCommand(s.devices, command) })),
    }),
    { name: KEY, partialize: (s) => ({ devices: s.devices }) },
  ),
)

globalThis.addEventListener?.('storage', (e) => {
  if (e.key === KEY) void useDevicesStore.persist.rehydrate()
})

// ?test=… gives a test phone its own id, so several phones fit in tabs of one browser
const testId = new URLSearchParams(globalThis.location?.search).get('test')
// shortcut: the id lives in this browser only; the Pi hands out a lasting id (cookie) later
export const myDeviceId: string =
  testId ??
  globalThis.localStorage?.getItem('l20-device-id') ??
  (() => {
    const id = crypto.randomUUID()
    globalThis.localStorage?.setItem('l20-device-id', id)
    return id
  })()
