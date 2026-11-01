import {
  canLink,
  FADER_MIN,
  FIXED_STEREO,
  type Channel,
  type Mixer,
  type MixerCommand,
  type MonitorMixId,
} from '@/lib/mixer'

/** One row on the phone: a single channel or a stereo pair shown as one. */
export interface ChannelGroup {
  ids: number[]
  label: string
  name: string
  color: string
  ch: Channel
}

const pad = (n: number) => String(n).padStart(2, '0')

export function channelGroups(mixer: Mixer): ChannelGroup[] {
  return mixer.channels
    .filter((c) => c.linkedWith === null || c.linkedWith > c.id)
    .map((c) => {
      const ids = c.linkedWith ? [c.id, c.linkedWith] : [c.id]
      return {
        ids,
        label: ids.map(pad).join('·'),
        // "Keys L" + "Keys R" -> "Keys"
        name: c.linkedWith ? c.name.replace(/\s+L$/i, '') : c.name,
        color: c.color,
        ch: c,
      }
    })
}

/** Link/unlink command for the link button: unlink if linked, else pair with the right or left neighbour. */
export function linkCommand(mixer: Mixer, ch: number): MixerCommand | null {
  const c = mixer.channels[ch - 1]
  if (c.linkedWith) return { type: 'link', ch, linked: false }
  if (canLink(mixer, ch)) return { type: 'link', ch, linked: true }
  if (ch > 1 && canLink(mixer, ch - 1)) return { type: 'link', ch: ch - 1, linked: true }
  return null
}

const SILENT = -99

/**
 * What a channel puts into a monitor mix, estimated from its post-fader meter.
 * shortcut: the L-20 meters only what we get from the mock; replace with real send meters if the protocol has them.
 */
export function sendLevel(mixer: Mixer, meters: number[], ch: number, mix: MonitorMixId) {
  const c = mixer.channels[ch - 1]
  const send = c.sends[mix]
  const m = meters[ch - 1]
  if (m === undefined) return undefined
  if (c.mute || send.level <= FADER_MIN) return SILENT
  // the meter is post main fader; a monitor mix taps the input, then applies its own channel fader
  return Math.min(0, m - c.fader + send.level)
}

export function mixLevel(mixer: Mixer, meters: number[], mix: MonitorMixId) {
  if (!meters.length) return undefined
  const bus = mixer.monitors[mix]
  if (bus.mute) return SILENT
  const max = Math.max(...mixer.channels.map((c) => sendLevel(mixer, meters, c.id, mix) ?? SILENT))
  return Math.min(0, max + bus.fader)
}

export function formatHz(f: number) {
  return f >= 1000 ? `${(f / 1000).toFixed(1).replace('.', ',')}k Hz` : `${Math.round(f)} Hz`
}

export const channelNo = pad

/** 17/18 and 19/20 are stereo inputs on the hardware: one strip, one fader, no pan, no link. */
export const isFixedStereo = (ch: number) => (FIXED_STEREO as readonly number[]).includes(ch)

/** What the iPad shows: the main mix or one monitor mix. */
export type View = 'main' | MonitorMixId

/** What the right-rail dropdown switches: a mix view or the master page. */
export type Screen = View | 'master'
