import type { MonitorMixId } from './mixer'

/** A musician's phone as the admin (iPad) sees it. */
export interface Device {
  id: string
  name: string
  /** The monitor mix this phone controls; null = waiting for the admin. One mix belongs to one phone. */
  mix: MonitorMixId | null
  /** May open the full mixer (FOH view), not only its own mix. */
  foh: boolean
}

export type DeviceCommand =
  | { type: 'join'; id: string; name: string }
  | { type: 'assign'; id: string; mix: MonitorMixId | null }
  | { type: 'foh'; id: string; allowed: boolean }
  | { type: 'remove'; id: string }

/** Applies one admin or phone action. Assigning a mix takes it away from whoever had it (1:1). */
export function applyDeviceCommand(devices: Device[], cmd: DeviceCommand): Device[] {
  switch (cmd.type) {
    case 'join': {
      const name = cmd.name.trim()
      if (!name) return devices
      const known = devices.some((d) => d.id === cmd.id)
      return known
        ? devices.map((d) => (d.id === cmd.id ? { ...d, name } : d))
        : [...devices, { id: cmd.id, name, mix: null, foh: false }]
    }
    case 'assign':
      return devices.map((d) =>
        d.id === cmd.id
          ? { ...d, mix: cmd.mix }
          : cmd.mix && d.mix === cmd.mix
            ? { ...d, mix: null }
            : d,
      )
    case 'foh':
      return devices.map((d) => (d.id === cmd.id ? { ...d, foh: cmd.allowed } : d))
    case 'remove':
      return devices.filter((d) => d.id !== cmd.id)
  }
}
