import { useRef, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  MONITOR_MIXES,
  type MonitorMixId,
  type RecorderState,
  type TransportButton,
} from '@/lib/mixer'
import { dbToPos, formatDb, formatTime, posToDb } from '@/lib/scale'
import { cn } from '@/lib/utils'
import { useDevicesStore } from '@/state/devicesStore'
import { useMixerStore } from '@/state/mixerStore'
import {
  Btn,
  HMeter,
  Icon,
  Label,
  Meter,
  Slider,
  StatusPill,
  ValueBox,
} from '../components/controls'
import {
  isFixedStereo,
  mixLevel,
  SLOT_COUNT,
  slotChannel,
  type Screen,
  type View,
} from '../mixView'
import { AdminDialog, ConnectSnackbar } from './Admin'
import { DefaultProfilePrompt, ProfilesDialog } from './Profiles'

export function Shell({
  onlySelected,
  onOnlySelected,
  screen,
  onScreen,
  overview,
  aside,
  children,
}: {
  /** strips filtered to channels whose Select (tape) is on */
  onlySelected: boolean
  onOnlySelected: (on: boolean) => void
  screen: Screen
  onScreen: (screen: Screen) => void
  overview: ReactNode
  /** fixed right rail (master + FX or the monitor mix output) under the screen dropdown, full height like the navigation */
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
              kind={m === screen ? 'on' : 'plain'}
              className={cn('h-12 text-[15px]', m === screen && 'font-semibold')}
              onClick={() => onScreen(m)}
            >
              {m === 'main' ? 'Main' : m}
            </Btn>
          ))}
        </div>
        <Label className="mt-auto mb-2">Handys</Label>
        <PhonesButton />
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onlySelected={onlySelected} onOnlySelected={onOnlySelected} />
        <main className="min-h-0 flex-1 px-4 pt-0 pb-3">{children}</main>
        {overview}
      </div>
      <aside className="border-line bg-sidebar/85 flex shrink-0 flex-col border-l py-3">
        <label className="border-line relative mx-3 mb-3 flex h-10 items-center rounded border bg-[rgb(22_25_32/0.55)] px-3.5 text-lg font-semibold">
          {SCREEN_LABEL(screen)}
          <Icon name="caret" className="text-fg2 ml-auto size-4" />
          <select
            aria-label="Ansicht wählen"
            className="absolute inset-0 opacity-0"
            value={screen}
            onChange={(e) => onScreen(e.target.value as Screen)}
          >
            {(['main', 'master', ...MONITOR_MIXES] as Screen[]).map((s) => (
              <option key={s} value={s}>
                {SCREEN_LABEL(s)}
              </option>
            ))}
          </select>
        </label>
        {screen === 'main' && <MixOverview onOpen={onScreen} />}
        <div className="divide-line flex min-h-0 flex-1 divide-x">{aside}</div>
      </aside>
    </div>
  )
}

/** Opens the admin menu; the badge counts phones waiting for a mix. */
function PhonesButton() {
  const [open, setOpen] = useState(false)
  const waiting = useDevicesStore((s) => s.devices.filter((d) => !d.mix).length)
  return (
    <>
      <Btn
        aria-label="Handys verwalten"
        className="relative h-12 w-full"
        onClick={() => setOpen(true)}
      >
        <Icon name="phone" className="size-[22px]" />
        {waiting > 0 && (
          <span className="bg-warn text-canvas absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full font-mono text-xs font-semibold">
            {waiting}
          </span>
        )}
      </Btn>
      {open && <AdminDialog onClose={() => setOpen(false)} />}
      <ConnectSnackbar paused={open} />
    </>
  )
}

