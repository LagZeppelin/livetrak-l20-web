import { useRef, type ReactNode } from 'react'
import { FADER_MIN } from '@/lib/mixer'
import { cn } from '@/lib/utils'
import { dbToPos, formatDb, posToDb, SCALE_MARKS } from '@/lib/scale'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Relative drag on an element: the value moves with the finger from where it was,
 * so touching a fader never makes it jump (important live).
 * `axis` y: pos 0 = top. `span` = px for the full range (defaults to the element size).
 */
function useDrag(pos: number, onPos: (pos: number) => void, axis: 'x' | 'y', span?: number) {
  const start = useRef<{ at: number; pos: number; size: number } | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent<Element>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      const r = e.currentTarget.getBoundingClientRect()
      start.current = {
        at: axis === 'y' ? e.clientY : e.clientX,
        pos,
        size: span ?? (axis === 'y' ? r.height : r.width),
      }
    },
    onPointerMove: (e: React.PointerEvent<Element>) => {
      const s = start.current
      if (!s) return
      const delta = ((axis === 'y' ? e.clientY : e.clientX) - s.at) / s.size
      onPos(clamp01(s.pos + delta))
    },
    onPointerUp: () => (start.current = null),
    onPointerCancel: () => (start.current = null),
    style: { touchAction: 'none' } as const,
  }
}

// Meters light up only to 0 dBFS; the +dB part of the fader scale stays track grey.
const ZERO = dbToPos(0)
const covered = (level: number | undefined) =>
  Math.max(0, (dbToPos(level ?? -99) - ZERO) / (1 - ZERO))

/** Vertical meter on the fader taper so it lines up with the scale. */
export function Meter({ level }: { level: number | undefined }) {
  return (
    <div className="bg-track relative w-1.5 overflow-hidden rounded-full">
      <div className="meter-fill absolute inset-x-0 bottom-0" style={{ top: `${ZERO * 100}%` }}>
        <div
          className="bg-track absolute inset-x-0 top-0"
          style={{ height: `${covered(level) * 100}%` }}
        />
      </div>
    </div>
  )
}

/** Horizontal meter for the phone rows, same zero point as the horizontal faders. */
export function HMeter({ level }: { level: number | undefined }) {
  return (
    <div className="bg-track relative h-1 overflow-hidden rounded-full">
      <div
        className="absolute inset-y-0 left-0 bg-[linear-gradient(to_right,#3ecf8e_45%,#f2b44b_75%,#ff2a2a)]"
        style={{ width: `${(1 - ZERO) * 100}%` }}
      >
        <div
          className="bg-track absolute inset-y-0 right-0"
          style={{ width: `${covered(level) * 100}%` }}
        />
      </div>
    </div>
  )
}

/** Channel strip fader from Ron's design: track + knob left, scale middle, meters right. */
export function Fader({
  db,
  onChange,
  levels,
  label,
  handle = 'lg',
  reset = FADER_MIN,
}: {
  db: number
  onChange: (db: number) => void
  levels: (number | undefined)[]
  label: string
  handle?: 'sm' | 'lg'
  /** dB a double tap jumps to: -∞ for buses and sends, 0 dB for channel faders. */
  reset?: number
}) {
  return (
    <div className="relative flex min-h-0 flex-1 justify-between px-1 py-3.5">
      <div
        className="border-fg3/40 absolute inset-x-0 border-t border-dashed"
        style={{ top: `calc(14px + ${dbToPos(0)} * (100% - 28px))` }}
      />
      <Slider
        axis="y"
        handle={handle}
        pos={dbToPos(db)}
        onPos={(p) => onChange(posToDb(p))}
        reset={dbToPos(reset)}
        label={label}
        valueText={`${formatDb(db)} dB`}
      />
      <div className="text-fg3 relative min-w-7 flex-1 font-mono text-[10px]">
        {SCALE_MARKS.map((m) => (
          <span
            key={m}
            className={cn(
              'absolute right-1 -translate-y-1/2',
              m === 0 && 'text-fg2 bg-[#16181e] px-0.5',
            )}
            style={{ top: `${dbToPos(m) * 100}%` }}
          >
            {m > 0 ? `+${m}` : m <= FADER_MIN ? '-∞' : m}
          </span>
        ))}
      </div>
      <div className="flex gap-0.5">
        {levels.map((l, i) => (
          <Meter key={i} level={l} />
        ))}
      </div>
    </div>
  )
}

/**
 * The one slider for faders, sends and pan: same track, fill and thumb everywhere.
 * pos 0…1 (y: 0 = top). Fill runs from `origin` (default: bottom/left; 0.5 = centre for pan).
 * `handle` lg = big thumb for channel and mix faders.
 */
