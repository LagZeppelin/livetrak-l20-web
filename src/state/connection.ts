import { BleMidiTransport } from '@/transport/BleMidiTransport'
import { HubTransport } from '@/transport/HubTransport'
import { MockMixerTransport } from '@/transport/MockMixerTransport'
import type { IMixerTransport } from '@/transport/types'

const params = new URLSearchParams(globalThis.location?.search)

// ?test=… gives a test phone its own id, so several phones fit in tabs of one browser
// shortcut: the id lives in this browser only; a lasting id per device (cookie from the Pi) can follow
export const myDeviceId: string =
  params.get('test') ??
  globalThis.localStorage?.getItem('l20-device-id') ??
  (() => {
    const id = crypto.randomUUID()
    globalThis.localStorage?.setItem('l20-device-id', id)
    return id
  })()

/**
 * 'hub' = page served by the Raspberry Pi (it marks index.html), 'l20' = real L-20 over Web Bluetooth (?l20),
 * 'demo' = built-in fake mixer.
 */
export const source: 'demo' | 'l20' | 'hub' = globalThis.document?.querySelector(
  'meta[name=l20-hub]',
)
  ? 'hub'
  : params.has('l20')
    ? 'l20'
    : 'demo'

export const hub =
  source === 'hub' ? new HubTransport({ id: myDeviceId, phone: params.has('phone') }) : null

export const transport: IMixerTransport =
  hub ?? (source === 'l20' ? new BleMidiTransport() : new MockMixerTransport())
