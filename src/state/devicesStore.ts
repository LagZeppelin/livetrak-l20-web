import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyDeviceCommand, type Device, type DeviceCommand } from '@/lib/devices'
import { hub } from './connection'

export { myDeviceId } from './connection'

interface DevicesState {
  devices: Device[]
  dispatch: (command: DeviceCommand) => void
}

const KEY = 'l20-devices'

// Without the Pi, localStorage stands in for it, so only tabs of one browser see each other.
// On the Pi the hub owns the list: changes go there and come back to every browser.
export const useDevicesStore = create<DevicesState>()(
  persist(
    (set) => ({
      devices: [],
      dispatch: (command) =>
        hub
          ? hub.sendDevice(command)
          : set((s) => ({ devices: applyDeviceCommand(s.devices, command) })),
    }),
    { name: KEY, partialize: (s) => ({ devices: s.devices }) },
  ),
)

globalThis.addEventListener?.('storage', (e) => {
  if (e.key === KEY) void useDevicesStore.persist.rehydrate()
})

hub?.onDevices((devices) => useDevicesStore.setState({ devices }))
