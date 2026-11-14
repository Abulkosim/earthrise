// Written with AI assistance (Claude); see the README.
// Ribbon: the flight-plan time strip. One row per compared site, lanes for Sun, Earth and battery,
// a draggable stay bracket (landing date) and a playhead (current time).
import { memo, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { MousePointerClick, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SiteSeries, SiteSummary } from '../model/types'
import { DockInfoSlot } from './dockSlot'
import './Ribbon.css'

export interface RibbonRow {
  id: string; name: string; series: SiteSeries; summary?: SiteSummary
  /** per step: 1 when a landing at that time would meet the brief */
  windows?: Uint8Array
}

export interface RibbonProps {
  rows: RibbonRow[]
  t0: number
  hours: number
  epochMs: number
  now: number
  landing: number
  stayHours: number
  batteryWh: number
  selectedId?: string
  onNow(h: number): void
  onLanding(h: number): void
  onSelect?(id: string): void
  onRemove?(id: string): void
  onPan?(t0: number): void
  /** opens "Find a site", offered when no site is compared */
  onFind?(): void
}

// lane geometry, CSS pixels
const SUN_H = 9
const EARTH_H = 9
const BATT_H = 13
const LANE_GAP = 3
const WIN_H = 4
const WIN_Y = 0
const SUN_Y = WIN_H + LANE_GAP
const EARTH_Y = SUN_Y + SUN_H + LANE_GAP
const BATT_Y = EARTH_Y + EARTH_H + LANE_GAP
const LANES_H = BATT_Y + BATT_H

// axis geometry, must match Ribbon.css
const TICK_BASE = 36
const TICK_DAY = 33
const TICK_WEEK = 30
const TICK_MONTH = 17

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LABEL_STEPS = [1, 2, 5, 10, 15]

// rough text widths at --t-xs, for label collision and placement only
const dayLabelW = (s: string) => s.length * 5.6 + 2
const textW = (s: string) => s.length * 6.4 + 2

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const pad2 = (n: number) => String(n).padStart(2, '0')

function fmtDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function fmtDateTime(ms: number): string {
  const d = new Date(ms)
  return `${fmtDate(ms)} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

function fmtDuration(h: number): string {
  const r = Math.round(h)
  if (r < 48) return `${r} h`
  const d = Math.floor(r / 24)
  const rest = r % 24
  return rest ? `${d} d ${rest} h` : `${d} d`
}

const fmtPct = (f: number) => `${Math.round(f * 100)}%`
const fmtWh = (wh: number) => Math.round(wh).toLocaleString('en-US')

/* ---------- time axis ---------- */

interface AxisLabel { left: number; text: string; month: boolean }
interface Axis { day: string; week: string; month: string; labels: AxisLabel[] }

function buildAxis(t0: number, hours: number, epochMs: number, width: number): Axis {
  const out: Axis = { day: '', week: '', month: '', labels: [] }
  if (width <= 0 || hours <= 0) return out
  const startMs = epochMs + t0 * HOUR_MS
  const endMs = startMs + hours * HOUR_MS
  const pxPerDay = width / (hours / 24)
  const step = LABEL_STEPS.find((s) => s * pxPerDay >= 22) ?? 0
  const xOf = (ms: number) => ((ms - startMs) / (endMs - startMs)) * width

  const first = new Date(startMs)
  const months: AxisLabel[] = []
  const days: AxisLabel[] = []
  for (let ms = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()); ms <= endMs; ms += DAY_MS) {
    const raw = xOf(ms)
    if (raw < 0) continue
    const x = Math.round(raw) + 0.5
    const d = new Date(ms)
    const dom = d.getUTCDate()
    if (dom === 1) {
      out.month += `M${x} ${TICK_MONTH}V${TICK_BASE}`
      const m = d.getUTCMonth()
      const withYear = m === 0 || months.length === 0
      months.push({ left: x + 3, text: withYear ? `${MONTHS[m]} ${d.getUTCFullYear()}` : MONTHS[m], month: true })
    } else {
      if (d.getUTCDay() === 1) out.week += `M${x} ${TICK_WEEK}V${TICK_BASE}`
      else if (pxPerDay >= 4) out.day += `M${x} ${TICK_DAY}V${TICK_BASE}`
      if (step && dom % step === 0) days.push({ left: x + 3, text: String(dom), month: false })
    }
  }

  // the month in force at the left edge, when its own start is out of view
  const lead = `${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`
  if (first.getUTCDate() !== 1 && (months.length === 0 || months[0].left > textW(lead) + 10)) {
    if (months.length && months[0].text.includes(' ') && months[0].text.slice(0, 3) !== 'Jan') {
      months[0] = { ...months[0], text: months[0].text.slice(0, 3) }
    }
    months.unshift({ left: 0, text: lead, month: true })
  }

  const placed: [number, number][] = []
  const fits = (a: number, b: number) => b <= width && placed.every(([p, q]) => b + 6 <= p || a >= q + 6)
  for (const l of months) {
    const b = l.left + textW(l.text)
    if (b > width && l.left > 0) continue
    placed.push([l.left, b])
    out.labels.push(l)
  }
  for (const l of days) {
    const b = l.left + dayLabelW(l.text)
    if (!fits(l.left, b)) continue
    placed.push([l.left, b])
    out.labels.push(l)
  }
  return out
}

/* ---------- lanes canvas ---------- */

interface LanesProps {
  series: SiteSeries
  windows?: Uint8Array
  t0: number
  hours: number
  width: number
  landing: number
  stayHours: number
  batteryWh: number
}

type Run = [x0: number, x1: number, v: number]

/** Runs of equal per-column values. */
function runsOf(cols: number, value: (c: number) => number): Run[] {
  const out: Run[] = []
  let start = 0
  let cur = value(0)
  for (let c = 1; c <= cols; c++) {
    const v = c < cols ? value(c) : Number.NaN
    if (v !== cur) {
      out.push([start, c, cur])
      start = c
      cur = v
    }
  }
  return out
}

/**
 * Paint the non-zero runs of one lane. A stretch of light or contact gets round ends where it
 * begins and ends, not where it only changes strength or runs off the edge of the view.
 */
function paintRuns(ctx: CanvasRenderingContext2D, runs: Run[], cols: number, y: number, h: number, style: (v: number) => void) {
  runs.forEach(([x0, x1, v], i) => {
    if (!(v > 0)) return
    const l = x0 > 0 && (i === 0 || !(runs[i - 1][2] > 0))
    const r = x1 < cols && (i === runs.length - 1 || !(runs[i + 1][2] > 0))
    style(v)
    const rad = Math.min(h / 2, (x1 - x0) / 2)
    ctx.beginPath()
    if ((l || r) && ctx.roundRect) ctx.roundRect(x0, y, x1 - x0, h, [l ? rad : 0, r ? rad : 0, r ? rad : 0, l ? rad : 0])
    else ctx.rect(x0, y, x1 - x0, h)
    ctx.fill()
  })
}

function drawLanes(canvas: HTMLCanvasElement, o: LanesProps) {
  const dpr = window.devicePixelRatio || 1
  const W = Math.max(1, Math.round(o.width * dpr))
  const H = Math.round(LANES_H * dpr)
  if (canvas.width !== W) canvas.width = W
  if (canvas.height !== H) canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.clearRect(0, 0, W, H)

  const css = getComputedStyle(canvas)
  const colour = (name: string) => css.getPropertyValue(name).trim()
  const sun = colour('--sun')
  const sunDim = colour('--sun-dim')
  const earth = colour('--earth')
  const earthDim = colour('--earth-dim')
  const fail = colour('--fail')
  const track = colour('--lane-track') || 'rgba(255,255,255,0.04)'

  // empty lanes still read as lanes
  ctx.fillStyle = track
  for (const [y, h] of [[SUN_Y, SUN_H], [EARTH_Y, EARTH_H], [BATT_Y, BATT_H]]) {
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(0, y * dpr, W, h * dpr, Math.min(3, h / 2) * dpr)
    else ctx.rect(0, y * dpr, W, h * dpr)
    ctx.fill()
  }

  const s = o.series
  if (s.n === 0 || s.dt <= 0 || o.hours <= 0) return
  const hPerCol = o.hours / W
  const kAt = (t: number) => (t - s.t0) / s.dt

  // steps per device-pixel column: [lo, hi] inclusive, lo = -1 when the column has no data
  const lo = new Int32Array(W)
  const hi = new Int32Array(W)
  for (let c = 0; c < W; c++) {
    const ta = o.t0 + c * hPerCol
    const tb = ta + hPerCol
    let a = Math.ceil(kAt(ta))
    let b = Math.ceil(kAt(tb)) - 1
    if (b < a) a = b = Math.round(kAt(ta + hPerCol / 2)) // zoomed in: nearest step
    a = Math.max(a, 0)
    b = Math.min(b, s.n - 1)
    lo[c] = a <= b ? a : -1
    hi[c] = b
  }

  // Landing windows: times when a landing would meet the whole brief
  if (o.windows) {
    const win = o.windows
    const both = colour('--both')
    const runs = runsOf(W, (c) => {
      if (lo[c] < 0) return 0
      for (let k = lo[c]; k <= hi[c]; k++) if (win[k] === 1) return 1
      return 0
    })
    paintRuns(ctx, runs, W, WIN_Y * dpr, WIN_H * dpr, () => { ctx.fillStyle = both })
  }

  // Sun: opacity follows the mean visible fraction of the disk
  const sunRuns = runsOf(W, (c) => {
    if (lo[c] < 0) return 0
    let sum = 0
    for (let k = lo[c]; k <= hi[c]; k++) sum += s.sunFrac[k]
    return Math.round((sum / (hi[c] - lo[c] + 1)) * 48) / 48
  })
  paintRuns(ctx, sunRuns, W, SUN_Y * dpr, SUN_H * dpr, (a) => {
    ctx.fillStyle = sun
    ctx.globalAlpha = Math.min(1, a)
  })
  ctx.globalAlpha = 1

  // Earth: 2 contact (majority of steps), 1 in view without contact, 0 hidden
  const earthRuns = runsOf(W, (c) => {
    if (lo[c] < 0) return 0
    let comm = 0
    let clear = 0
    for (let k = lo[c]; k <= hi[c]; k++) {
      if (s.comm[k] === 1) comm++
      if (s.earthClear[k] > 0) clear++
    }
    const n = hi[c] - lo[c] + 1
    return comm * 2 >= n ? 2 : clear * 2 >= n ? 1 : 0
  })
  paintRuns(ctx, earthRuns, W, EARTH_Y * dpr, EARTH_H * dpr, (v) => { ctx.fillStyle = v === 2 ? earth : earthDim })

  // Battery: only within the stay, which is what the simulation covers
  if (o.batteryWh <= 0 || o.stayHours <= 0) return
  const yBatt = BATT_Y * dpr
  const hBatt = BATT_H * dpr
  const end = o.landing + o.stayHours
  const k0 = Math.max(0, Math.ceil(kAt(o.landing)))
  const k1 = Math.min(s.n - 1, Math.floor(kAt(end)))
  if (k1 < k0) return

  const tops: number[] = []
  let cFirst = -1
  for (let c = 0; c < W; c++) {
    const a = Math.max(lo[c], k0)
    const b = Math.min(hi[c], k1)
    if (lo[c] < 0 || a > b) {
      if (cFirst >= 0) break
      continue
    }
    if (cFirst < 0) cFirst = c
    let sum = 0
    for (let k = a; k <= b; k++) sum += s.battery[k]
    const f = clamp(sum / (b - a + 1) / o.batteryWh, 0, 1)
    tops.push(yBatt + hBatt - f * hBatt)
  }
  if (cFirst >= 0 && tops.length) {
    const yBase = yBatt + hBatt
    ctx.beginPath()
    ctx.moveTo(cFirst, yBase)
    tops.forEach((y, i) => {
      ctx.lineTo(cFirst + i, y)
      ctx.lineTo(cFirst + i + 1, y)
    })
    ctx.lineTo(cFirst + tops.length, yBase)
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, yBatt, 0, yBase)
    grad.addColorStop(0, sunDim)
    grad.addColorStop(1, 'rgba(138, 114, 64, 0.25)')
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.9
    ctx.fill()
    ctx.globalAlpha = 1

    ctx.beginPath()
    tops.forEach((y, i) => {
      const yy = Math.min(y, yBase - dpr) + dpr / 2
      if (i === 0) ctx.moveTo(cFirst, yy)
      else ctx.lineTo(cFirst + i, yy)
      ctx.lineTo(cFirst + i + 1, yy)
    })
    ctx.strokeStyle = sun
    ctx.lineWidth = 1.25 * dpr
    ctx.globalAlpha = 0.85
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // dead lander: hatch from the first empty step to the end of the stay
  let kDead = -1
  for (let k = k0; k <= k1; k++) {
    if (s.battery[k] <= 0) {
      kDead = k
      break
    }
  }
  if (kDead >= 0) {
    const xDead = Math.max(0, ((s.t0 + kDead * s.dt - o.t0) / o.hours) * W)
    const xEnd = Math.min(W, ((end - o.t0) / o.hours) * W)
    if (xEnd > xDead) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(xDead, yBatt, xEnd - xDead, hBatt)
      ctx.clip()
      ctx.beginPath()
      const gap = 5 * dpr
      for (let x = Math.floor((xDead - hBatt) / gap) * gap; x < xEnd; x += gap) {
        ctx.moveTo(x, yBatt + hBatt)
        ctx.lineTo(x + hBatt, yBatt)
      }
      ctx.strokeStyle = fail
      ctx.lineWidth = dpr
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.restore()
    }
  }
}

const Lanes = memo(function Lanes(p: LanesProps): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const { series, windows, t0, hours, width, landing, stayHours, batteryWh } = p
  useEffect(() => {
    const c = ref.current
    if (c && width > 0) drawLanes(c, { series, windows, t0, hours, width, landing, stayHours, batteryWh })
  }, [series, windows, t0, hours, width, landing, stayHours, batteryWh])
  return <canvas ref={ref} className="ribbon-canvas" style={{ width, height: LANES_H }} aria-hidden="true" />
})

/* ---------- readouts ---------- */

interface Reading { when: string; sun: string; sunOn: boolean; earth: string; earthOn: boolean; battery: string | null; empty: boolean }

function readout(row: RibbonRow, t: number, epochMs: number, landing: number, stayHours: number): Reading | null {
  const s = row.series
  if (s.n === 0 || s.dt <= 0) return null
  const kf = Math.round((t - s.t0) / s.dt)
  if (kf < 0 || kf >= s.n) return null
  const tk = s.t0 + kf * s.dt
  const f = s.sunFrac[kf]
  let battery: string | null = null
  let empty = false
  if (tk >= landing && tk <= landing + stayHours) {
    const b = s.battery[kf]
    empty = b <= 0
    battery = empty ? 'battery empty' : `battery ${fmtWh(b)} Wh`
  }
  return {
    when: fmtDateTime(epochMs + tk * HOUR_MS),
    sun: f < 0.005 ? 'Sun hidden' : `Sun ${Math.round(f * 100)}% visible`,
    sunOn: f >= 0.005,
    earth: s.comm[kf] === 1 ? 'Earth in contact' : s.earthClear[kf] > 0 ? 'Earth in view, no contact' : 'Earth hidden',
    earthOn: s.comm[kf] === 1,
    battery,
    empty,
  }
}

/** What the lanes mean, shown in the dock's transport row while nothing is hovered. */
function LaneLegend(): JSX.Element {
  return (
    <div className="lane-legend" aria-label="What the lanes show">
      <span><i className="swatch is-land" aria-hidden="true" />Landing window</span>
      <span><i className="swatch is-sun" aria-hidden="true" />Sun</span>
      <span><i className="swatch is-earth" aria-hidden="true" />Earth contact, in view</span>
      <span><i className="swatch is-battery" aria-hidden="true" />Battery</span>
    </div>
  )
}

function Readout({ name, r }: { name: string; r: Reading }): JSX.Element {
  return (
    <div className="lane-readout">
      <span className="place">{name}</span>
      <span className="when">{r.when}</span>
      <span className={r.sunOn ? 'part' : 'part is-off'}><i className={r.sunOn ? 'dot dot-sun' : 'dot'} aria-hidden="true" />{r.sun}</span>
      <span className={r.earthOn ? 'part' : 'part is-off'}><i className={r.earthOn ? 'dot dot-earth' : 'dot'} aria-hidden="true" />{r.earth}</span>
      {r.battery && <span className="part"><i className={r.empty ? 'dot dot-fail' : 'dot dot-sun'} aria-hidden="true" />{r.battery}</span>}
    </div>
  )
}

/** "Malapert Massif (Artemis III region)": the place in serif, the region in quiet sans. */
function SiteName({ name }: { name: string }): JSX.Element {
  const m = /^(.*?)\s*(\([^)]*\))$/.exec(name)
  if (!m) return <span className="ribbon-site-main place">{name}</span>
  return (
    <>
      <span className="ribbon-site-main place">{m[1]}</span> <span className="ribbon-region">{m[2]}</span>
    </>
  )
}

/* ---------- the ribbon ---------- */

type Drag =
  | { mode: 'scrub'; id: number }
  | { mode: 'stay'; id: number; x0: number; landing0: number }
  | { mode: 'pan'; id: number; x0: number; t00: number }

export function Ribbon(props: RibbonProps): JSX.Element {
  const { rows, t0, hours, epochMs, now, landing, stayHours, batteryWh, selectedId, onSelect, onRemove, onFind } = props
  const slot = useContext(DockInfoSlot)

  const axisRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const stayRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  const dragRef = useRef<Drag | null>(null)
  const touchesRef = useRef(new Map<number, number>())
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<{ id: string; t: number } | null>(null)
  // which edges of the scrolling rows have more rows behind them
  const [more, setMore] = useState({ up: false, down: false })

  useLayoutEffect(() => {
    propsRef.current = props
  })

  useLayoutEffect(() => {
    const el = axisRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const measureMore = () => {
    const el = rowsRef.current
    if (!el) return
    const up = el.scrollTop > 4
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 8
    setMore((m) => (m.up === up && m.down === down ? m : { up, down }))
  }
  useLayoutEffect(() => {
    const el = rowsRef.current
    if (!el) return
    const ro = new ResizeObserver(measureMore)
    ro.observe(el)
    for (const c of el.children) ro.observe(c)
    measureMore()
    return () => ro.disconnect()
  }, [rows.length])

  // shift+wheel or a horizontal two-finger swipe pans; a plain vertical wheel is left to the page
  useEffect(() => {
    const el = chartRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const p = propsRef.current
      const w = axisRef.current?.clientWidth ?? 0
      if (!p.onPan || w <= 0) return
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (!horizontal && !e.shiftKey) return
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? w : 1
      const px = (horizontal ? e.deltaX : e.deltaY) * unit
      if (px === 0) return
      e.preventDefault()
      p.onPan(p.t0 + (px / w) * p.hours)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const axis = useMemo(() => buildAxis(t0, hours, epochMs, width), [t0, hours, epochMs, width])

  const xOf = (h: number) => (hours > 0 ? ((h - t0) / hours) * width : 0)
  const hourMs = (h: number) => epochMs + h * HOUR_MS

  /* pointer handling: one set of move/up handlers on the axis for all three drags */

  const timeAt = (clientX: number) => {
    const p = propsRef.current
    const r = axisRef.current?.getBoundingClientRect()
    if (!r || r.width <= 0) return p.t0
    return p.t0 + ((clientX - r.left) / r.width) * p.hours
  }

  const scrubTo = (clientX: number) => {
    const p = propsRef.current
    const h = Math.round(clamp(timeAt(clientX), p.t0, p.t0 + p.hours))
    if (h !== p.now) p.onNow(h)
  }

  const touchX = () => {
    const xs = [...touchesRef.current.values()]
    return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  }

  const onAxisPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = propsRef.current
    if (e.pointerType === 'touch') touchesRef.current.set(e.pointerId, e.clientX)
    const twoFingers = e.pointerType === 'touch' && touchesRef.current.size >= 2
    if (e.button === 1 || twoFingers) {
      if (!p.onPan) return
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { mode: 'pan', id: e.pointerId, x0: twoFingers ? touchX() : e.clientX, t00: p.t0 }
      return
    }
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { mode: 'scrub', id: e.pointerId }
    handleRef.current?.focus({ preventScroll: true })
    scrubTo(e.clientX)
  }

  const onAxisPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' && touchesRef.current.has(e.pointerId)) touchesRef.current.set(e.pointerId, e.clientX)
    const d = dragRef.current
    if (!d) return
    const p = propsRef.current
    const w = axisRef.current?.clientWidth ?? 0
    if (d.mode === 'scrub') {
      if (e.pointerId === d.id) scrubTo(e.clientX)
    } else if (d.mode === 'stay') {
      if (e.pointerId !== d.id || w <= 0) return
      const h = Math.round(d.landing0 + ((e.clientX - d.x0) / w) * p.hours)
      if (h !== p.landing) p.onLanding(h)
    } else if (p.onPan && w > 0) {
      const x = e.pointerType === 'touch' ? touchX() : e.clientX
      p.onPan(d.t00 - ((x - d.x0) / w) * p.hours)
    }
  }

  const onAxisPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    touchesRef.current.delete(e.pointerId)
    const d = dragRef.current
    if (!d) return
    if (d.mode === 'pan' && e.pointerType === 'touch') dragRef.current = null
    else if (d.id === e.pointerId) dragRef.current = null
  }

  const onStayPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.pointerType === 'touch' && touchesRef.current.size > 0)) return // let the axis pan
    e.stopPropagation()
    if (e.pointerType === 'touch') touchesRef.current.set(e.pointerId, e.clientX)
    e.currentTarget.setPointerCapture(e.pointerId)
    stayRef.current?.focus({ preventScroll: true })
    dragRef.current = { mode: 'stay', id: e.pointerId, x0: e.clientX, landing0: propsRef.current.landing }
  }

  const arrowStep = (e: ReactKeyboardEvent, small: number): number => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return 0
    e.preventDefault()
    const step = e.shiftKey ? 24 : small
    return e.key === 'ArrowLeft' ? -step : step
  }

  const onHandleKey = (e: ReactKeyboardEvent) => {
    const d = arrowStep(e, 1)
    if (d) props.onNow(Math.round(now) + d)
  }

  const onStayKey = (e: ReactKeyboardEvent) => {
    const d = arrowStep(e, 6)
    if (d) props.onLanding(Math.round(landing) + d)
  }

  /* geometry for this render */

  const ready = width > 0
  const end = landing + stayHours
  const xL = xOf(landing)
  const xR = xOf(end)
  const stayLeft = clamp(xL, 0, width)
  const stayRight = clamp(xR, 0, width)
  const landingText = fmtDate(hourMs(landing))
  const landingLabelW = textW(`Landing ${landingText}`) + 6
  const endLabelW = textW('End of stay') + 6
  const landingOutside = stayLeft - landingLabelW >= 0
  const endOutside = stayRight + endLabelW <= width
  // where the two labels go: before, inside or after the bracket; "End of stay" is left out
  // when it would run into the landing date
  const stayW = stayRight - stayLeft
  const landingPos = landingOutside ? 'is-outside' : stayW >= landingLabelW + 12 ? 'is-inside' : 'is-after'
  const endPos = landingPos === 'is-after' ? null
    : endOutside ? 'is-outside'
    : stayW >= (landingPos === 'is-inside' ? landingLabelW : 0) + endLabelW + 16 ? 'is-inside' : null

  const xNow = Math.round(xOf(now))
  const nowInView = ready && xNow >= 0 && xNow <= width
  const xHandle = clamp(xNow, 0, Math.max(0, width - 1))
  const nowText = fmtDateTime(hourMs(now))
  const nowLabelLeft = xHandle + textW(nowText) + 18 <= width

  const hoverRow = hover ? rows.find((r) => r.id === hover.id) : undefined
  const reading = hover && hoverRow ? readout(hoverRow, hover.t, epochMs, landing, stayHours) : null
  const info = reading && hoverRow ? <Readout name={hoverRow.name} r={reading} /> : rows.length > 0 ? <LaneLegend /> : null

  const onLanesMove = (id: string) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width <= 0) return
    setHover({ id, t: t0 + ((e.clientX - r.left) / r.width) * hours })
  }

  return (
    <div className="ribbon">
      <div className="ribbon-chart" ref={chartRef}>
        <div className="ribbon-head">
          <div className="ribbon-utc">
            <span>UTC</span>
            <span className="ribbon-hint narrow">Drag to move the landing</span>
          </div>
          <div
            className="ribbon-axis"
            ref={axisRef}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={onAxisPointerDown}
            onPointerMove={onAxisPointerMove}
            onPointerUp={onAxisPointerEnd}
            onPointerCancel={onAxisPointerEnd}
          >
            {ready && (
              <>
                <svg className="ribbon-ticks" width={width} height={TICK_BASE} aria-hidden="true">
                  <path className="ribbon-tick-day" d={axis.day} />
                  <path className="ribbon-tick-week" d={axis.week} />
                  <path className="ribbon-tick-month" d={axis.month} />
                </svg>
                {axis.labels.map((l) => (
                  <span
                    key={`${l.left}-${l.text}`}
                    className={l.month ? 'ribbon-label is-month' : 'ribbon-label narrow'}
                    style={{ left: l.left }}
                    aria-hidden="true"
                  >
                    {l.text}
                  </span>
                ))}

                <div
                  ref={stayRef}
                  className="ribbon-stay"
                  style={{ left: stayLeft, width: stayRight - stayLeft }}
                  tabIndex={0}
                  role="slider"
                  aria-label="Landing date"
                  aria-valuemin={Math.round(t0)}
                  aria-valuemax={Math.round(t0 + hours)}
                  aria-valuenow={Math.round(landing)}
                  aria-valuetext={`Landing ${landingText}, end of stay ${fmtDate(hourMs(end))}`}
                  onPointerDown={onStayPointerDown}
                  onKeyDown={onStayKey}
                >
                  {xL >= 0 && xL <= width && <span className="ribbon-stay-cap is-start" />}
                  {xR >= 0 && xR <= width && <span className="ribbon-stay-cap is-end" />}
                  <span className={`ribbon-stay-label is-start ${landingPos}`}>
                    Landing <span className="ribbon-stay-date">{landingText}</span>
                  </span>
                  {endPos && (
                    <span className={`ribbon-stay-label is-end ${endPos}`}>
                      End of stay
                    </span>
                  )}
                </div>

                <div
                  ref={handleRef}
                  className={nowInView ? 'ribbon-handle' : 'ribbon-handle is-off'}
                  style={{ left: xHandle - 7 }}
                  tabIndex={0}
                  role="slider"
                  aria-label="Time"
                  aria-valuemin={Math.round(t0)}
                  aria-valuemax={Math.round(t0 + hours)}
                  aria-valuenow={Math.round(now)}
                  aria-valuetext={nowText}
                  onKeyDown={onHandleKey}
                />
                <span
                  className="ribbon-now"
                  style={nowLabelLeft ? { left: xHandle + 11 } : { right: width - xHandle + 10 }}
                  aria-hidden="true"
                >
                  {nowText}
                </span>
              </>
            )}
          </div>
        </div>

        <div
          className="ribbon-rows" ref={rowsRef} onScroll={measureMore}
          data-more-up={more.up} data-more-down={more.down}
        >
          {rows.length === 0 && (
            <div className="ribbon-empty">
              <span className="ribbon-empty-icon" aria-hidden="true"><MousePointerClick /></span>
              <div className="ribbon-empty-text">
                <p className="ribbon-empty-title">No sites on the timeline yet</p>
                <p>Click the map or pick a site to see its Sun, Earth and battery over time.</p>
              </div>
              {onFind && (
                <Button type="button" variant="secondary" size="sm" className="rounded-full" onClick={onFind}>
                  <Search aria-hidden="true" />
                  Find a site
                </Button>
              )}
            </div>
          )}
          {rows.map((row) => {
            const selected = row.id === selectedId
            const s = row.summary
            return (
              <div
                key={row.id}
                className={selected ? 'ribbon-row is-selected' : 'ribbon-row'}
                onClick={onSelect ? () => onSelect(row.id) : undefined}
              >
                <div className="ribbon-name">
                  <div className="ribbon-name-line">
                    {onSelect ? (
                      <button type="button" className="ribbon-site" aria-pressed={selected} title={row.name}>
                        <SiteName name={row.name} />
                      </button>
                    ) : (
                      <span className="ribbon-site" title={row.name}><SiteName name={row.name} /></span>
                    )}
                    {onRemove && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="ribbon-remove rounded-full"
                            aria-label={`Remove ${row.name}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              onRemove(row.id)
                            }}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Remove from the timeline</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {s && (
                    <div className="ribbon-summary narrow">
                      <span><i className="dot dot-sun" aria-hidden="true" />{fmtPct(s.lit)} sunlit</span>
                      <span><i className="dot" aria-hidden="true" />{fmtDuration(s.longestDarkH)} longest dark</span>
                      <span><i className="dot dot-earth" aria-hidden="true" />{fmtPct(s.comm)} contact</span>
                    </div>
                  )}
                  {s && !s.survives && (
                    <div className="ribbon-dies narrow"><i className="dot dot-fail" aria-hidden="true" />power runs out after {fmtDuration(s.hoursAlive)}</div>
                  )}
                </div>
                <div
                  className="ribbon-lanes"
                  onPointerMove={onLanesMove(row.id)}
                  onPointerLeave={() => setHover(null)}
                >
                  <div className="ribbon-lanes-inner" style={{ height: LANES_H }}>
                    {ready && (
                      <Lanes
                        series={row.series}
                        windows={row.windows}
                        t0={t0}
                        hours={hours}
                        width={width}
                        landing={landing}
                        stayHours={stayHours}
                        batteryWh={batteryWh}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="ribbon-overlay" aria-hidden="true" hidden={rows.length === 0}>
          {ready && stayRight > stayLeft && (
            <div className="ribbon-band" style={{ left: stayLeft, width: stayRight - stayLeft }} />
          )}
          {nowInView && <div className="ribbon-playline" style={{ left: xNow }} />}
        </div>
      </div>

      {slot ? createPortal(info, slot) : <div className="ribbon-readout">{info}</div>}
    </div>
  )
}
