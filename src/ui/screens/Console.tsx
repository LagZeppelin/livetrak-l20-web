import { EFFECTS, type Channel, type FxMixId, type MonitorMixId } from '@/lib/mixer'
import { dbToPos, formatDb, formatPan } from '@/lib/scale'
import { cn } from '@/lib/utils'
import { useMixerStore } from '@/state/mixerStore'
import { Btn, Fader, Slider, Icon, Label, ValueBox } from '../components/controls'
import { MiniEq, MiniGeq } from '../components/EqGraph'
import { channelNo, isFixedStereo, linkCommand, mixLevel, sendLevel, type View } from '../mixView'

export const STRIP_W = 111 // strip width + gap, also used to scroll from the overview

/** Main mix or a monitor mix (A–F): the same strips, the fader drives the fader or the send. */
export function Console({
  mix,
  onOpen,
  onVisible,
}: {
  mix: View
  onOpen: (ch: number) => void
  onVisible: (range: [number, number]) => void
}) {
  const channels = useMixerStore((s) => s.mixer.channels)
  return (
    <div className="flex h-full gap-2">
      <div
        id="strips"
        className="flex min-w-0 flex-1 [scrollbar-width:none] gap-[7px] overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget
          const first = Math.round(el.scrollLeft / STRIP_W) + 1
          onVisible([first, first + Math.floor(el.clientWidth / STRIP_W) - 1])
        }}
      >
        {channels.map((c) =>
          // a stereo pair shares one card, split by a divider (same width as two strips + gap)
          c.linkedWith && c.linkedWith < c.id ? null : c.linkedWith && !isFixedStereo(c.id) ? (
            <div key={c.id} className="card flex w-[215px] shrink-0 justify-between">
              <Strip c={c} mix={mix} onOpen={onOpen} bare />
              <div className="bg-line my-2.5 w-px shrink-0" />
              <Strip c={channels[c.linkedWith - 1]} mix={mix} onOpen={onOpen} bare />
            </div>
          ) : (
            <Strip key={c.id} c={c} mix={mix} onOpen={onOpen} />
          ),
        )}
      </div>
    </div>
  )
}

