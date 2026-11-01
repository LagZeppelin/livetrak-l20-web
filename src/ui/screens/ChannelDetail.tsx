import { EQ_GAIN_MAX, type Eq, type FxMixId } from '@/lib/mixer'
import { dbToPos, formatDb, formatPan, posToDb } from '@/lib/scale'
import { cn } from '@/lib/utils'
import { useMixerStore } from '@/state/mixerStore'
import { Btn, Fader, Slider, Icon, Knob, Label, ValueBox } from '../components/controls'
import { EqGraph } from '../components/EqGraph'
import { channelNo, formatHz, isFixedStereo, linkCommand } from '../mixView'

const FLAT: Partial<Eq> = { lowCut: false, low: 0, midGain: 0, midFreq: 1000, high: 0 }
const gainPos = (db: number) => (db + EQ_GAIN_MAX) / (2 * EQ_GAIN_MAX)
const posGain = (p: number) => Math.round((p * 2 - 1) * EQ_GAIN_MAX * 2) / 2
const signed = (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`
// mid frequency knob is logarithmic, 100 Hz … 8 kHz
const freqPos = (f: number) => Math.log(f / 100) / Math.log(80)
const posFreq = (p: number) => Math.round((100 * 80 ** p) / 10) * 10

export function ChannelDetail({ ch, onBack }: { ch: number; onBack: () => void }) {
  const mixer = useMixerStore((s) => s.mixer)
  const meter = useMixerStore((s) => s.meters[ch - 1])
  const meterR = useMixerStore((s) => s.meters[ch])
  const dispatch = useMixerStore((s) => s.dispatch)
  const c = mixer.channels[ch - 1]
  const partner = c.linkedWith ? mixer.channels[c.linkedWith - 1] : null
  const link = linkCommand(mixer, ch)
  const eq = (patch: Partial<Eq>) => dispatch({ type: 'eq', ch, patch })
  const pre = c.sends.fx1.pre
  const fixed = isFixedStereo(ch)

  return (
    <div className="flex h-full flex-col gap-4">
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
        {partner && !fixed && (
          <span className="text-fg2 text-sm">
            Stereo mit {channelNo(partner.id)} {partner.name}
          </span>
        )}
        {fixed && <span className="text-fg2 text-sm">Stereo-Eingang</span>}
        <Btn
          kind={partner ? 'on' : 'plain'}
          className={cn('ml-auto h-9 px-4', fixed && 'invisible')}
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
        <section className="card flex min-w-0 flex-1 flex-col p-4">
          <Label className="mb-3">
            EQ{' '}
            <span className="text-fg2 ml-3 font-sans text-xs tracking-normal normal-case">
              3 Bänder und Low Cut
            </span>
          </Label>
          <EqGraph eq={c.eq} onChange={eq} />
          <div className="mt-6 grid grid-cols-5 items-start">
            <div className="flex flex-col items-center gap-1.5">
              <Btn
                kind={c.eq.lowCut ? 'on' : 'plain'}
                className="mt-1 size-[52px] rounded-full text-xs"
                aria-pressed={c.eq.lowCut}
                onClick={() => eq({ lowCut: !c.eq.lowCut })}
              >
                {c.eq.lowCut ? 'An' : 'Aus'}
              </Btn>
              <Label className="mt-0.5">Low Cut</Label>
              <div className="font-mono text-sm">75 Hz</div>
            </div>
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

        <section className="card flex h-fit w-[280px] shrink-0 flex-col p-4">
          <div className="flex items-center justify-between">
            <Label>FX-Sends</Label>
            <div className="border-line flex rounded border p-0.5 text-xs">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  className={cn('rounded px-3 py-1', pre === v ? 'bg-raised' : 'text-fg2')}
                  onClick={() =>
                    (['fx1', 'fx2'] as FxMixId[]).forEach((mix) =>
                      dispatch({ type: 'send', ch, mix, patch: { pre: v } }),
                    )
                  }
                >
                  {v ? 'Pre' : 'Post'}
                </button>
              ))}
            </div>
          </div>
          {(['fx1', 'fx2'] as FxMixId[]).map((mix) => (
            <div key={mix} className="mt-5">
              <div className="mb-2 flex justify-between text-sm">
                <span className="font-semibold">{mix === 'fx1' ? 'FX 1' : 'FX 2'}</span>
                <span className="font-mono text-xs">{formatDb(c.sends[mix].level)} dB</span>
              </div>
              <Slider
                pos={1 - dbToPos(c.sends[mix].level)}
                onPos={(p) => dispatch({ type: 'send', ch, mix, patch: { level: posToDb(1 - p) } })}
                label={`Send ${mix}`}
                valueText={`${formatDb(c.sends[mix].level)} dB`}
              />
            </div>
          ))}
          <p className="text-fg2 mt-5 text-xs">Pre/Post gilt für den ganzen Kanal.</p>
        </section>

        <section className="card flex w-28 shrink-0 flex-col items-stretch p-2.5">
          {!fixed && (
            <Knob
              label="Pan"
              size={52}
              pos={(c.pan + 100) / 200}
              onPos={(p) =>
                dispatch({ type: 'channel', ch, patch: { pan: Math.round(p * 200 - 100) } })
              }
              reset={0.5}
              valueText={formatPan(c.pan)}
            />
          )}
          <Btn
            kind={c.phase ? 'on' : 'plain'}
            className="mt-3 h-8"
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
            kind={c.recSelect ? 'rec' : 'plain'}
            className="mt-2 h-8"
            aria-pressed={c.recSelect}
            onClick={() => dispatch({ type: 'channel', ch, patch: { recSelect: !c.recSelect } })}
          >
            Select
          </Btn>
          <ValueBox className="mx-auto mt-2 w-[70px]">{formatDb(c.fader)}</ValueBox>
          <Fader
            db={c.fader}
            onChange={(db) => dispatch({ type: 'channel', ch, patch: { fader: db } })}
            levels={fixed ? [meter, meterR] : [meter]}
            label={`Fader ${c.name}`}
          />
        </section>
      </div>
    </div>
  )
}
