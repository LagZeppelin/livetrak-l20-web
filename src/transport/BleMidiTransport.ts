import type { MixerCommand } from '@/lib/mixer'
import {
  BLE_MIDI_CHARACTERISTIC,
  BLE_MIDI_SERVICE,
  BleMidiParser,
  HELLO,
  blePacket,
  decode,
  decodeClock,
  decodeKnob,
  decodeMeters,
  decodeState,
  encode,
} from '@/lib/l20Midi'
import type { IMixerTransport, MixerEvent } from './types'

/** One BLE-MIDI connection to the L-20: Web Bluetooth in the browser, BlueZ on the Pi (server/ble.ts). */
export interface BleLink {
  /** Sends one BLE-MIDI packet; only one write at a time. */
  write(packet: Uint8Array<ArrayBuffer>): Promise<void>
  /** Incoming notification bytes. */
  onData(listener: (bytes: Uint8Array) => void): void
  close(): void
}

// Minimal Web Bluetooth typings (not in TS's DOM lib); only what openWebBluetooth uses.
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

/** Chrome/Edge: asks the user to pick the L-20 (must run from a click). */
async function openWebBluetooth(): Promise<BleLink> {
  const bt = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth
  if (!bt) throw new Error('Dieser Browser kann kein Bluetooth. Bitte Chrome oder Edge nutzen.')
  const device = await bt.requestDevice({
    filters: [{ namePrefix: 'L-20' }],
    optionalServices: [BLE_MIDI_SERVICE],
  })
  const server = await device.gatt!.connect()
  const service = await server.getPrimaryService(BLE_MIDI_SERVICE)
  const char = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC)
  let listener: (e: Event) => void = () => {}
  char.addEventListener('characteristicvaluechanged', (e) => listener(e))
  await char.startNotifications()
  return {
    write: (packet) => char.writeValueWithoutResponse(packet),
    onData: (l) => {
      listener = (e) => {
        const view = (e.target as Characteristic).value
        if (view) l(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
      }
    },
    close: () => device.gatt?.disconnect(),
  }
}

/** The L-20 echoes every command; echoes of values we sent this recently are dropped so a drag doesn't jitter. */
const ECHO_MS = 400

/**
 * Talks to a real L-20 (BTA-1): from Chrome/Edge via Web Bluetooth (connect() must run from a click),
 * or from the Pi with a BlueZ link passed in.
 * Commands the mapping doesn't know yet are silently not sent (see docs/protocol-l20-ble.md).
 */
const BATCH = 20
const BATCH_PAUSE_MS = 60

export class BleMidiTransport implements IMixerTransport {
  private link: BleLink | null = null
  private open: () => Promise<BleLink>
  private listeners = new Set<(e: MixerEvent) => void>()
  private parser = new BleMidiParser()
  private clock: number[] = []
  private knobs: number[] = []
  /** Latest unsent message per control, so a fast drag only sends where the fader is now. */
  private pending = new Map<string, number[]>()
  private writing = false
  /** Per control: when we last sent it and the values sent since; a reply with another value (e.g. a refusal) still counts. */
  private sent = new Map<string, { at: number; values: Set<number> }>()

  constructor(open: () => Promise<BleLink> = openWebBluetooth) {
    this.open = open
  }

  static supported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator
  }

  async connect(): Promise<void> {
    this.link = await this.open()
    this.link.onData(this.onData)
    for (const msg of HELLO) this.queue(msg)
  }

  async disconnect(): Promise<void> {
    this.link?.close()
    this.link = null
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
    // button presses (SysEx, recorder CC 0x57) must all go out; level controls only need their latest value
    const key = msg[0] === 0xf0 || msg[1] === 0x57 ? msg.join() : `${msg[0]}:${msg[1]}`
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
    if (this.writing || !this.link) return
    this.writing = true
    try {
      let n = 0
      for (
        let next = this.pending.entries().next();
        !next.done;
        next = this.pending.entries().next()
      ) {
        const [key, msg] = next.value
        this.pending.delete(key)
        await this.link.write(blePacket(msg))
        // long bursts (loading a profile, ~500 values) go out in small batches so the L-20 keeps up
        if (++n % BATCH === 0) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS))
      }
    } finally {
      this.writing = false
    }
  }

  private onData = (bytes: Uint8Array) => {
    for (const msg of this.parser.parse(bytes)) {
      const s = this.sent.get(`${msg[0]}:${msg[1]}`)
      const echo = !!s && Date.now() - s.at < ECHO_MS && s.values.has(msg[2]!)
      const levels = decodeMeters(msg)
      if (levels) {
        this.emit({ type: 'meters', levels })
        continue
      }
      const cmds =
        msg[0] === 0xf0
          ? decodeState(msg)
          : echo
            ? []
            : [decode(msg) ?? decodeClock(msg, this.clock) ?? decodeKnob(msg, this.knobs)]
      for (const cmd of cmds) if (cmd) this.emit(cmd)
    }
  }

  private emit(e: MixerEvent) {
    for (const l of this.listeners) l(e)
  }
}
