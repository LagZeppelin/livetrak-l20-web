import { useRef } from 'react'
import { EQ_GAIN_MAX, type Eq } from '@/lib/mixer'
import { EQ_HIGH_HZ, EQ_LOW_HZ, eqResponse, LOW_CUT_HZ } from '@/lib/scale'

const W = 600
const LOG_MIN = Math.log10(20)
const LOG_SPAN = Math.log10(20000) - LOG_MIN
const fx = (f: number) => ((Math.log10(f) - LOG_MIN) / LOG_SPAN) * W
const xf = (x: number) => 10 ** (LOG_MIN + (x / W) * LOG_SPAN)

function curve(eq: Eq, h: number, range: number) {
  const gy = (db: number) => h / 2 - (Math.max(-range, Math.min(range, db)) / range) * (h / 2)
  const pts = Array.from({ length: 121 }, (_, i) => {
    const x = (i / 120) * W
    return `${x.toFixed(1)},${gy(eqResponse(eq, xf(x))).toFixed(1)}`
  })
  return { line: `M${pts.join(' L')}`, gy }
}

/** Small read-only picture of the master's 15-band graphic EQ. */
export function MiniGeq({ geq }: { geq: number[] }) {
  const pts = geq.map((g, i) => `${((i + 0.5) / geq.length) * W},${30 - (g / EQ_GAIN_MAX) * 26}`)
  return (
    <svg
      viewBox={`0 0 ${W} 60`}
      preserveAspectRatio="none"
      className="bg-raised/60 h-12 w-full rounded"
    >
      <line x1="0" y1="30" x2={W} y2="30" stroke="#3a3f4b" strokeDasharray="6 6" />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke="#6aaef5"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** Small read-only curve in the channel strip. */
export function MiniEq({ eq }: { eq: Eq }) {
  const { line } = curve(eq, 60, 18)
  return (
    <svg
      viewBox={`0 0 ${W} 60`}
      preserveAspectRatio="none"
      className="bg-raised/60 h-12 w-full rounded"
    >
      <line x1="0" y1="30" x2={W} y2="30" stroke="#3a3f4b" strokeDasharray="6 6" />
      <path
        d={line}
        fill="none"
        stroke={eq.on ? '#6aaef5' : '#707688'}
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

const H = 280
const FREQ_LABELS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

/** Large EQ with draggable band points (L, M, H). */
export function EqGraph({ eq, onChange }: { eq: Eq; onChange: (patch: Partial<Eq>) => void }) {
  const svg = useRef<SVGSVGElement>(null)
  const { line, gy } = curve(eq, H, EQ_GAIN_MAX)
  const dragging = useRef<'low' | 'mid' | 'high' | null>(null)

  const move = (e: React.PointerEvent) => {
    const band = dragging.current
    if (!band || !svg.current) return
    const r = svg.current.getBoundingClientRect()
    const x = ((e.clientX - r.left) / r.width) * W
    const db = Math.round((0.5 - (e.clientY - r.top) / r.height) * 2 * EQ_GAIN_MAX * 2) / 2
    if (band === 'low') onChange({ low: db })
    if (band === 'high') onChange({ high: db })
    if (band === 'mid') onChange({ midGain: db, midFreq: Math.round(xf(x) / 10) * 10 })
  }

  const point = (band: 'low' | 'mid' | 'high', f: number, db: number, label: string) => (
    <g
      onPointerDown={(e) => {
        ;(e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId)
        dragging.current = band
      }}
      className="cursor-grab"
    >
      <circle cx={fx(f)} cy={gy(db)} r="22" fill="transparent" />
      <circle cx={fx(f)} cy={gy(db)} r="11" fill="#6aaef5" stroke="#0b0c10" strokeWidth="2" />
      <text
        x={fx(f)}
        y={gy(db) + 3.5}
        textAnchor="middle"
        fontSize="10"
        fontWeight="700"
        className="fill-canvas pointer-events-none font-mono"
      >
        {label}
      </text>
    </g>
  )

  return (
    <div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="bg-raised/40 w-full touch-none overflow-visible rounded"
        onPointerMove={move}
        onPointerUp={() => (dragging.current = null)}
        onPointerCancel={() => (dragging.current = null)}
      >
        <defs>
          <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6aaef5" stopOpacity="0.3" />
            <stop offset="1" stopColor="#6aaef5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {FREQ_LABELS.map((f) => (
          <line key={f} x1={fx(f)} y1="0" x2={fx(f)} y2={H} stroke="#1d2028" />
        ))}
        {[12, 0, -12].map((db) => (
          <g key={db}>
            <line
              x1="0"
              y1={gy(db)}
              x2={W}
              y2={gy(db)}
              stroke={db ? '#1d2028' : '#3a3f4b'}
              strokeDasharray={db ? undefined : '3 3'}
            />
            <text x="6" y={gy(db) - 4} fontSize="10" className="fill-fg3 font-mono">
              {db > 0 ? `+${db}` : db}
            </text>
          </g>
        ))}
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#eqfill)" opacity={eq.on ? 1 : 0.3} />
        <path d={line} fill="none" stroke={eq.on ? '#6aaef5' : '#707688'} strokeWidth="2" />
        {eq.lowCut && (
          <g>
            <circle cx={fx(LOW_CUT_HZ)} cy={gy(eqResponse(eq, LOW_CUT_HZ))} r="11" fill="#6aaef5" />
            <text
              x={fx(LOW_CUT_HZ)}
              y={gy(eqResponse(eq, LOW_CUT_HZ)) + 3.5}
              textAnchor="middle"
              fontSize="9"
              fontWeight="700"
              className="fill-canvas font-mono"
            >
              LC
            </text>
          </g>
        )}
        {point('low', EQ_LOW_HZ, eq.low, 'L')}
        {point('mid', eq.midFreq, eq.midGain, 'M')}
        {point('high', EQ_HIGH_HZ, eq.high, 'H')}
      </svg>
      <div className="text-fg3 relative mt-1 h-4 font-mono text-[10px]">
        {FREQ_LABELS.map((f) => (
          <span
            key={f}
            className="absolute -translate-x-1/2"
            style={{ left: `${(fx(f) / W) * 100}%` }}
          >
            {f >= 1000 ? `${f / 1000}k` : f}
          </span>
        ))}
      </div>
    </div>
  )
}
