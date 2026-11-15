import { applyDeviceCommand, type Device, type DeviceCommand } from '@/lib/devices'
import {
  applyCommand,
  createMixer,
  MONITOR_MIXES,
  partnerCommand,
  type Mixer,
  type MixerCommand,
} from '@/lib/mixer'
import type { ClientMessage, HubMessage, IMixerTransport } from '@/transport/types'

/** One open browser (iPad or phone) as the hub sees it. */
export interface Client {
  send(msg: HubMessage): void
  /** Set by the browser's hello. */
  id?: string
  phone?: boolean
}

const MIXER_TYPES = new Set<MixerCommand['type']>([
  'channel',
  'eq',
  'send',
  'link',
  'bus',
  'fxParam',
  'geq',
  'scene',
  'transport',
  'recorder',
])
const DEVICE_TYPES = new Set<DeviceCommand['type']>(['join', 'claim', 'assign', 'foh', 'remove'])

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const scalar = (v: unknown) => ['number', 'boolean', 'string'].includes(typeof v) || v === null
/** Patches may only hold plain values (or a list of numbers for effect knobs), so a bad client can't nest junk into the state. */
const flat = (v: unknown) =>
  v === undefined ||
  (isObj(v) &&
    Object.values(v).every(
      (x) => scalar(x) || (Array.isArray(x) && x.every((n) => typeof n === 'number')),
    ))

/** Parses what a browser sent; anything malformed is null and ignored. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let m: unknown
  try {
    m = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObj(m)) return null
  if (m.type === 'hello')
    return typeof m.id === 'string' && m.id.length <= 100 && typeof m.phone === 'boolean'
      ? (m as ClientMessage)
      : null
  const cmd = m.cmd
  if (!isObj(cmd) || !Object.values(cmd).every((v) => scalar(v) || flat(v))) return null
  if (m.type === 'mixer' && MIXER_TYPES.has(cmd.type as MixerCommand['type']))
    return m as ClientMessage
  if (m.type === 'device' && DEVICE_TYPES.has(cmd.type as DeviceCommand['type']))
    return m as ClientMessage
  return null
}

/** A phone without the FOH right may only move its own mix: its sends and its mix output (fader, mute, FX returns). */
export function mayChangeMixer(client: Client, devices: Device[], cmd: MixerCommand): boolean {
  if (!client.phone) return true
  const me = devices.find((d) => d.id === client.id)
  if (me?.foh) return true
  return !!me?.mix && (cmd.type === 'send' || cmd.type === 'bus') && cmd.mix === me.mix
}

/** Phones may only join, rename and pick a free mix for themselves; everything else is the admin's. */
export function mayChangeDevices(client: Client, cmd: DeviceCommand): boolean {
  if (!client.phone) return true
  return (
    (cmd.type === 'join' || cmd.type === 'claim') &&
    cmd.id === client.id &&
    (cmd.type === 'join' || MONITOR_MIXES.includes(cmd.mix))
  )
}

/**
 * The Pi's single source of truth: keeps the mixer state and the phone list, relays each browser's changes
 * to the L-20 and to every other browser, and every change on the L-20 itself to all browsers.
 */
export class Hub {
  mixer: Mixer = createMixer()
  devices: Device[]
  private clients = new Set<Client>()
  private l20: IMixerTransport
  /** Called after the phone list changed, e.g. to save it. */
  private onDevices: (devices: Device[]) => void

  constructor(
    l20: IMixerTransport,
    devices: Device[] = [],
    onDevices: (devices: Device[]) => void = () => {},
  ) {
    this.l20 = l20
    this.devices = devices
    this.onDevices = onDevices
    l20.onEvent((e) => {
      if (e.type === 'meters') return this.broadcast(e)
      if (e.type === 'snapshot') {
        this.mixer = e.mixer
        return this.broadcast(e)
      }
      // a move on the L-20 itself knows nothing of our stereo links, so the partner is sent along here
      const partner = partnerCommand(this.mixer, e)
      for (const cmd of partner ? [e, partner] : [e]) {
        this.mixer = applyCommand(this.mixer, cmd)
        this.broadcast(cmd)
      }
      if (partner) l20.send(partner)
    })
  }

  join(client: Client) {
    this.clients.add(client)
    client.send({ type: 'snapshot', mixer: this.mixer })
    client.send({ type: 'devices', devices: this.devices })
  }

  leave(client: Client) {
    this.clients.delete(client)
  }

  receive(client: Client, raw: string) {
    const msg = parseClientMessage(raw)
    if (!msg) return
    try {
      if (msg.type === 'hello') {
        client.id = msg.id
        client.phone = msg.phone
      } else if (msg.type === 'mixer') {
        if (!mayChangeMixer(client, this.devices, msg.cmd)) return
        this.mixer = applyCommand(this.mixer, msg.cmd)
        this.l20.send(msg.cmd)
        // the sender already shows it (and already sent the stereo partner); echoing it back would jitter a drag
        this.broadcast(msg.cmd, client)
      } else {
        if (!mayChangeDevices(client, msg.cmd)) return
        this.devices = applyDeviceCommand(this.devices, msg.cmd)
        this.onDevices(this.devices)
        this.broadcast({ type: 'devices', devices: this.devices })
      }
    } catch (e) {
      console.warn('Ignored a message the mixer state could not take:', raw, e)
    }
  }

  private broadcast(msg: HubMessage, except?: Client) {
    for (const c of this.clients) if (c !== except) c.send(msg)
  }
}
