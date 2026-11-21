import type { Device, DeviceCommand } from '@/lib/devices'
import type { MixerCommand } from '@/lib/mixer'
import type {
  ClientMessage,
  ConnectionStatus,
  HubMessage,
  IMixerTransport,
  MixerEvent,
} from './types'

type PiMessage = Extract<HubMessage, { type: 'pi' }>

const RETRY_MS = [500, 1000, 2000, 5000]

/**
 * Browser side of the Pi hub (iPad and phones): one WebSocket to /ws on the server that served the page.
 * Reconnects by itself when the WLAN drops; the hub then sends the full state again.
 */
export class HubTransport implements IMixerTransport {
  private ws: WebSocket | null = null
  private wanted = false
  private tries = 0
  private listeners = new Set<(e: MixerEvent) => void>()
  private deviceListeners = new Set<(d: Device[]) => void>()
  private statusListeners = new Set<(s: ConnectionStatus) => void>()
  private piListeners = new Set<(m: PiMessage) => void>()

  private hello: { id: string; phone: boolean }

  constructor(hello: { id: string; phone: boolean }) {
    this.hello = hello
  }

  connect(): Promise<void> {
    this.wanted = true
    return new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
      ))
      ws.onopen = () => {
        this.tries = 0
        this.post({ type: 'hello', ...this.hello })
        this.setStatus('connected')
        resolve()
      }
      ws.onmessage = (e) => this.receive(JSON.parse(e.data as string) as HubMessage)
      ws.onclose = () => {
        reject(new Error('Keine Verbindung zur Zentrale (Raspberry Pi).'))
        if (this.ws !== ws || !this.wanted) return
        this.setStatus('connecting')
        const wait = RETRY_MS[Math.min(this.tries++, RETRY_MS.length - 1)]
        setTimeout(() => this.wanted && this.connect().catch(() => {}), wait)
      }
    })
  }

  async disconnect(): Promise<void> {
    this.wanted = false
    this.ws?.close()
    this.ws = null
    this.setStatus('disconnected')
  }

  /** While offline, changes are dropped; the snapshot after reconnecting shows the true state again. */
  send(cmd: MixerCommand): void {
    this.post({ type: 'mixer', cmd })
  }

  sendDevice(cmd: DeviceCommand): void {
    this.post({ type: 'device', cmd })
  }

  onEvent(listener: (e: MixerEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onDevices(listener: (d: Device[]) => void): () => void {
    this.deviceListeners.add(listener)
    return () => this.deviceListeners.delete(listener)
  }

  /** L-20 link and server log for the admin panel (iPad only). */
  onPi(listener: (m: PiMessage) => void): () => void {
    this.piListeners.add(listener)
    return () => this.piListeners.delete(listener)
  }

  onStatus(listener: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  private post(msg: ClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private receive(msg: HubMessage) {
    if (msg.type === 'devices') for (const l of this.deviceListeners) l(msg.devices)
    else if (msg.type === 'pi') for (const l of this.piListeners) l(msg)
    else for (const l of this.listeners) l(msg)
  }

  private setStatus(s: ConnectionStatus) {
    for (const l of this.statusListeners) l(s)
  }
}
