import { EQ_GAIN_MAX, GEQ_BANDS } from '@/lib/mixer'
import { useMixerStore } from '@/state/mixerStore'
import { Btn, Icon, Label, Slider, ValueBox } from '../components/controls'
import { GeqGraph } from '../components/EqGraph'

const hz = (f: number) => (f >= 1000 ? `${f / 1000}k` : String(f))
// slider pos 0 = top = +15 dB
const toPos = (db: number) => (EQ_GAIN_MAX - db) / (2 * EQ_GAIN_MAX)
const toDb = (p: number) => Math.round((EQ_GAIN_MAX - p * 2 * EQ_GAIN_MAX) * 2) / 2

/** Master detail: the L-20's 15-band graphic EQ on the main output. */
export function MasterDetail({ onBack }: { onBack: () => void }) {
  const geq = useMixerStore((s) => s.mixer.main.geq)
  const dispatch = useMixerStore((s) => s.dispatch)
  return (
    <div className="flex h-full flex-col gap-4">
      <header className="flex items-center gap-4">
        <Btn className="size-10" aria-label="Zurück" onClick={onBack}>
          <Icon name="back" className="size-5" />
        </Btn>
        <h1 className="text-xl font-semibold">Master</h1>
        <span className="text-fg2 text-sm">Grafischer EQ, 15 Bänder</span>
        <Btn
          className="ml-auto h-9 px-4"
          onClick={() => geq.forEach((_, band) => dispatch({ type: 'geq', band, gain: 0 }))}
        >
          Reset
        </Btn>
      </header>
      <section className="card flex min-h-0 flex-1 flex-col p-4">
        <Label className="mb-3">EQ ±{EQ_GAIN_MAX} dB</Label>
        <div className="mb-4">
          <GeqGraph geq={geq} />
        </div>
        <div className="relative grid min-h-0 flex-1 grid-cols-15">
          {GEQ_BANDS.map((f, band) => (
            <div key={f} className="flex min-h-0 flex-col items-center gap-2">
              <ValueBox className="w-12 px-0 text-xs">
                {(geq[band] > 0 ? '+' : '') + geq[band].toFixed(1).replace('.', ',')}
              </ValueBox>
              <div className="flex min-h-0 flex-1 py-3.5">
                <Slider
                  axis="y"
                  origin={0.5}
                  pos={toPos(geq[band])}
                  onPos={(p) => dispatch({ type: 'geq', band, gain: toDb(p) })}
                  label={`${hz(f)} Hz`}
                  reset={0.5}
                  valueText={`${geq[band]} dB`}
                />
              </div>
              <span className="text-fg2 font-mono text-xs">{hz(f)}</span>
            </div>
          ))}
        </div>
        <p className="border-line text-fg2 mt-4 border-t pt-3 text-xs">
          Wirkt auf den Main-Ausgang. Fader ziehen, Reset setzt alle Bänder auf 0 dB.
        </p>
      </section>
    </div>
  )
}
