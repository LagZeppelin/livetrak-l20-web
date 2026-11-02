import { MONITOR_MIXES, type MonitorMixId } from '@/lib/mixer'
import { cn } from '@/lib/utils'
import { useDevicesStore } from '@/state/devicesStore'
import { Btn, Icon, Label } from '../components/controls'

/** Admin menu on the iPad: which phone controls which mix, and who may open the full mixer. */
export function AdminDialog({ onClose }: { onClose: () => void }) {
  const devices = useDevicesStore((s) => s.devices)
  const dispatch = useDevicesStore((s) => s.dispatch)
  const owner = (m: MonitorMixId) => devices.find((d) => d.mix === m)?.name

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Handys verwalten"
        className="bg-surf flex max-h-[90dvh] w-[640px] flex-col rounded-xl border border-white/12 p-5 shadow-[0_24px_64px_rgb(0_0_0/0.7)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Handys verwalten</h2>
          <Btn className="h-9 px-3" onClick={onClose}>
            Fertig
          </Btn>
        </div>

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
              Noch kein Handy angemeldet. Auf dem Handy die App mit <b>?phone</b> öffnen und Namen
              eingeben.
            </p>
          )}
          {devices.map((d) => (
            <div key={d.id} className="card flex items-center gap-3 px-4 py-3">
              <Icon name="phone" className="text-fg2 size-5" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold">{d.name}</div>
                {!d.mix && <div className="text-warn text-xs">wartet auf einen Mix</div>}
              </div>
              <select
                aria-label={`Mix für ${d.name}`}
                value={d.mix ?? ''}
                onChange={(e) =>
                  dispatch({
                    type: 'assign',
                    id: d.id,
                    mix: (e.target.value || null) as MonitorMixId | null,
                  })
                }
                className="border-line bg-raised h-10 rounded border px-2 text-sm"
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
                  onChange={(e) => dispatch({ type: 'foh', id: d.id, allowed: e.target.checked })}
                  className="size-5"
                />
                Ganzes Pult
              </label>
              <Btn
                className="h-10 px-3"
                aria-label={`${d.name} entfernen`}
                onClick={() => dispatch({ type: 'remove', id: d.id })}
              >
                Entfernen
              </Btn>
            </div>
          ))}
        </div>

        <div className="border-line mt-4 flex items-center justify-between border-t pt-3">
          <Label>Zum Testen am Laptop</Label>
          <a href="?phone" target="_blank" rel="noreferrer" className="text-sm underline">
            Test-Handy in neuem Tab öffnen
          </a>
        </div>
      </div>
    </div>
  )
}
