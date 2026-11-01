import { useRef, type ReactNode } from 'react'
import { MONITOR_MIXES, type RecorderState } from '@/lib/mixer'
import { formatTime } from '@/lib/scale'
import { cn } from '@/lib/utils'
import { useMixerStore } from '@/state/mixerStore'
import { Btn, Icon, Label, Meter, StatusPill } from '../components/controls'
import type { View } from '../mixView'

export function Shell({
  mix,
  onMix,
  overview,
  aside,
  children,
}: {
  mix: View
  onMix: (mix: View) => void
  overview: ReactNode
  /** fixed right rail (master + FX or the monitor mix output), full height like the navigation */
  aside: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <nav className="border-line bg-sidebar/85 flex w-20 shrink-0 flex-col items-center border-r px-3 py-4">
        <div className="mt-1.5 text-base font-semibold tracking-wide">L-20</div>
        <Label className="mt-6 mb-2">Mix</Label>
        <div className="flex w-full flex-col gap-2">
          {(['main', ...MONITOR_MIXES] as View[]).map((m) => (
            <Btn
              key={m}
              kind={m === mix ? 'on' : 'plain'}
              className={cn('h-12 text-[15px]', m === mix && 'font-semibold')}
              onClick={() => onMix(m)}
            >
              {m === 'main' ? 'Main' : m}
            </Btn>
          ))}
        </div>
        <Label className="mt-auto mb-2">Phones</Label>
        <a
          href={`?phone=${mix === 'main' ? 'A' : mix}`}
          target="_blank"
          rel="noreferrer"
          aria-label="Handy-Ansicht öffnen"
          className="border-line flex h-12 w-full items-center justify-center rounded border bg-[rgb(22_25_32/0.55)]"
        >
          <Icon name="phone" className="size-[22px]" />
        </a>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 p-4 pb-3">{children}</main>
        {overview}
      </div>
      <aside className="border-line bg-sidebar/85 divide-line flex shrink-0 divide-x border-l py-3">
        {aside}
      </aside>
    </div>
  )
}

const REC_LABEL: Record<RecorderState, string> = {
  stopped: 'STOP',
  playing: 'PLAY',
  recording: 'REC',
  paused: 'PAUSE',
}

function TopBar() {
  const scene = useMixerStore((s) => s.mixer.scene)
  const sceneNames = useMixerStore((s) => s.mixer.sceneNames)
  const recorder = useMixerStore((s) => s.mixer.recorder)
  const status = useMixerStore((s) => s.status)
  const dispatch = useMixerStore((s) => s.dispatch)
  const connect = useMixerStore((s) => s.connect)
  const rec = recorder.state === 'recording'
  const setRec = (state: RecorderState) => dispatch({ type: 'recorder', patch: { state } })

  return (
    <header className="border-line flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <label className="border-line relative flex h-9 w-46 items-center rounded border bg-[rgb(22_25_32/0.55)] px-3.5 text-sm font-medium">
        <span className="truncate">
          {scene ? `Szene ${scene}` : 'Szene –'}
          {scene && (
            <span className="text-fg2 ml-1.5 font-normal">
              {sceneNames[scene - 1].replace(/^Szene \d+$/, '')}
            </span>
          )}
        </span>
        <Icon name="caret" className="text-fg2 ml-auto size-4" />
        <select
          aria-label="Szene laden"
          className="absolute inset-0 opacity-0"
          value={scene ?? ''}
          onChange={(e) =>
            dispatch({ type: 'scene', action: 'recall', slot: Number(e.target.value) })
          }
        >
          <option value="" disabled>
            Szene laden…
          </option>
          {sceneNames.map((n, i) => (
            <option key={i} value={i + 1}>
              {i + 1} · {n}
            </option>
          ))}
        </select>
      </label>
      <Btn
        className="h-9 px-3"
        disabled={!scene}
        onClick={() => scene && dispatch({ type: 'scene', action: 'save', slot: scene })}
      >
        Speichern
      </Btn>

      <details className="relative mx-auto">
        <summary
          className={cn(
            'flex h-9 w-50 cursor-pointer list-none items-center gap-2 rounded-full border px-3.5',
            rec ? 'border-bad/40 bg-bad/12' : 'border-line bg-[rgb(22_25_32/0.55)]',
          )}
        >
          <span className={cn('size-3.5 rounded-full', rec ? 'bg-bad' : 'bg-fg3')} />
          <span
            className={cn('font-mono text-xs tracking-[0.08em]', rec ? 'text-bad' : 'text-fg2')}
          >
            {REC_LABEL[recorder.state]}
          </span>
          <span className="ml-auto font-mono text-[15px] font-medium">
            {formatTime(recorder.position)}
          </span>
          <Icon name="caret" className="text-fg2 size-4" />
        </summary>
        <div className="card bg-surf absolute top-11 left-1/2 z-20 grid w-56 -translate-x-1/2 grid-cols-2 gap-2 p-2">
          <Btn kind={rec ? 'rec' : 'plain'} className="h-11" onClick={() => setRec('recording')}>
            ● Aufnahme
          </Btn>
          <Btn
            kind={recorder.state === 'playing' ? 'on' : 'plain'}
            className="h-11"
            onClick={() => setRec('playing')}
          >
            ▶ Play
          </Btn>
          <Btn className="h-11" onClick={() => setRec('paused')}>
            ❚❚ Pause
          </Btn>
          <Btn className="h-11" onClick={() => setRec('stopped')}>
            ■ Stop
          </Btn>
        </div>
      </details>

      <button type="button" onClick={() => void connect()} disabled={status !== 'disconnected'}>
        <StatusPill connected={status === 'connected'}>
          {status === 'connected'
            ? 'L-20 VERBUNDEN'
            : status === 'connecting'
              ? 'VERBINDE…'
              : 'GETRENNT · NEU VERBINDEN'}
        </StatusPill>
      </button>
    </header>
  )
}