/** Compact Mix A–F meters under the dropdown; tap opens line faders per mix, the name opens the mix. */
function MixOverview({ onOpen }: { onOpen: (mix: MonitorMixId) => void }) {
  const levels = useMixerStore(
    useShallow((s) => MONITOR_MIXES.map((m) => mixLevel(s.mixer, s.meters, m))),
  )
  const monitors = useMixerStore((s) => s.mixer.monitors)
  const dispatch = useMixerStore((s) => s.dispatch)
  return (
    <details className="relative mx-3 mb-3">
      <summary
        aria-label="Mixe A–F"
        className="border-line grid cursor-pointer list-none grid-cols-6 rounded border bg-[rgb(22_25_32/0.55)] px-1 py-1.5"
      >
        {MONITOR_MIXES.map((m, i) => (
          <div key={m} className="flex flex-col items-center gap-1">
            <span
              className={cn('font-mono text-[11px]', monitors[m].mute ? 'text-bad' : 'text-fg2')}
            >
              {m}
            </span>
            <div className="flex h-5">
              <Meter level={levels[i]} />
            </div>
          </div>
        ))}
      </summary>
      <div className="bg-surf absolute top-full right-0 z-20 mt-2 w-80 space-y-3 rounded-lg border border-white/12 p-3 shadow-[0_24px_64px_rgb(0_0_0/0.7)]">
        {MONITOR_MIXES.map((m, i) => {
          const db = monitors[m].fader
          return (
            <div key={m}>
              <div className="flex items-center justify-between">
                <button type="button" className="text-sm font-semibold" onClick={() => onOpen(m)}>
                  Mix {m} <span className="text-fg2">›</span>
                </button>
                <ValueBox className="w-[68px]">{formatDb(db)}</ValueBox>
              </div>
              <Slider
                pos={1 - dbToPos(db)}
                onPos={(p) => dispatch({ type: 'bus', mix: m, patch: { fader: posToDb(1 - p) } })}
                mark={1 - dbToPos(0)}
                reset={0}
                label={`Ausgang Mix ${m}`}
                valueText={`${formatDb(db)} dB`}
              />
              <HMeter level={levels[i]} />
            </div>
          )
        })}
      </div>
    </details>
  )
}

const SCREEN_LABEL = (s: Screen) => (s === 'main' ? 'Main' : s === 'master' ? 'Master' : `Mix ${s}`)

const REC_LABEL: Record<RecorderState, string> = {
  stopped: 'STOP',
  standby: 'BEREIT',
  playing: 'PLAY',
  recording: 'REC',
  recPaused: 'REC PAUSE',
  paused: 'PAUSE',
}

const SHOW_SCENES = false

