import { useEffect, useRef, useState } from 'react'
import { deviceLabel } from '@/lib/devices'
import { MONITOR_MIXES, type MonitorMixId } from '@/lib/mixer'
import { cn, randomId } from '@/lib/utils'
import { useDevicesStore } from '@/state/devicesStore'
import { useMixerStore } from '@/state/mixerStore'
import { logTime as time, useL20Link, usePiStore } from '@/state/piStore'
import { Btn, Icon, Label } from '../components/controls'

/** Admin menu on the iPad: which phone controls which mix and who may open the full mixer (Handys), and the Pi's link to the L-20 with its live log (Verbindung). */
export function AdminDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'phones' | 'link'>('phones')
  const devices = useDevicesStore((s) => s.devices)
  const dispatch = useDevicesStore((s) => s.dispatch)
  const owner = (m: MonitorMixId) => {
    const d = devices.find((d) => d.mix === m)
    return d && deviceLabel(d)
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Admin"
        className="bg-surf flex h-[90dvh] w-[720px] flex-col rounded-xl border border-white/12 p-5 shadow-[0_24px_64px_rgb(0_0_0/0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            {(
              [
                ['phones', 'Handys'],
                ['link', 'Verbindung'],
              ] as const
            ).map(([t, label]) => (
              <Btn
                key={t}
                kind={tab === t ? 'on' : 'plain'}
                className="h-9 px-4 text-base"
                onClick={() => setTab(t)}
              >
                {label}
              </Btn>
            ))}
          </div>
          <Btn className="h-9 px-3" onClick={onClose}>
            Fertig
          </Btn>
        </div>

        {tab === 'link' ? (
          <LinkTab />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-6 gap-2">
              {MONITOR_MIXES.map((m) => (
                <div key={m} className="border-line rounded border px-2 py-1.5 text-center">
                  <div className="font-mono text-sm font-semibold">Mix {m}</div>
                  <div className={cn('truncate text-xs', owner(m) ? 'text-fg' : 'text-fg3')}>
                    {owner(m) ?? 'frei'}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
              {devices.length === 0 && (
                <p className="text-fg2 py-8 text-center">
                  Noch kein Handy angemeldet. Sobald jemand auf dem Handy einen Mix wählt, erscheint
                  es hier.
                </p>
              )}
              {devices.map((d) => (
                <div key={d.id} className="card flex items-center gap-3 px-4 py-3">
                  <Icon name="phone" className="text-fg2 size-5" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold">{deviceLabel(d)}</div>
                    {!d.mix && <div className="text-warn text-xs">ohne Mix</div>}
                  </div>
                  <select
                    aria-label={`Mix für ${deviceLabel(d)}`}
                    value={d.mix ?? ''}
                    onChange={(e) =>
                      dispatch({
                        type: 'assign',
                        id: d.id,
                        mix: (e.target.value || null) as MonitorMixId | null,
                      })
                    }
                    className="border-line bg-raised h-10 w-44 rounded border px-2 text-sm"
                  >
                    <option value="">kein Mix</option>
                    {MONITOR_MIXES.map((m) => {
                      const other = owner(m)
                      return (
                        <option key={m} value={m}>
                          Mix {m}
                          {other && d.mix !== m ? ` (hat ${other})` : ''}
                        </option>
                      )
                    })}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={d.foh}
                      onChange={(e) =>
                        dispatch({ type: 'foh', id: d.id, allowed: e.target.checked })
                      }
                      className="size-5"
                    />
                    Ganzes Pult
                  </label>
                  <Btn
                    className="h-10 px-3"
                    aria-label={`${deviceLabel(d)} entfernen`}
                    onClick={() => dispatch({ type: 'remove', id: d.id })}
                  >
                    Entfernen
                  </Btn>
                </div>
              ))}
            </div>

            <div className="border-line mt-4 flex items-center justify-between border-t pt-3">
              <Label>Zum Testen am Laptop</Label>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => window.open(`?phone&test=${randomId().slice(0, 5)}`)}
              >
                Test-Handy in neuem Tab öffnen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const DOT = { good: 'bg-good', busy: 'bg-warn', bad: 'bg-bad' } as const

/** Copies text; on the Pi (http, not https) the browser has no clipboard API, so the old way is the fallback. */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.append(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

function LinkTab() {
  const wifi = useMixerStore((s) => s.status)
  const l20 = useL20Link()
  const live = usePiStore((s) => s.log)
  const [paused, setPaused] = useState<typeof live | null>(null)
  const [copied, setCopied] = useState(false)
  const log = paused ?? live
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!paused) box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [log, paused])

  if (!l20)
    return (
      <p className="text-fg2 py-8 text-center">
        Verbindung und Log vom Raspberry Pi gibt es nur, wenn die App vom Pi geöffnet wird. Gerade
        läuft sie ohne Pi (Demo oder direkt per Bluetooth).
      </p>
    )

  const cards = [
    {
      label: 'iPad ⇄ Pi',
      how: 'WLAN',
      dot: wifi === 'connected' ? 'good' : wifi === 'connecting' ? 'busy' : 'bad',
      text:
        wifi === 'connected' ? 'verbunden' : wifi === 'connecting' ? 'verbinde neu …' : 'getrennt',
    },
    { label: 'Pi ⇄ L-20', how: 'Bluetooth', ...l20 },
  ] as const
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="card flex items-center gap-3 px-4 py-3">
            <span className={cn('size-3 shrink-0 rounded-full', DOT[c.dot])} />
            <div className="min-w-0">
              <div className="text-base font-semibold">{c.label}</div>
              <div className={cn('text-sm', c.dot === 'bad' ? 'text-bad' : 'text-fg2')}>
                {c.how}: {c.text}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Label>Live-Log vom Pi</Label>
        <div className="flex gap-2">
          <Btn
            kind={paused ? 'on' : 'plain'}
            className="h-9 px-3"
            onClick={() => setPaused(paused ? null : live)}
          >
            {paused ? 'Weiter' : 'Anhalten'}
          </Btn>
          <Btn
            className="h-9 w-24 px-3"
            onClick={() =>
              void copy(
                log.map((l) => `${time(l.t)} ${l.error ? 'FEHLER ' : ''}${l.text}`).join('\n'),
              ).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
            }
          >
            {copied ? 'Kopiert' : 'Kopieren'}
          </Btn>
        </div>
      </div>
      <div
        ref={box}
        className="border-line bg-canvas min-h-0 flex-1 overflow-y-auto rounded border p-3 font-mono text-xs leading-relaxed select-text"
      >
        {log.length === 0 && <div className="text-fg3">Noch nichts im Log.</div>}
        {log.map((l, i) => (
          <div key={i} className={l.error ? 'text-bad' : 'text-fg2'}>
            <span className="text-fg3">{time(l.t)}</span> {l.text}
          </div>
        ))}
      </div>
    </div>
  )
}

/** "Lisa hat sich mit Mix C verbunden": shown on the iPad when a phone gets a mix while the admin menu is closed. */
export function ConnectSnackbar({ paused }: { paused: boolean }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    if (paused) return
    return useDevicesStore.subscribe((s, prev) => {
      const d = s.devices.find(
        (d) => d.mix && prev.devices.find((p) => p.id === d.id)?.mix !== d.mix,
      )
      if (d) setText(`${d.name || 'Ein Handy'} hat sich mit Mix ${d.mix} verbunden`)
    })
  }, [paused])
  useEffect(() => {
    if (!text) return
    const t = setTimeout(() => setText(null), 4000)
    return () => clearTimeout(t)
  }, [text])
  if (!text) return null
  return (
    <div
      role="status"
      className="bg-surf fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-white/12 px-4 py-3 shadow-[0_24px_64px_rgb(0_0_0/0.7)]"
    >
      <Icon name="phone" className="text-good size-5" />
      <span className="text-base">{text}</span>
    </div>
  )
}