/**
 * Channel overview at the bottom: tap opens a channel, hold and drag scrolls the strips.
 * `highlight` marks the channels currently on screen.
 */
export function Overview({
  highlight,
  onOpen,
  onScroll,
}: {
  highlight: [number, number]
  onOpen: (ch: number) => void
  onScroll: (dxChannels: number) => void
}) {
  const meters = useMixerStore((s) => s.meters)
  const drag = useRef<{ x: number; moved: boolean } | null>(null)
  const items = Array.from({ length: 20 }, (_, i) => i + 1)
  const STEP = 33

  return (
    <div
      className="border-line bg-sidebar/85 flex h-17 shrink-0 touch-none items-center border-t px-4"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = (e.clientX - d.x) / STEP
        if (Math.abs(e.clientX - d.x) > 6) d.moved = true
        if (d.moved && Math.abs(dx) >= 1) {
          onScroll(Math.trunc(dx))
          d.x += Math.trunc(dx) * STEP
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d || d.moved) return
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-ch]')
        if (el) onOpen(Number((el as HTMLElement).dataset.ch))
      }}
    >
      <div className="relative flex">
        <div
          className="border-fg/70 bg-fg/5 absolute -inset-y-2 rounded-lg border-[1.5px] transition-[left,width]"
          style={{
            left: (highlight[0] - 1) * STEP - 4,
            width: (highlight[1] - highlight[0]) * STEP + 40,
          }}
        />
        {items.map((ch) => {
          const on = ch >= highlight[0] && ch <= highlight[1]
          const level = meters[ch - 1]
          return (
            <div
              key={ch}
              data-ch={ch}
              className="relative flex w-[33px] flex-col items-center py-1.5"
            >
              <span className={cn('font-mono text-[11px]', on ? 'font-medium' : 'text-fg2')}>
                {ch}
              </span>
              <div className="mt-1 flex h-6">
                <Meter level={level} />
              </div>
            </div>
          )
        })}
      </div>
      <div className="ml-auto text-right text-[11px] leading-[18px] whitespace-nowrap">
        <div className="text-fg2">Tippen: Kanal öffnen</div>
        <div className="text-fg3">Halten und ziehen: scrollen</div>
      </div>
    </div>
  )
}
