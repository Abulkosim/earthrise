// App-level model: the mission brief, map layers and formatting.
// Written with AI assistance (Claude); see the README.
import { DEFAULT_MISSION, type Metric, type Mission } from './engine/engine'

export interface Needs {
  minLit: number      // share of the stay with sunlight, 0..1
  maxDarkH: number    // longest allowed stretch without Sun, hours
  minComm: number     // share of the stay with Earth contact, 0..1
  powerLasts: boolean // the battery must not run out during the stay
}

export interface Brief {
  landing: number // hours since the ephemeris epoch
  stayDays: number
  mission: Mission
  needs: Needs
}

/** Landing dates the ephemeris table can serve, with room for the timeline on both sides. */
export const LANDING_MIN_MS = Date.UTC(2023, 1, 1)
export const LANDING_MAX_MS = Date.UTC(2044, 8, 1)

export const DEFAULT_NEEDS: Needs = { minLit: 0.5, maxDarkH: 72, minComm: 0.3, powerLasts: true }

export function defaultBrief(epochMs: number): Brief {
  return {
    landing: (Date.UTC(2027, 10, 3, 0) - epochMs) / 3600e3,
    stayDays: 14,
    mission: { ...DEFAULT_MISSION, earthMargin: 1 },
    needs: { ...DEFAULT_NEEDS },
  }
}

export type LayerId = 'now' | 'lit' | 'longestDark' | 'comm' | 'longestCommGap' | 'hoursAlive' | 'needs'

export interface Layer {
  id: LayerId
  label: string
  explain: string
  hue: 'sun' | 'earth' | 'both'
  metric?: Metric
  /** values drawn darkest and brightest */
  range?: (b: Brief) => [number, number]
  legend?: (b: Brief) => [string, string]
}

export const LAYERS: Layer[] = [
  { id: 'now', label: 'Light at this moment', hue: 'sun',
    explain: 'The ground as the Sun lights it at the time on the playhead. Blue tint: the Earth is in view.' },
  { id: 'needs', label: 'Where the mission works', hue: 'both', metric: 'hoursAlive',
    explain: 'Bright ground meets every need in the brief for a landing on the chosen date.',
    range: (b) => [0, b.stayDays * 24], legend: () => ['fails the brief', 'meets it'] },
  { id: 'lit', label: 'Sunlight over the stay', hue: 'sun', metric: 'lit',
    explain: 'Average share of the Sun’s disk in view during the stay.',
    range: () => [0, 1], legend: () => ['0%', '100%'] },
  { id: 'longestDark', label: 'Longest dark stretch', hue: 'sun', metric: 'longestDark',
    explain: 'The longest run of hours without usable Sun during the stay. Brighter is shorter.',
    range: (b) => [b.stayDays * 24, 0], legend: (b) => [`${b.stayDays * 24} h`, '0 h'] },
  { id: 'comm', label: 'Contact with Earth', hue: 'earth', metric: 'comm',
    explain: 'Share of the stay when the Earth clears the terrain and a DSN station can see the Moon.',
    range: () => [0, 1], legend: () => ['0%', '100%'] },
  { id: 'longestCommGap', label: 'Longest silence', hue: 'earth', metric: 'longestCommGap',
    explain: 'The longest run of hours with no line to Earth. Brighter is shorter.',
    range: (b) => [b.stayDays * 24, 0], legend: (b) => [`${b.stayDays * 24} h`, '0 h'] },
  { id: 'hoursAlive', label: 'How long the power lasts', hue: 'both', metric: 'hoursAlive',
    explain: 'Hours from landing until the battery is empty, with the array and loads in the brief.',
    range: (b) => [0, b.stayDays * 24], legend: (b) => ['dies at landing', `lasts ${b.stayDays} d`] },
]

export const HUES: Record<Layer['hue'], [number, number, number]> = {
  sun: [0.953, 0.8, 0.455],
  earth: [0.498, 0.714, 0.918],
  both: [0.957, 0.945, 0.91],
}

export function needsVector(b: Brief): [number, number, number, number] {
  return [b.needs.minLit, b.needs.maxDarkH, b.needs.minComm, b.needs.powerLasts ? b.stayDays * 24 - 0.5 : 0]
}

// ---- formatting --------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const p2 = (n: number) => String(n).padStart(2, '0')

export function fmtDate(ms: number) {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
export function fmtDateTime(ms: number) {
  const d = new Date(ms)
  return `${fmtDate(ms)} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`
}
/** "3 d 4 h", "11 h", "40 min" */
export function fmtDur(hours: number) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  const h = Math.round(hours)
  return h >= 48 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h`
}
export function fmtLat(lat: number, digits = 2) { return `${Math.abs(lat).toFixed(digits)}°${lat < 0 ? 'S' : 'N'}` }
export function fmtLon(lon: number, digits = 2) { return `${(((lon % 360) + 360) % 360).toFixed(digits)}°E` }
export function fmtPct(f: number) { return `${Math.round(f * 100)}%` }
export function toInputDate(ms: number) {
  const d = new Date(ms)
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`
}
