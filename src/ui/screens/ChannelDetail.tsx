import { useState } from 'react'
import {
  EQ_GAIN_MAX,
  LOW_CUT_MAX_HZ,
  LOW_CUT_MIN_HZ,
  NAME_MAX,
  NEXT_REC_SELECT,
  type Eq,
  type FxMixId,
} from '@/lib/mixer'
import { formatDb, formatPan } from '@/lib/scale'
import { cn } from '@/lib/utils'
import { useMixerStore } from '@/state/mixerStore'
import { Btn, Fader, Icon, Slider, Knob, Label, ValueBox } from '../components/controls'
import { EqGraph } from '../components/EqGraph'
import { channelNo, REC_SELECT_TITLE, formatHz, isFixedStereo, linkCommand } from '../mixView'

const FLAT: Partial<Eq> = { lowCut: false, low: 0, midGain: 0, midFreq: 1000, high: 0 }
const gainPos = (db: number) => (db + EQ_GAIN_MAX) / (2 * EQ_GAIN_MAX)
const posGain = (p: number) => Math.round((p * 2 - 1) * EQ_GAIN_MAX * 2) / 2
const signed = (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`
// mid frequency knob is logarithmic, 100 Hz … 8 kHz
const freqPos = (f: number) => Math.log(f / 100) / Math.log(80)
const posFreq = (p: number) => Math.round((100 * 80 ** p) / 10) * 10
// low cut knob like the hardware: far left is OFF, then 40 … 600 Hz logarithmic
const CUT_OFF = 0.05
const CUT_SPAN = LOW_CUT_MAX_HZ / LOW_CUT_MIN_HZ
const cutPos = (eq: Eq) =>
  eq.lowCut
    ? CUT_OFF + ((1 - CUT_OFF) * Math.log(eq.lowCutHz / LOW_CUT_MIN_HZ)) / Math.log(CUT_SPAN)
    : 0
const posCut = (p: number): Partial<Eq> =>
  p < CUT_OFF
    ? { lowCut: false }
    : { lowCut: true, lowCutHz: LOW_CUT_MIN_HZ * CUT_SPAN ** ((p - CUT_OFF) / (1 - CUT_OFF)) }

export function ChannelDetail({ ch, onBack }: { ch: number; onBack: () => void }) {
  const mixer = useMixerStore((s) => s.mixer)
  const meter = useMixerStore((s) => s.meters[ch - 1])
  const meterR = useMixerStore((s) => s.meters[ch])
  const dispatch = useMixerStore((s) => s.dispatch)
  const c = mixer.channels[ch - 1]
  const partner = c.linkedWith ? mixer.channels[c.linkedWith - 1] : null
  const link = linkCommand(mixer, ch)
  const eq = (patch: Partial<Eq>) => dispatch({ type: 'eq', ch, patch })
  const fixed = isFixedStereo(ch)
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex h-full flex-col gap-4">
      {editing && (
        <EditDialog
          name={c.name}
          color={c.color}
          onClose={() => setEditing(false)}
          onSave={(patch) => {
            dispatch({ type: 'channel', ch, patch })
            setEditing(false)
          }}
        />
      )}
      <header className="flex items-center gap-4">
        <Btn className="size-10" aria-label="Zurück" onClick={onBack}>
          <Icon name="back" className="size-5" />
        </Btn>
        <div className="h-7 w-1 rounded-full" style={{ background: c.color }} />
        <h1 className="flex items-baseline gap-2 text-xl font-semibold">
          <span className="text-fg3 font-mono text-base font-normal">
            {fixed ? `${ch}·${ch + 1}` : channelNo(ch)}
          </span>
          {c.name}
        </h1>
        <Btn className="-ml-1 size-9" aria-label="Bearbeiten" onClick={() => setEditing(true)}>
          <Icon name="edit" />
        </Btn>
        {partner && !fixed && (
          <span className="text-fg2 text-sm">
            Stereo mit {channelNo(partner.id)} {partner.name}
          </span>
        )}
        {fixed && <span className="text-fg2 text-sm">Stereo-Eingang</span>}
        <div className="-mx-2 flex-1" />
        <Btn
          kind={partner ? 'on' : 'plain'}
          className={cn('h-9 px-4', fixed && 'hidden')}
          disabled={!link}
          onClick={() => link && dispatch(link)}
        >
          <Icon name="link" />
          {partner ? `Stereo-Link mit ${partner.id}` : 'Stereo-Link'}
        </Btn>
        <Btn className="h-9 px-4" onClick={() => eq(FLAT)}>
          Reset
        </Btn>
        <Label>EQ</Label>
        <button
          type="button"
          role="switch"
          aria-checked={c.eq.on}
          aria-label="EQ an/aus"
          onClick={() => eq({ on: !c.eq.on })}
          className={cn(
            'relative h-7 w-12 rounded-full transition-colors',
            c.eq.on ? 'bg-fg' : 'bg-track',
          )}
        >
          <span
            className={cn(
              'absolute top-1 size-5 rounded-full transition-[left]',
              c.eq.on ? 'bg-canvas left-6' : 'bg-fg2 left-1',
            )}
          />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <section className="card flex w-28 shrink-0 flex-col items-stretch p-2.5">
          <Btn
            kind={c.phase ? 'on' : 'plain'}
            className="h-8"
            aria-pressed={c.phase}
            onClick={() => dispatch({ type: 'channel', ch, patch: { phase: !c.phase } })}
          >
            Ø Phase
          </Btn>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Btn
              kind={c.mute ? 'mute' : 'plain'}
              className="h-8"
              aria-pressed={c.mute}
              onClick={() => dispatch({ type: 'channel', ch, patch: { mute: !c.mute } })}
            >
              M
            </Btn>
            <Btn
              kind={c.solo ? 'solo' : 'plain'}
              className="h-8"
              aria-pressed={c.solo}
              onClick={() => dispatch({ type: 'channel', ch, patch: { solo: !c.solo } })}
            >
              S
            </Btn>
          </div>
          <Btn
            kind={c.recSelect === 'off' ? 'plain' : c.recSelect}
            className="mt-2 h-8"
            aria-pressed={c.recSelect !== 'off'}
            title={REC_SELECT_TITLE[c.recSelect]}
            aria-label={`Select: ${REC_SELECT_TITLE[c.recSelect]}`}
            onClick={() =>
              dispatch({ type: 'channel', ch, patch: { recSelect: NEXT_REC_SELECT[c.recSelect] } })
            }
          >
            <Icon name="tape" className="size-5" />
          </Btn>
          <ValueBox className="mx-auto mt-2 w-[70px]">{formatDb(c.fader)}</ValueBox>
          <Fader
            db={c.fader}
            onChange={(db) => dispatch({ type: 'channel', ch, patch: { fader: db } })}
            levels={fixed ? [meter, meterR] : [meter]}
            label={`Fader ${c.name}`}
            reset={0}
          />
          {!fixed && (
            <div className="border-line mt-2 border-t pt-2">
              <div className="text-fg3 flex justify-between font-mono text-[10px]">
                <span>PAN</span>
                <span className="text-fg">{formatPan(c.pan)}</span>
              </div>
              <Slider
                pos={(c.pan + 100) / 200}
                onPos={(p) =>
                  dispatch({ type: 'channel', ch, patch: { pan: Math.round(p * 200 - 100) } })
                }
                origin={0.5}
                label={`Pan ${c.name}`}
                reset={0.5}
                valueText={formatPan(c.pan)}
              />
            </div>
          )}
        </section>
        <section className="card flex w-fit shrink-0 flex-col p-3">
          <div className="divide-line flex min-h-0 flex-1 flex-col divide-y">
            {(['fx1', 'fx2'] as FxMixId[]).map((mix) => (
              <div key={mix} className="flex min-h-0 flex-1 flex-col py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{mix === 'fx1' ? 'FX 1' : 'FX 2'}</span>
                  <ValueBox className="text-xs">{formatDb(c.sends[mix].level)}</ValueBox>
                </div>
                <Fader
                  db={c.sends[mix].level}
                  onChange={(db) => dispatch({ type: 'send', ch, mix, patch: { level: db } })}
                  levels={[]}
                  handle="sm"
                  label={`Send ${mix}`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="card flex min-w-0 flex-1 flex-col p-4">
          <Label className="mb-3">
            EQ{' '}
            <span className="text-fg2 ml-3 font-sans text-xs tracking-normal normal-case">
              3 Bänder und Low Cut
            </span>
          </Label>
          <EqGraph eq={c.eq} onChange={eq} />
          <div className="mt-6 grid grid-cols-5 items-start">
            <Knob
              label="Low Cut"
              pos={cutPos(c.eq)}
              onPos={(p) => eq(posCut(p))}
              reset={0}
              valueText={c.eq.lowCut ? formatHz(c.eq.lowCutHz) : 'Aus'}
            />
            <Knob
              label="Low"
              pos={gainPos(c.eq.low)}
              onPos={(p) => eq({ low: posGain(p) })}
              reset={0.5}
              valueText={signed(c.eq.low)}
            />
            <Knob
              label="Mid Gain"
              pos={gainPos(c.eq.midGain)}
              onPos={(p) => eq({ midGain: posGain(p) })}
              reset={0.5}
              valueText={signed(c.eq.midGain)}
            />
            <Knob
              label="Mid Freq"
              pos={freqPos(c.eq.midFreq)}
              onPos={(p) => eq({ midFreq: posFreq(p) })}
              reset={freqPos(1000)}
              valueText={formatHz(c.eq.midFreq)}
            />
            <Knob
              label="High"
              pos={gainPos(c.eq.high)}
              onPos={(p) => eq({ high: posGain(p) })}
              reset={0.5}
              valueText={signed(c.eq.high)}
            />
          </div>
          <div className="border-line text-fg2 mt-auto space-y-1.5 border-t pt-4 text-xs">
            <p>Punkte in der Kurve ziehen oder Regler drehen. Doppeltippen setzt zurück.</p>
            {partner && !isFixedStereo(ch) && (
              <p>
                Bei Stereo-Link gilt alles auch für Kanal {partner.id}, der Pan wird gespiegelt.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

const COLORS = [
  '#5aa9f0',
  '#a98bf0',
  '#3ecf8e',
  '#f2667a',
  '#f2a04b',
  '#f2d24b',
  '#4bd6e8',
  '#8b8f98',
]

/** Name and colour of a channel; both stay per channel, a stereo partner keeps its own. */
function EditDialog({
  name,
  color,
  onClose,
  onSave,
}: {
  name: string
  color: string
  onClose: () => void
  onSave: (patch: { name: string; color: string }) => void
}) {
  const [draft, setDraft] = useState({ name, color })
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-label="Kanal bearbeiten"
        className="bg-surf w-96 rounded-xl border border-white/12 p-5 shadow-[0_24px_64px_rgb(0_0_0/0.7)]"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onSave({ ...draft, name: draft.name.trim() || name })
        }}
      >
        <h2 className="text-lg font-semibold">Kanal bearbeiten</h2>
        <label className="mt-4 block">
          <Label className="mb-1.5">Name</Label>
          <input
            autoFocus
            maxLength={NAME_MAX}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="border-line bg-raised focus:border-fg2 h-10 w-full rounded border px-3 text-base outline-none"
          />
        </label>
        <Label className="mt-4 mb-1.5">Farbe</Label>
        <div role="radiogroup" aria-label="Farbe" className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={draft.color === c}
              aria-label={c}
              onClick={() => setDraft({ ...draft, color: c })}
              className={cn(
                'size-9 rounded-full ring-offset-2 ring-offset-[#15171d]',
                draft.color === c && 'ring-fg ring-2',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Btn className="h-10 px-4" onClick={onClose}>
            Abbrechen
          </Btn>
          <Btn kind="on" type="submit" className="h-10 px-4">
            Speichern
          </Btn>
        </div>
      </form>
    </div>
  )
}
