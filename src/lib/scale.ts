import { FADER_MIN, GEQ_BANDS, type Eq } from './mixer'

/** Fader taper from Ron's channel strip design: dB -> position 0 (top, +10) … 1 (bottom, -60). */
const TAPER: [number, number][] = [
  [10, 0],
  [5, 0.11],
  [0, 0.21],
  [-5, 0.31],
  [-10, 0.41],
  [-20, 0.565],
  [-40, 0.78],
  [-60, 1],
]
export const SCALE_MARKS = TAPER.map(([db]) => db)

export function dbToPos(db: number): number {
  if (db >= TAPER[0][0]) return 0
  for (let i = 1; i < TAPER.length; i++) {
    const [d0, p0] = TAPER[i - 1]
    const [d1, p1] = TAPER[i]
    if (db >= d1) return p0 + ((d0 - db) / (d0 - d1)) * (p1 - p0)
  }
  return 1
}

/** Inverse of dbToPos, rounded to 0.5 dB so drags land on readable values. */
export function posToDb(pos: number): number {
  if (pos <= 0) return TAPER[0][0]
  for (let i = 1; i < TAPER.length; i++) {
    const [d0, p0] = TAPER[i - 1]
    const [d1, p1] = TAPER[i]
    if (pos <= p1) return Math.round((d0 - ((pos - p0) / (p1 - p0)) * (d0 - d1)) * 2) / 2
  }
  return FADER_MIN
}

/** "-8,0", "2,0", "-∞" (German decimal comma, like the designs). */
export function formatDb(db: number): string {
  return db <= FADER_MIN ? '-∞' : db.toFixed(1).replace('.', ',')
}

export function formatPan(pan: number): string {
  return pan === 0 ? 'C' : `${pan < 0 ? 'L' : 'R'}${Math.abs(pan)}`
}

export function formatTime(seconds: number): string {
  const p = (n: number) => String(Math.floor(n)).padStart(2, '0')
  return `${p(seconds / 3600)}:${p((seconds / 60) % 60)}:${p(seconds % 60)}`
}

/** Fixed corner frequencies of the L-20 channel EQ (only the mid band is sweepable). */
export const EQ_LOW_HZ = 100
export const EQ_HIGH_HZ = 10000
export const LOW_CUT_HZ = 75

/**
 * Approximate EQ response in dB at f Hz, for drawing only.
 * shortcut: textbook shelf/bell shapes, not the L-20's real filters; good enough for a picture.
 */
export function eqResponse(eq: Eq, f: number): number {
  if (!eq.on) return 0
  const oct = (a: number, b: number) => Math.log2(a / b)
  const shelf = (x: number) => 1 / (1 + Math.exp(-2.5 * x))
  let db = eq.low * shelf(-oct(f, EQ_LOW_HZ)) + eq.high * shelf(oct(f, EQ_HIGH_HZ))
  db += eq.midGain * Math.exp(-(oct(f, eq.midFreq) ** 2) / 0.5)
  // 12 dB/octave below the cut frequency
  if (eq.lowCut && f < LOW_CUT_HZ * 2) db -= 12 * Math.max(0, oct(LOW_CUT_HZ * 2, f)) ** 1.5
  return db
}

/**
 * Approximate graphic EQ response in dB at f Hz, for drawing only: one bell per band
 * (bands are 2/3 octave apart, so neighbours overlap a little).
 */
export function geqResponse(geq: number[], f: number): number {
  return GEQ_BANDS.reduce(
    (db, band, i) => db + geq[i] * Math.exp(-(Math.log2(f / band) ** 2) / 0.18),
    0,
  )
}