function Strip({
  c,
  mix,
  onOpen,
  bare,
}: {
  c: Channel
  mix: View
  onOpen: (ch: number) => void
  /** inside a stereo pair card: no own card frame */
  bare?: boolean
}) {
  const dispatch = useMixerStore((s) => s.dispatch)
  const mixer = useMixerStore((s) => s.mixer)
  const fixed = isFixedStereo(c.id)
  const meterOf = (s: ReturnType<typeof useMixerStore.getState>, ch: number) =>
    mix === 'main' ? s.meters[ch - 1] : sendLevel(s.mixer, s.meters, ch, mix)
  const meter = useMixerStore((s) => meterOf(s, c.id))
  const meterR = useMixerStore((s) => (fixed ? meterOf(s, c.id + 1) : undefined))
  const send = mix === 'main' ? null : c.sends[mix]
  const level = send ? send.level : c.fader
  const link = linkCommand(mixer, c.id)
  const setLevel = (db: number) =>
    mix !== 'main'
      ? dispatch({ type: 'send', ch: c.id, mix, patch: { level: db } })
      : dispatch({ type: 'channel', ch: c.id, patch: { fader: db } })

  return (
    <section
      id={`strip-${c.id}`}
      aria-label={`Kanal ${c.id} ${c.name}`}
      className={cn('flex w-[104px] shrink-0 flex-col px-2.5 pt-2.5 pb-2', !bare && 'card')}
    >
      <div className="h-1 rounded-full" style={{ background: c.color }} />
      <button
        type="button"
        className="mt-2 flex items-baseline gap-1 truncate text-left text-sm font-semibold"
        onClick={() => onOpen(c.id)}
      >
        <span className="text-fg3 font-mono text-base font-normal">
          {fixed ? `${c.id}·${c.id + 1}` : channelNo(c.id)}
        </span>
        <span className="truncate">{c.name}</span>
      </button>
      <button type="button" aria-label="EQ öffnen" className="mt-1.5" onClick={() => onOpen(c.id)}>
        <MiniEq eq={c.eq} />
      </button>
      {!send && (
        <div className="border-line mt-2 space-y-1 border-t pt-2">
          {(['fx1', 'fx2'] as FxMixId[]).map((fx) => (
            <div key={fx} className="flex items-center gap-1.5">
              <span className="text-fg3 font-mono text-[9px]">{fx.toUpperCase()}</span>
              <div className="bg-track h-1 flex-1 rounded-full">
                <div
                  className="bg-fg2 h-full rounded-full"
                  style={{ width: `${(1 - dbToPos(c.sends[fx].level)) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="border-line mt-2 grid grid-cols-2 gap-1.5 border-t pt-2">
        <Btn
          kind={c.mute ? 'mute' : 'plain'}
          className="h-8"
          aria-pressed={c.mute}
          onClick={() => dispatch({ type: 'channel', ch: c.id, patch: { mute: !c.mute } })}
        >
          M
        </Btn>
        <Btn
          kind={c.solo ? 'solo' : 'plain'}
          className="h-8"
          aria-pressed={c.solo}
          onClick={() => dispatch({ type: 'channel', ch: c.id, patch: { solo: !c.solo } })}
        >
          S
        </Btn>
      </div>
      <Btn
        kind={c.recSelect ? 'rec' : 'plain'}
        className="mt-2 h-8"
        aria-pressed={c.recSelect}
        onClick={() => dispatch({ type: 'channel', ch: c.id, patch: { recSelect: !c.recSelect } })}
      >
        Select
      </Btn>
      {send ? (
        <div className="mt-2 flex gap-1.5">
          <Btn
            kind={send.pre ? 'pre' : 'plain'}
            className="h-7 w-10 shrink-0 text-xs"
            onClick={() =>
              mix !== 'main' && dispatch({ type: 'send', ch: c.id, mix, patch: { pre: !send.pre } })
            }
          >
            {send.pre ? 'Pre' : 'Post'}
          </Btn>
          <ValueBox className="flex-1 py-1">{formatDb(level)}</ValueBox>
        </div>
      ) : (
        <ValueBox className="mx-auto mt-2 w-[70px]">{formatDb(level)}</ValueBox>
      )}
      <Fader
        db={level}
        onChange={setLevel}
        levels={fixed ? [meter, meterR] : [meter]}
        label={`Fader ${c.name}`}
      />
      {!fixed && (
        <>
          <div className="border-line mt-2 border-t pt-2">
            <div className="text-fg3 flex justify-between font-mono text-[10px]">
              <span>PAN</span>
              <span className="text-fg">{formatPan(c.pan)}</span>
            </div>
            {send ? (
              <div className="text-fg3 mt-1 text-[10px]">nur im Main-Mix</div>
            ) : (
              <Slider
                pos={(c.pan + 100) / 200}
                onPos={(p) =>
                  dispatch({ type: 'channel', ch: c.id, patch: { pan: Math.round(p * 200 - 100) } })
                }
                origin={0.5}
                label={`Pan ${c.name}`}
                valueText={formatPan(c.pan)}
              />
            )}
          </div>
          <div className="border-line mt-2 border-t pt-2">
            <Btn
              kind={c.linkedWith ? 'on' : 'plain'}
              className="mx-auto h-7 w-9"
              aria-label={c.linkedWith ? `Stereo-Link mit ${c.linkedWith} lösen` : 'Stereo-Link'}
              aria-pressed={!!c.linkedWith}
              disabled={!link}
              onClick={() => link && dispatch(link)}
            >
              <Icon name="link" className="size-4" />
            </Btn>
          </div>
        </>
      )}
    </section>
  )
}

/** FX1/FX2 returns stacked; used on the main screen and in the channel detail. */
export function FxReturns() {
  return (
    <div className="divide-line flex w-24 shrink-0 flex-col divide-y px-3">
      <FxStrip id="fx1" />
      <FxStrip id="fx2" />
    </div>
  )
}

function FxStrip({ id }: { id: FxMixId }) {
  const bus = useMixerStore((s) => s.mixer.fx[id])
  const meter = id === 'fx1' ? 22 : 24
  const left = useMixerStore((s) => s.meters[meter])
  const right = useMixerStore((s) => s.meters[meter + 1])
  const dispatch = useMixerStore((s) => s.dispatch)
  return (
    <section
      id={`strip-${id === 'fx1' ? 21 : 22}`}
      className="flex min-h-0 flex-1 flex-col py-2 first:pb-4 last:pt-4"
    >
      <div className="text-sm font-semibold">{id === 'fx1' ? 'FX 1' : 'FX 2'}</div>
      <label className="text-fg2 relative mt-0.5 flex items-center text-xs">
        <span className="truncate">{EFFECTS[id][bus.effect].name}</span>
        <Icon name="caret" className="ml-auto size-3.5 shrink-0" />
        <select
          aria-label={`Effekt ${id === 'fx1' ? 'FX 1' : 'FX 2'}`}
          className="absolute inset-0 opacity-0"
          value={bus.effect}
          onChange={(e) =>
            dispatch({ type: 'bus', mix: id, patch: { effect: Number(e.target.value) } })
          }
        >
          {EFFECTS[id].map((e, i) => (
            <option key={i} value={i}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <ValueBox className="mt-2">{formatDb(bus.fader)}</ValueBox>
      <Fader
        db={bus.fader}
        label={`Fader ${id}`}
        onChange={(db) => dispatch({ type: 'bus', mix: id, patch: { fader: db } })}
        levels={[left, right]}
        handle="sm"
      />
    </section>
  )
}

export function MasterStrip({ onOpenEq }: { onOpenEq: () => void }) {
  const main = useMixerStore((s) => s.mixer.main)
  const anySolo = useMixerStore((s) => s.mixer.channels.some((c) => c.solo))
  const left = useMixerStore((s) => s.meters[20])
  const right = useMixerStore((s) => s.meters[21])
  const channels = useMixerStore((s) => s.mixer.channels)
  const dispatch = useMixerStore((s) => s.dispatch)
  return (
    <section aria-label="Master" className="flex w-32 shrink-0 flex-col px-3 py-2">
      <button type="button" aria-label="Master-EQ öffnen" onClick={onOpenEq}>
        <MiniGeq geq={main.geq} />
      </button>
      <div className="mt-auto grid grid-cols-2 gap-1.5">
        <Btn
          kind={main.mute ? 'mute' : 'plain'}
          className="h-8"
          aria-pressed={main.mute}
          onClick={() => dispatch({ type: 'bus', mix: 'main', patch: { mute: !main.mute } })}
        >
          M
        </Btn>
        <Btn
          kind={anySolo ? 'solo' : 'plain'}
          className="h-8"
          aria-label="Alle Solos aus"
          disabled={!anySolo}
          onClick={() =>
            channels
              .filter((c) => c.solo)
              .forEach((c) => dispatch({ type: 'channel', ch: c.id, patch: { solo: false } }))
          }
        >
          S
        </Btn>
      </div>
      <ValueBox className="mx-auto mt-2 mb-2 w-[70px]">{formatDb(main.fader)}</ValueBox>
      <div className="flex h-[62%] min-h-0">
        <Fader
          db={main.fader}
          onChange={(db) => dispatch({ type: 'bus', mix: 'main', patch: { fader: db } })}
          levels={[left, right]}
          label="Master-Fader"
        />
      </div>
    </section>
  )
}

export function MonitorPanel({ mix }: { mix: MonitorMixId }) {
  const bus = useMixerStore((s) => s.mixer.monitors[mix])
  const level = useMixerStore((s) => mixLevel(s.mixer, s.meters, mix))
  const dispatch = useMixerStore((s) => s.dispatch)
  return (
    <section aria-label={`Mix ${mix}`} className="flex w-[216px] shrink-0 flex-col px-3 py-2">
      <a
        href={`?phone=${mix}`}
        target="_blank"
        rel="noreferrer"
        className="border-line flex h-9 items-center justify-center gap-2 rounded border bg-[rgb(22_25_32/0.55)] text-sm font-medium"
      >
        <Icon name="phone" /> Handy-Ansicht
      </a>
      <div className="border-line mt-4 flex items-center gap-3 border-t pt-4">
        <Btn
          kind={bus.mute ? 'mute' : 'plain'}
          className="h-9 w-12"
          aria-pressed={bus.mute}
          onClick={() => dispatch({ type: 'bus', mix, patch: { mute: !bus.mute } })}
        >
          M
        </Btn>
        <span className="text-fg2 text-sm">Mix stumm</span>
      </div>
      <div className="border-line mt-4 flex items-center justify-between border-t pt-4">
        <Label>Ausgang {mix}</Label>
        <ValueBox className="w-[68px]">{formatDb(bus.fader)}</ValueBox>
      </div>
      <div className="flex min-h-0 flex-1 px-4 pt-3">
        <Fader
          db={bus.fader}
          onChange={(db) => dispatch({ type: 'bus', mix, patch: { fader: db } })}
          levels={[level]}
          label={`Ausgang Mix ${mix}`}
        />
      </div>
      <p className={cn('border-line text-fg2 mt-3 border-t pt-3 text-xs')}>
        Fader und Meter zeigen nur, was in Mix {mix} ankommt.
      </p>
    </section>
  )
}
