import type { MixerCommand } from '@/lib/mixer'
import {
  BLE_MIDI_CHARACTERISTIC,
  BLE_MIDI_SERVICE,
  BleMidiParser,
  REQUEST_STATE,
  blePacket,
  decode,
  decodeNames,
  encode,
} from '@/lib/l20Midi'
import type { IMixerTransport, MixerEvent } from './types'

// Minimal Web Bluetooth typings (not in TS's DOM lib); only what this file uses.
interface Characteristic extends EventTarget {
  value?: DataView
  startNotifications(): Promise<unknown>
  writeValueWithoutResponse(data: BufferSource): Promise<void>
}
interface Device extends EventTarget {
  gatt?: {
    connected: boolean
    connect(): Promise<{
      getPrimaryService(
        s: string,
      ): Promise<{ getCharacteristic(c: string): Promise<Characteristic> }>
    }>
    disconnect(): void
  }
}
type Bluetooth = {
  requestDevice(o: {
    filters: { namePrefix: string }[]
    optionalServices: string[]
  }): Promise<Device>
}

/** The L-20 echoes every command; echoes of values we sent this recently are dropped so a drag doesn't jitter. */
const ECHO_MS = 400

/**
 * Talks to a real L-20 (BTA-1) from Chrome/Edge via Web Bluetooth. connect() must run from a click.
 * Commands the mapping doesn't know yet are silently not sent (see docs/protocol-l20-ble.md).
 */
export class BleMidiTransport implements IMixerTransport {
  private device: Device | null = null
  private char: Characteristic | null = null
  private listeners = new Set<(e: MixerEvent) => void>()
  private parser = new BleMidiParser()
  /** Latest unsent message per control, so a fast drag only sends where the fader is now. */
  private pending = new Map<string, number[]>()
  private writing = false
  /** Per control: when we last sent it and the values sent since; a reply with another value (e.g. a refusal) still counts. */
  private sent = new Map<string, { at: number; values: Set<number> }>()

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  async connect(): Promise<void> {
    const bt = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth
    if (!bt) throw new Error('Dieser Browser kann kein Bluetooth. Bitte Chrome oder Edge nutzen.')
    this.device = await bt.requestDevice({
      filters: [{ namePrefix: 'L-20' }],
      optionalServices: [BLE_MIDI_SERVICE],
    })
    const server = await this.device.gatt!.connect()
    const service = await server.getPrimaryService(BLE_MIDI_SERVICE)
    this.char = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC)
    this.char.addEventListener('characteristicvaluechanged', this.onValue)
    await this.char.startNotifications()
    this.queue(REQUEST_STATE)
  }

  async disconnect(): Promise<void> {
    this.char?.removeEventListener('characteristicvaluechanged', this.onValue)
    this.device?.gatt?.disconnect()
    this.device = this.char = null
    this.pending.clear()
  }

  send(command: MixerCommand): void {
    for (const msg of encode(command)) this.queue(msg)
  }

  onEvent(listener: (e: MixerEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private queue(msg: number[]) {
    const key = msg[0] === 0xf0 ? msg.join() : `${msg[0]}:${msg[1]}`
    this.pending.set(key, msg)
    if (msg[0] !== 0xf0) {
      const prev = this.sent.get(key)
      const fresh = prev && Date.now() - prev.at < ECHO_MS
      this.sent.set(key, {
        at: Date.now(),
        values: new Set(fresh ? [...prev.values, msg[2]!] : [msg[2]!]),
      })
    }
    void this.flush()
  }

  // Web Bluetooth allows one GATT write at a time, so writes go out one after another.
  private async flush() {
    if (this.writing || !this.char) return
    this.writing = true
    try {
      for (
        let next = this.pending.entries().next();
        !next.done;
        next = this.pending.entries().next()
      ) {
        const [key, msg] = next.value
        this.pending.delete(key)
        await this.char.writeValueWithoutResponse(blePacket(msg))
      }
    } finally {
      this.writing = false
    }
  }

  private onValue = (e: Event) => {
    const view = (e.target as Characteristic).value
    if (!view) return
    for (const msg of this.parser.parse(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
    )) {
      const s = this.sent.get(`${msg[0]}:${msg[1]}`)
      const echo = !!s && Date.now() - s.at < ECHO_MS && s.values.has(msg[2]!)
      const cmds = msg[0] === 0xf0 ? decodeNames(msg) : echo ? [] : [decode(msg)]
      for (const cmd of cmds) if (cmd) for (const l of this.listeners) l(cmd)
    }
  }
}
