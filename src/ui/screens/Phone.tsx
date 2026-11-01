import { useState } from 'react'
import type { MonitorMixId } from '@/lib/mixer'
import { dbToPos, formatDb, posToDb } from '@/lib/scale'
import { cn } from '@/lib/utils'
import { useMixerStore } from '@/state/mixerStore'
import { Btn, HMeter, HSlider, Icon, Label, StatusPill, ValueBox } from '../components/controls'
import { channelGroups, mixLevel, sendLevel, type ChannelGroup } from '../mixView'

const toPos = (db: number) => 1 - dbToPos(db)
const ZERO = toPos(0)

/** A musician's phone: their own monitor mix, portrait. */
export function Phone({ mix }: { mix: MonitorMixId }) {
  const mixer = useMixerStore((s) => s.mixer)
  const status = useMixerStore((s) => s.status)
  const visible = useMixerStore((s) => s.visibleChannels)
  const toggleVisible = useMixerStore((s) => s.toggleVisible)
  const dispatch = useMixerStore((s) => s.dispatch)
  const out = useMixerStore((s) => mixLevel(s.mixer, s.meters, mix))
  const [tab, setTab] = useState<'mine' | 'all'>('mine')
  const groups = channelGroups(mixer)
  const mine = groups.filter((g) => visible.includes(g.ids[0]))
  const bus = mixer.monitors[mix]

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pt-[max(env(safe-area-inset-top),24px)]">
        <header className="flex items-center justify-between py-4">
          <h1 className="text-4xl font-bold">Mix {mix}</h1>
          <StatusPill connected={status === 'connected'}>
            {status === 'connected' ? 'VERBUNDEN' : 'GETRENNT'}
          </StatusPill>
        </header>
        <div className="border-line grid grid-cols-2 rounded-md border p-0.5 text-base">
          {(['mine', 'all'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'h-10 rounded',
                tab === t ? 'border-line bg-canvas border font-medium' : 'text-fg2',
              )}
            >
              {t === 'mine' ? `Ausgewählt · ${mine.length}` : `Alle ${mixer.channels.length}`}
            </button>
          ))}
        </div>

        {tab === 'mine' ? (
          <div className="mt-3 space-y-2 pb-4">
            {mine.length === 0 && (
              <p className="text-fg2 py-10 text-center">
                Noch keine Kanäle. Unter „Alle {mixer.channels.length}“ Haken setzen.
              </p>
            )}
            {mine.map((g) => (
              <SendRow key={g.ids[0]} g={g} mix={mix} />
            ))}
          </div>
        ) : (
          <div className="pb-4">
            <p className="text-fg2 my-3">Haken setzen: Kanal erscheint in „Ausgewählt“.</p>
            <div className="space-y-2">
              {groups.map((g) => {
                const on = visible.includes(g.ids[0])
                const level = g.ch.sends[mix].level
                return (
                  <button
                    key={g.ids[0]}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleVisible(g.ids[0])}
                    className="card flex h-14 w-full items-center gap-3 px-4 text-left"
                  >
                    <span
                      className={cn(
                        'flex size-7 items-center justify-center rounded',
                        on ? 'bg-fg text-canvas' : 'border-strong border',
                      )}
                    >
                      {on && <Icon name="check" className="size-5" />}
                    </span>
                    <span className="size-2.5 rounded-full" style={{ background: g.color }} />
                    <span className="text-fg3 font-mono text-lg">{g.label}</span>
                    <span className={cn('text-lg', on ? 'font-semibold' : 'text-fg2')}>
                      {g.name}
                    </span>
                    {g.ids.length > 1 && <Icon name="link" className="text-fg3" />}
                    <span className="text-fg2 ml-auto font-mono">{formatDb(level)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <footer className="border-line border-t px-5 pt-5 pb-[max(env(safe-area-inset-bottom),16px)]">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Mix {mix} Output</Label>
          <ValueBox className="text-base">{formatDb(bus.fader)}</ValueBox>
        </div>
        <HSlider
          big
          pos={toPos(bus.fader)}
          onPos={(p) => dispatch({ type: 'bus', mix, patch: { fader: posToDb(1 - p) } })}
          mark={ZERO}
          label={`Mix ${mix} Ausgang`}
          valueText={`${formatDb(bus.fader)} dB`}
        />
        <HMeter level={out} />
        <div className="mt-4 flex items-center gap-4">
          <Btn
            kind={bus.mute ? 'mute' : 'plain'}
            className="h-12 w-28 text-base"
            aria-pressed={bus.mute}
            onClick={() => dispatch({ type: 'bus', mix, patch: { mute: !bus.mute } })}
          >
            M
          </Btn>
          <span className="text-fg2 text-lg">Mix stumm</span>
        </div>
      </footer>
    </div>
  )
}

function SendRow({ g, mix }: { g: ChannelGroup; mix: MonitorMixId }) {
  const dispatch = useMixerStore((s) => s.dispatch)
  const level = useMixerStore((s) => sendLevel(s.mixer, s.meters, g.ids[0], mix))
  const db = g.ch.sends[mix].level
  return (
    <section aria-label={g.name} className="card relative overflow-hidden py-3 pr-4 pl-6">
      <div className="absolute inset-y-4 left-0 w-1 rounded-r" style={{ background: g.color }} />
      <div className="flex items-center gap-2">
        <span className="text-fg3 font-mono text-xl">{g.label}</span>
        <span className="text-xl font-semibold">{g.name}</span>
        {g.ids.length > 1 && (
          <span className="text-fg3 flex items-center gap-1 font-mono text-sm">
            <Icon name="link" /> Stereo
          </span>
        )}
        <ValueBox className="ml-auto text-base">{formatDb(db)}</ValueBox>
      </div>
      {/* the store mirrors the send onto the stereo partner */}
      <HSlider
        big
        pos={toPos(db)}
        onPos={(p) =>
          dispatch({ type: 'send', ch: g.ids[0], mix, patch: { level: posToDb(1 - p) } })
        }
        mark={ZERO}
        label={`${g.name} in Mix ${mix}`}
        valueText={`${formatDb(db)} dB`}
      />
      <HMeter level={level} />
    </section>
  )
}