export function Slider({
  pos,
  onPos,
  axis = 'x',
  origin = axis === 'y' ? 1 : 0,
  mark,
  handle = 'sm',
  label,
  valueText,
  reset,
}: {
  pos: number
  onPos: (pos: number) => void
  axis?: 'x' | 'y'
  origin?: number
  mark?: number
  handle?: 'sm' | 'lg'
  label: string
  valueText: string
  /** Position a double tap jumps to; none means no reset. */
  reset?: number
}) {
  const drag = useDrag(pos, onPos, axis)
  const y = axis === 'y'
  const at = (p: number) => ({ [y ? 'top' : 'left']: `${p * 100}%` })
  return (
    <div
      {...drag}
      onDoubleClick={reset === undefined ? undefined : () => onPos(reset)}
      role="slider"
      aria-label={label}
      aria-orientation={y ? 'vertical' : 'horizontal'}
      aria-valuetext={valueText}
      aria-valuenow={Math.round((y ? 1 - pos : pos) * 100)}
      className={cn('relative shrink-0 cursor-grab', y ? 'w-7' : handle === 'lg' ? 'h-12' : 'h-6')}
    >
      <div
        className={cn(
          'bg-track absolute rounded-full',
          y
            ? 'inset-y-0 left-1/2 w-1.5 -translate-x-1/2'
            : 'inset-x-0 top-1/2 h-1.5 -translate-y-1/2',
        )}
      />
      <div
        className={cn(
          'bg-fg2 absolute rounded-full',
          y ? 'left-1/2 w-1.5 -translate-x-1/2' : 'top-1/2 h-1.5 -translate-y-1/2',
        )}
        style={{
          ...at(Math.min(pos, origin)),
          [y ? 'height' : 'width']: `${Math.abs(pos - origin) * 100}%`,
        }}
      />
      {mark !== undefined && !y && (
        <div className="bg-fg3 absolute top-[calc(50%-14px)] h-2 w-px" style={at(mark)} />
      )}
      <div
        className={cn(
          'bg-thumb absolute -translate-1/2 rounded-full shadow-[0_2px_4px_rgb(0_0_0/0.6)]',
          y ? 'left-1/2' : 'top-1/2',
          handle === 'lg' ? 'size-6' : 'size-4',
        )}
        style={at(pos)}
      />
    </div>
  )
}

/** Rotary knob, pos 0…1, vertical drag. Double tap resets to `reset`. */
export function Knob({
  pos,
  onPos,
  reset,
  label,
  valueText,
  size = 56,
}: {
  pos: number
  onPos: (pos: number) => void
  reset?: number
  label: string
  valueText: string
  size?: number
}) {
  // drag up = more, 150 px for the whole range
  const drag = useDrag(1 - pos, (p) => onPos(1 - p), 'y', 150)
  const a = -135 + pos * 270
  const arc = (from: number, to: number) => {
    const pt = (deg: number) => {
      const r = ((deg - 90) * Math.PI) / 180
      return `${50 + 44 * Math.cos(r)} ${50 + 44 * Math.sin(r)}`
    }
    return `M${pt(from)} A44 44 0 ${to - from > 180 ? 1 : 0} 1 ${pt(to)}`
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg
        {...drag}
        onDoubleClick={reset === undefined ? undefined : () => onPos(reset)}
        role="slider"
        aria-label={label}
        aria-valuetext={valueText}
        aria-valuenow={Math.round(pos * 100)}
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className="cursor-grab"
      >
        <path
          d={arc(-135, 135)}
          stroke="#262a34"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        {pos > 0.005 && (
          <path
            d={arc(-135, a)}
            stroke="#eceef3"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
          />
        )}
        <circle cx="50" cy="50" r="30" fill="#1d2028" stroke="#3a3f4b" />
        <line
          x1="50"
          y1="28"
          x2="50"
          y2="38"
          stroke="#eceef3"
          strokeWidth="4"
          strokeLinecap="round"
          transform={`rotate(${a} 50 50)`}
        />
      </svg>
      <div className="text-fg3 font-mono text-[10px] tracking-wider uppercase">{label}</div>
      <div className="font-mono text-sm">{valueText}</div>
    </div>
  )
}

type BtnKind = 'plain' | 'on' | 'mute' | 'solo' | 'rec' | 'play'
const KIND: Record<BtnKind, string> = {
  plain: 'border border-line bg-[rgb(22_25_32/0.55)] text-fg',
  on: 'bg-fg text-canvas',
  mute: 'bg-bad text-canvas',
  solo: 'bg-warn text-canvas',
  rec: 'border border-bad/50 bg-bad/16 text-bad',
  play: 'border border-warn/50 bg-warn/16 text-warn',
}

export function Btn({
  kind = 'plain',
  className,
  children,
  ...props
}: { kind?: BtnKind; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center justify-center gap-1.5 rounded text-sm font-medium transition-colors disabled:opacity-40',
        KIND[kind],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function ValueBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-raised rounded px-2 py-0.5 text-center font-mono text-sm', className)}>
      {children}
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-fg3 font-mono text-[10px] tracking-[0.08em] uppercase', className)}>
      {children}
    </div>
  )
}

/** Connection pill (green dot when connected). */
export function StatusPill({ connected, children }: { connected: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex h-7 items-center gap-2 rounded-full border px-3 font-mono text-xs tracking-wider',
        connected ? 'border-good/35 bg-good/10' : 'border-bad/35 bg-bad/10',
      )}
    >
      <span className={cn('size-2 rounded-full', connected ? 'bg-good' : 'bg-bad')} />
      {children}
    </div>
  )
}

/** Small stroke icons (Phosphor-like shapes, drawn inline to avoid an icon dependency). */
export function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-[18px]', className)}
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  )
}
const ICONS = {
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <path d="M10 5.5h4" />
    </>
  ),
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  caret: <path d="m7 10 5 5 5-5" />,
  check: <path d="m5 12 5 5 9-10" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  tape: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <circle cx="8" cy="11" r="2" />
      <circle cx="16" cy="11" r="2" />
      <path d="M8 13h8M7 19l1.5-3h7l1.5 3" />
    </>
  ),
  sliders: <path d="M4 7h10m4 0h2M4 17h4m4 0h8M16 5v4M10 15v4" />,
}
