import { FX_MIXES, MONITOR_MIXES, type Mixer, type MixerCommand } from './mixer'

/** A named copy of the whole mixer state, kept by the app (not one of the L-20's own scene slots). */
export interface Profile {
  id: string
  name: string
  savedAt: string
  mixer: Mixer
}

const CHANNEL_KEYS = ['name', 'color', 'fader', 'mute', 'solo', 'pan', 'phase'] as const
const EQ_KEYS = ['on', 'lowCut', 'lowCutHz', 'low', 'midGain', 'midFreq', 'high'] as const

const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, o[k]])) as Pick<T, K>

/**
 * The commands that turn `current` into `target`. Every setting is sent, not only what differs,
 * so values the app may not have read back from the mixer (e.g. EQ) are still set (Ron, Nov 8).
 * Stereo links are app-side, so only those are diffed.
 * Recorder, REC/PLAY select and scene slot are left alone: they are live actions, not settings.
 */
export function profileCommands(current: Mixer, target: Mixer): MixerCommand[] {
  const out: MixerCommand[] = []
  const links = (m: Mixer) => m.channels.map((c) => c.linkedWith)
  const now = links(current)
  const want = links(target)
  // dissolve wrong links first, so the wanted pairs are free to link
  for (const c of current.channels)
    if (c.linkedWith && c.linkedWith > c.id && want[c.id - 1] !== c.linkedWith)
      out.push({ type: 'link', ch: c.id, linked: false })
  for (const c of target.channels)
    if (c.linkedWith && c.linkedWith > c.id && now[c.id - 1] !== c.linkedWith)
      out.push({ type: 'link', ch: c.id, linked: true })

  for (const t of target.channels) {
    out.push({ type: 'channel', ch: t.id, patch: pick(t, CHANNEL_KEYS) })
    out.push({ type: 'eq', ch: t.id, patch: pick(t.eq, EQ_KEYS) })
    for (const mix of [...MONITOR_MIXES, ...FX_MIXES])
      out.push({ type: 'send', ch: t.id, mix, patch: { level: t.sends[mix].level } })
  }
  out.push({ type: 'bus', mix: 'main', patch: pick(target.main, ['fader', 'mute']) })
  for (const mix of MONITOR_MIXES)
    out.push({
      type: 'bus',
      mix,
      patch: pick(target.monitors[mix], ['fader', 'mute', 'fx1', 'fx2']),
    })
  for (const mix of FX_MIXES)
    out.push({
      type: 'bus',
      mix,
      patch: pick(target.fx[mix], ['fader', 'mute', 'effect', 'params']),
    })
  target.main.geq.forEach((gain, band) => out.push({ type: 'geq', band, gain }))
  return out
}
