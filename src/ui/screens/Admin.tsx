import { useEffect, useState } from 'react'
import { deviceLabel } from '@/lib/devices'
import { MONITOR_MIXES, type MonitorMixId } from '@/lib/mixer'
import { cn, randomId } from '@/lib/utils'
import { useDevicesStore } from '@/state/devicesStore'
import { Btn, Icon, Label } from '../components/controls'

/** Admin menu on the iPad: which phone controls which mix, and who may open the full mixer. */
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

const MOCK_LOG = [
  ['22:41:02', 'info', 'L-20 Hub läuft: http://localhost:80'],
  ['22:41:02', 'info', 'Bluetooth: suche L-20 …'],
  [
    '22:41:32',
    'error',
    'Kein L-20 gefunden. Ist der BTA-1 eingesteckt und der L-20 an? Neuer Versuch in 5 s.',
  ],
  ['22:41:37', 'info', 'Bluetooth: suche L-20 …'],
  ['22:41:41', 'info', 'Bluetooth: L-20_7C:2A gefunden, verbinde …'],
  ['22:41:42', 'info', 'Bluetooth: MIDI-Dienst geöffnet'],
  ['22:41:42', 'info', 'Mit dem L-20 verbunden.'],
  ['22:41:44', 'info', 'Zustand vom L-20 empfangen (20 Kanäle)'],
  ['22:43:10', 'info', 'iPad verbunden'],
  ['22:44:05', 'info', 'Handy „Lisa“ verbunden (Mix C)'],
] as const

function LinkTab() {
  const steps = [
    { label: 'iPad ⇄ Pi', how: 'WLAN', state: 'ok', text: 'verbunden' },
    { label: 'Pi ⇄ L-20', how: 'Bluetooth', state: 'ok', text: 'verbunden seit 22:41' },
  ] as const
  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {steps.map((s) => (
          <div key={s.label} className="card flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                'size-3 rounded-full',
                s.state === 'ok' ? 'bg-good' : s.state === 'busy' ? 'bg-warn' : 'bg-bad',
              )}
            />
            <div>
              <div className="text-base font-semibold">{s.label}</div>
              <div className="text-fg2 text-sm">
                {s.how}: {s.text}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Label>Live-Log vom Pi</Label>
        <div className="flex gap-2">
          <Btn className="h-9 px-3">Anhalten</Btn>
          <Btn className="h-9 px-3">Kopieren</Btn>
        </div>
      </div>
      <div className="border-line bg-canvas min-h-0 flex-1 overflow-y-auto rounded border p-3 font-mono text-xs leading-relaxed">
        {MOCK_LOG.map(([t, level, text], i) => (
          <div key={i} className={cn(level === 'error' ? 'text-bad' : 'text-fg2')}>
            <span className="text-fg3">{t}</span> {text}
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