function TopBar({
  onlySelected,
  onOnlySelected,
}: {
  onlySelected: boolean
  onOnlySelected: (on: boolean) => void
}) {
  const scene = useMixerStore((s) => s.mixer.scene)
  const sceneNames = useMixerStore((s) => s.mixer.sceneNames)
  const recorder = useMixerStore((s) => s.mixer.recorder)
  const status = useMixerStore((s) => s.status)
  const dispatch = useMixerStore((s) => s.dispatch)
  const connect = useMixerStore((s) => s.connect)
  const source = useMixerStore((s) => s.source)
  const rec = recorder.state === 'recording'
  const [profilesOpen, setProfilesOpen] = useState(false)
  const press = (button: TransportButton) => dispatch({ type: 'transport', button })

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-4">
      {/* Szenen-Auswahl auf Rons Wunsch vorerst ausgeblendet (iPad mini zu eng); SHOW_SCENES = true holt sie zurück */}
      {SHOW_SCENES && (
        <>
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
        </>
      )}
      <Btn className="h-9 px-3" onClick={() => setProfilesOpen(true)}>
        Profile
      </Btn>
      <Btn
        kind={onlySelected ? 'on' : 'plain'}
        className="size-9"
        aria-label="Nur Kanäle mit Select (Tape) zeigen"
        aria-pressed={onlySelected}
        title="Nur Kanäle mit Select (Tape) zeigen"
        onClick={() => onOnlySelected(!onlySelected)}
      >
        <Icon name="tape" className="size-5" />
      </Btn>
      {profilesOpen && <ProfilesDialog onClose={() => setProfilesOpen(false)} />}
      <DefaultProfilePrompt />

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
        <div className="bg-surf absolute top-11 left-1/2 z-20 grid w-56 -translate-x-1/2 grid-cols-2 gap-2 rounded-lg border border-white/12 p-2 shadow-[0_24px_64px_rgb(0_0_0/0.7)]">
          <Btn
            kind={['standby', 'recording', 'recPaused'].includes(recorder.state) ? 'rec' : 'plain'}
            className={cn('h-11', recorder.state === 'recPaused' && 'animate-pulse')}
            onClick={() => press('rec')}
          >
            ● Rec
          </Btn>
          <Btn
            kind={recorder.state === 'playing' ? 'on' : 'plain'}
            className={cn('h-11', recorder.state === 'paused' && 'animate-pulse')}
            onClick={() => press('play')}
          >
            ▶ ❚❚ Play
          </Btn>
          <Btn className="col-span-2 h-11" onClick={() => press('stop')}>
            ■ Stop
          </Btn>
          <Btn className="h-11" aria-label="1 Minute zurück" onClick={() => press('rew')}>
            ◀◀ 1 min
          </Btn>
          <Btn className="h-11" aria-label="1 Minute vor" onClick={() => press('ff')}>
            1 min ▶▶
          </Btn>
          <p className="text-fg2 col-span-2 px-1 text-xs">
            {recorder.state === 'standby'
              ? 'Aufnahme bereit: Play startet, Rec bricht ab.'
              : recorder.state === 'recPaused'
                ? 'Aufnahme pausiert: springen, dann Play nimmt weiter auf.'
                : 'Rec, dann Play nimmt auf. Play während der Aufnahme pausiert.'}
          </p>
        </div>
      </details>

      <a
        href={source === 'demo' ? '?l20' : '?'}
        className="text-fg3 text-xs underline"
        title="Zwischen Demo-Mixer und echtem L-20 wechseln"
      >
        {source === 'demo' ? 'Demo · zum echten L-20' : 'Echter L-20 · zur Demo'}
      </a>
      <button
        type="button"
        onClick={() => connect().catch((e: Error) => alert(e.message))}
        disabled={status !== 'disconnected'}
      >
        <StatusPill connected={status === 'connected'}>
          {status === 'connected'
            ? source === 'demo'
              ? 'DEMO VERBUNDEN'
              : 'L-20 VERBUNDEN'
            : status === 'connecting'
              ? 'VERBINDE…'
              : source === 'demo'
                ? 'GETRENNT · NEU VERBINDEN'
                : 'MIT L-20 VERBINDEN'}
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
  /** first and last slot on screen; slots count a fixed stereo pair once (see slotOf) */
  highlight: [number, number]
  onOpen: (slot: number) => void
  onScroll: (dxSlots: number) => void
}) {
  const meters = useMixerStore((s) => s.meters)
  const drag = useRef<{ x: number; moved: boolean } | null>(null)
  const items = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1)
  const STEP = 33

  return (
    <div
      className="border-line bg-sidebar/85 flex h-12 shrink-0 touch-none items-center border-t px-4"
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
          className="border-fg/70 bg-fg/5 absolute -inset-y-1 rounded-lg border-[1.5px] transition-[left,width]"
          style={{
            left: (highlight[0] - 1) * STEP - 4,
            width: (highlight[1] - highlight[0]) * STEP + 40,
          }}
        />
        {items.map((slot) => {
          const on = slot >= highlight[0] && slot <= highlight[1]
          const ch = slotChannel(slot)
          const stereo = isFixedStereo(ch)
          return (
            <div
              key={slot}
              data-ch={slot}
              className="relative flex w-[33px] items-center justify-center gap-1 py-1"
            >
              <span
                className={cn(
                  'font-mono',
                  'text-right',
                  stereo ? 'w-3 text-[9px] leading-[11px]' : 'text-[11px]',
                  on ? 'font-medium' : 'text-fg2',
                )}
              >
                {stereo ? (
                  <>
                    {ch}
                    <br />
                    {ch + 1}
                  </>
                ) : (
                  ch
                )}
              </span>
              <div className="flex h-6 gap-0.5">
                <Meter level={meters[ch - 1]} />
                {stereo && <Meter level={meters[ch]} />}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
