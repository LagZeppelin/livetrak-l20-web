import {
  FX_MIXES,
  MONITOR_MIXES,
  type Channel,
  type Eq,
  type Mixer,
  type MixerCommand,
} from './mixer'

/** A named copy of the whole mixer state, kept by the app (not one of the L-20's own scene slots). */
export interface Profile {
  id: string
  name: string
  savedAt: string
  mixer: Mixer
}

const CHANNEL_KEYS = ['name', 'color', 'fader', 'mute', 'solo', 'pan', 'phase'] as const
const EQ_KEYS = ['on', 'lowCut', 'lowCutHz', 'low', 'midGain', 'midFreq', 'high'] as const

/** Keys of `keys` whose value differs between a and b, as a patch with b's values. */
function diff<T extends object, K extends keyof T>(a: T, b: T, keys: readonly K[]) {
  const patch: Partial<Pick<T, K>> = {}
  for (const k of keys) if (a[k] !== b[k]) patch[k] = b[k]
  return Object.keys(patch).length ? patch : null
}

/**
 * The commands that turn `current` into `target`, only for what differs.
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

  target.channels.forEach((t: Channel, i) => {
    const c = current.channels[i]
    if (!c) return
    const patch = diff(c, t, CHANNEL_KEYS)
    if (patch) out.push({ type: 'channel', ch: t.id, patch })
    const eq = diff<Eq, (typeof EQ_KEYS)[number]>(c.eq, t.eq, EQ_KEYS)
    if (eq) out.push({ type: 'eq', ch: t.id, patch: eq })
    for (const mix of [...MONITOR_MIXES, ...FX_MIXES])
      if (c.sends[mix].level !== t.sends[mix].level)
        out.push({ type: 'send', ch: t.id, mix, patch: { level: t.sends[mix].level } })
  })

  const main = diff(current.main, target.main, ['fader', 'mute'])
  if (main) out.push({ type: 'bus', mix: 'main', patch: main })
  for (const mix of MONITOR_MIXES) {
    const p = diff(current.monitors[mix], target.monitors[mix], ['fader', 'mute'])
    if (p) out.push({ type: 'bus', mix, patch: p })
  }
  for (const mix of FX_MIXES) {
    const c = current.fx[mix]
    const t = target.fx[mix]
    const p: Partial<typeof t> = diff(c, t, ['fader', 'mute', 'effect']) ?? {}
    if (c.params[0] !== t.params[0] || c.params[1] !== t.params[1]) p.params = t.params
    if (Object.keys(p).length) out.push({ type: 'bus', mix, patch: p })
  }
  target.main.geq.forEach((gain, band) => {
    if (current.main.geq[band] !== gain) out.push({ type: 'geq', band, gain })
  })
  return out
}
