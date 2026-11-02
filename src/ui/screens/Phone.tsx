import { useState } from 'react'
import type { Device } from '@/lib/devices'
import { MONITOR_MIXES, type MonitorMixId } from '@/lib/mixer'
import { dbToPos, formatDb, posToDb } from '@/lib/scale'
import { cn } from '@/lib/utils'
import { myDeviceId, useDevicesStore } from '@/state/devicesStore'
import { useMixerStore } from '@/state/mixerStore'
import { Btn, HMeter, Slider, Icon, Label, StatusPill, ValueBox } from '../components/controls'
import { channelGroups, mixLevel, sendLevel, type ChannelGroup } from '../mixView'

const toPos = (db: number) => 1 - dbToPos(db)
const ZERO = toPos(0)

/** A phone opened via ?phone: welcome, name, pick a free mix, then the mix itself. */
export function PhoneEntry() {
  const me = useDevicesStore((s) => s.devices.find((d) => d.id === myDeviceId))
  const [welcome, setWelcome] = useState(() => !welcomeHidden())
  return (
    <>
      {me?.mix ? (
        <Phone mix={me.mix} me={me} />
      ) : (
        <div className="mx-auto flex h-dvh max-w-md flex-col justify-center px-6">
          {me ? <PickMix me={me} /> : <Join />}
        </div>
      )}
      {welcome && <Welcome onClose={() => setWelcome(false)} />}
    </>
  )
}

const WELCOME_KEY = 'l20-welcome-hidden'
const welcomeHidden = () => {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

// Android Chrome offers a real install prompt; iPhones only allow Share → Home Screen by hand
let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null
globalThis.addEventListener?.('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as typeof installPrompt
})
const isIos = /iPhone|iPad|iPod/.test(globalThis.navigator?.userAgent ?? '')
const standalone = globalThis.matchMedia?.('(display-mode: standalone)').matches

/** Shown on every visit until "Nicht mehr anzeigen" is ticked. */
function Welcome({ onClose }: { onClose: () => void }) {
  const [hide, setHide] = useState(false)
  const close = () => {
    try {
      if (hide) localStorage.setItem(WELCOME_KEY, '1')
    } catch {
      // private mode: the dialog just shows again next time
    }
    onClose()
  }
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-4 backdrop-blur-md">
      <div
        role="dialog"
        aria-label="Willkommen"
        className="bg-surf w-full max-w-md rounded-xl border border-white/12 p-5 shadow-[0_24px_64px_rgb(0_0_0/0.7)]"
      >
        <h2 className="text-2xl font-bold">Willkommen beim L-20 Mixer</h2>
        <p className="text-fg2 mt-2 text-base">
          Hier stellst du dir deinen eigenen Monitor-Mix für die In-Ears ein.
        </p>
        {!standalone && (
          <div className="border-line mt-4 rounded border p-3">
            <div className="font-semibold">Als App auf den Home-Bildschirm</div>
            {isIos ? (
              <p className="text-fg2 mt-1 text-sm">
                Unten in Safari auf <b className="text-fg">Teilen</b> tippen, dann{' '}
                <b className="text-fg">Zum Home-Bildschirm</b>.
              </p>
            ) : installPrompt ? (
              <Btn
                kind="on"
                className="mt-2 h-11 w-full text-base"
                onClick={() => void installPrompt?.prompt()}
              >
                Zum Home-Bildschirm hinzufügen
              </Btn>
            ) : (
              <p className="text-fg2 mt-1 text-sm">
                Im Browser-Menü <b className="text-fg">⋮</b> auf{' '}
                <b className="text-fg">Zum Startbildschirm hinzufügen</b> tippen.
              </p>
            )}
          </div>
        )}
        <label className="mt-4 flex items-center gap-3 text-base">
          <input
            type="checkbox"
            checked={hide}
            onChange={(e) => setHide(e.target.checked)}
            className="size-5"
          />
          Nicht mehr anzeigen
        </label>
        <Btn className="mt-4 h-12 w-full text-base" onClick={close}>
          Los geht&apos;s
        </Btn>
      </div>
    </div>
  )
}

function Join() {
  const dispatch = useDevicesStore((s) => s.dispatch)
  const [name, setName] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        dispatch({ type: 'join', id: myDeviceId, name })
      }}
    >
      <h1 className="text-4xl font-bold">Wie heißt du?</h1>
      <p className="text-fg2 mt-2 text-lg">Dein Name erscheint am iPad bei deinem Mix.</p>
      <input
        autoFocus
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="z. B. Lisa (Bass)"
        aria-label="Dein Name"
        className="border-line bg-raised focus:border-fg2 mt-6 h-14 w-full rounded border px-4 text-xl outline-none"
      />
      <Btn kind="on" type="submit" disabled={!name.trim()} className="mt-4 h-14 w-full text-lg">
        Weiter
      </Btn>
    </form>
  )
}

/** Free mixes can be tapped; taken ones are greyed out with their owner's name. */
function PickMix({ me }: { me: Device }) {
  const devices = useDevicesStore((s) => s.devices)
  const dispatch = useDevicesStore((s) => s.dispatch)
  return (
    <div>
      <h1 className="text-4xl font-bold">Hallo {me.name}</h1>
      <p className="text-fg2 mt-2 text-lg">Welcher Mix ist deiner?</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {MONITOR_MIXES.map((m) => {
          const owner = devices.find((d) => d.mix === m)
          return (
            <button
              key={m}
              type="button"
              disabled={!!owner}
              onClick={() => dispatch({ type: 'claim', id: me.id, mix: m })}
              className="card flex h-24 flex-col items-center justify-center disabled:opacity-40"
            >
              <span className="text-2xl font-bold">Mix {m}</span>
              <span className="text-fg2 truncate text-sm">{owner ? owner.name : 'frei'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A musician's phone: their own monitor mix, portrait. */
export function Phone({ mix, me }: { mix: MonitorMixId; me?: Device }) {
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
          <div>
            <h1 className="text-4xl font-bold">Mix {mix}</h1>
            {me && <p className="text-fg2 text-lg">{me.name}</p>}
          </div>
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
        <Slider
          handle="lg"
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
          <span className="text-fg2 text-lg whitespace-nowrap">Mix stumm</span>
          {me?.foh && (
            // shortcut: the full view is the iPad layout; a phone layout of it comes later
            <a
              href="./"
              className="border-line ml-auto flex h-12 items-center rounded border px-4 text-base whitespace-nowrap"
            >
              Ganzes Pult
            </a>
          )}
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
      <Slider
        handle="lg"
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
