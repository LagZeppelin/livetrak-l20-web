import { create } from 'zustand'
import type { L20Link, PiLogLine } from '@/transport/types'
import { hub } from './connection'
import { useMixerStore } from './mixerStore'

export type { L20Link, PiLogLine }

const MAX_LINES = 500

interface PiState {
  /** null = the app does not come from the Pi (demo or direct Bluetooth), so there is no Pi to watch. */
  link: L20Link | null
  log: PiLogLine[]
}

/** What the admin panel shows about the Pi: its Bluetooth link to the L-20 and its live server log. */
export const usePiStore = create<PiState>()(() => ({ link: null, log: [] }))

hub?.onPi(({ link, log }) =>
  usePiStore.setState((s) => ({
    link: link ?? s.link,
    // link + log = the whole log after (re)connecting, so it replaces ours; a log alone is new lines
    log: !log ? s.log : link ? log : [...s.log, ...log].slice(-MAX_LINES),
  })),
)

export const logTime = (t: number) => new Date(t).toLocaleTimeString('de-DE')

/** Pi ⇄ L-20 in words and as a dot colour; null when the app does not come from the Pi. */
export function useL20Link() {
  const link = usePiStore((s) => s.link)
  const wifi = useMixerStore((s) => s.status)
  if (!link) return null
  if (wifi !== 'connected') return { dot: 'bad', text: 'unbekannt, Pi nicht erreichbar' } as const
  if (link.state === 'connected')
    return { dot: 'good', text: `verbunden seit ${logTime(link.since).slice(0, 5)}` } as const
  if (link.state === 'searching') return { dot: 'busy', text: 'sucht L-20 …' } as const
  if (link.state === 'demo') return { dot: 'busy', text: 'aus, Pi läuft im Demo-Modus' } as const
  return { dot: 'bad', text: link.error ?? 'Fehler' } as const
}
