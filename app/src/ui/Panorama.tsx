// Written with AI assistance (Claude); see the README.
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState,
  type JSX, type KeyboardEvent, type PointerEvent,
} from 'react'
import { horizonAt } from '../model/sitecalc'
import type { Horizon, SiteSeries } from '../model/types'
import './Panorama.css'

export interface PanoramaProps {
  horizon: Horizon            // terrain horizon, 720 azimuths, degrees
  series: SiteSeries | null   // Sun/Earth positions over time at this site (may be null while loading)
  k: number                   // current time as a (possibly fractional) step index into series
  stay?: [number, number]     // step range [k0, k1) of the mission stay; tracks inside it are emphasised
  height?: number             // CSS pixels, default 190
}

const EARTH_RADIUS = 0.95 // degrees, Earth's angular radius seen from the Moon
const SPAN_MIN = 40, SPAN_MAX = 360, SPAN_DEFAULT = 150
const GUTTER = 34  // left column for elevation labels
const BAND = 22    // bottom band for compass ticks
const TOP = 6
const SUN_MIN_PX = 4, EARTH_MIN_PX = 6

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const POINT_WORDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

const wrap360 = (a: number) => ((a % 360) + 360) % 360
const wrap180 = (a: number) => wrap360(a + 180) - 180
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const minus = (s: string) => s.replace('-', '−')
const deg1 = (v: number) => Math.abs(v).toFixed(1)
const signed1 = (v: number) => (v >= 0 ? '+' : '−') + deg1(v)

/** Linear interpolation of a series array at a fractional step. */
function at(a: Float32Array, k: number): number {
  const n = a.length
  const kk = clamp(k, 0, n - 1), i = Math.floor(kk), f = kk - i
  return i >= n - 1 ? a[n - 1] : a[i] * (1 - f) + a[i + 1] * f
}
/** Same for azimuths, across the 360 seam. */
function azAt(a: Float32Array, k: number): number {
  const n = a.length
  const kk = clamp(k, 0, n - 1), i = Math.floor(kk), f = kk - i
  return i >= n - 1 ? a[n - 1] : wrap360(a[i] + wrap180(a[i + 1] - a[i]) * f)
}

interface BodyNow {
  az: number
  el: number
  r: number        // true angular radius, degrees
  hidden: boolean  // whole disc below the terrain horizon
  words: string    // "1.2° above the ridge", without the body's name
}

function edgeWord(h: Horizon, hz: number): string {
  return h.terrain && hz > 0.5 ? 'ridge' : 'horizon'
}

function sunNow(s: SiteSeries, h: Horizon, k: number): BodyNow {
  const az = azAt(s.sunAz, k), el = at(s.sunEl, k), r = at(s.sunRadius, k), frac = at(s.sunFrac, k)
  const hz = horizonAt(h, az), d = el - hz, edge = edgeWord(h, hz)
  const pct = clamp(Math.round(frac * 100), 1, 99)
  const geomUp = d - r >= 0
  let words: string
  if (frac >= 0.995) words = `${deg1(d)}° ${d >= 0 ? 'above' : 'below'} the ${edge}`
  else if (frac <= 0.005) words = geomUp ? 'eclipsed by the Earth' : `${deg1(d)}° below the ${edge}`
  else words = geomUp ? `${pct}% visible, partly eclipsed by the Earth` : `partly behind the ${edge}, ${pct}% visible`
  return { az, el, r, hidden: d + r <= 0, words }
}

function earthNow(s: SiteSeries, h: Horizon, k: number): BodyNow {
  const az = azAt(s.earthAz, k), el = at(s.earthEl, k)
  const hz = horizonAt(h, az), c = el - hz, edge = edgeWord(h, hz), R = EARTH_RADIUS
  let words: string
  if (c >= R) words = `${deg1(c)}° clear`
  else if (c >= 0) words = `${deg1(c)}° clear, partly behind the ${edge}`
  else if (c > -R) words = `partly hidden, centre ${deg1(c)}° below the ${edge}`
  else words = `hidden, ${deg1(c)}° below the ${edge}`
  return { az, el, r: R, hidden: c + R <= 0, words }
}

function niceNumber(x: number): string {
  if (Math.abs(x - 1) < 0.05) return 'true to scale'
  return '×' + (x >= 10 ? String(Math.round(x)) : String(Math.round(x * 10) / 10))
}

interface Paint {
  w: number
  h: number
  horizon: Horizon
  series: SiteSeries | null
  sunClear: Float32Array | null
  seriesTop: number
  center: number
  span: number
  sun: BodyNow | null
  earth: BodyNow | null
  stay0: number | undefined
  stay1: number | undefined
}

interface Label { name: string; rest: string; color: string; x: number; y: number; wName: number; w: number }

function paint(canvas: HTMLCanvasElement, p: Paint): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const W = Math.round(p.w * dpr), H = Math.round(p.h * dpr)
  if (canvas.width !== W) canvas.width = W
  if (canvas.height !== H) canvas.height = H
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const cs = getComputedStyle(canvas)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  const col = {
    sky: v('--shadow') || '#000', ground: v('--ground-2'), rim: v('--ground-3'),
    d2: v('--dust-2'), d3: v('--dust-3'), sun: v('--sun'), earth: v('--earth'),
  }
  const family = getComputedStyle(document.body).fontFamily
  const font = (px: number) => `${px}px ${family}`

  ctx.fillStyle = col.sky
  ctx.fillRect(0, 0, p.w, p.h)

  const x0 = GUTTER, x1 = p.w, pw = x1 - x0, y0 = TOP, y1 = p.h - BAND, ph = y1 - y0
  if (pw < 20 || ph < 20) return
  const half = p.span / 2, a0 = p.center - half
  const pxd = pw / p.span
  const azToX = (az: number) => x0 + (wrap180(az - p.center) + half) * pxd

  // terrain profile across the window, one sample per CSS pixel
  const cols = Math.ceil(pw) + 1
  const prof = new Float32Array(cols)
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < cols; i++) {
    const e = horizonAt(p.horizon, a0 + (i / (cols - 1)) * p.span)
    prof[i] = e
    if (e < lo) lo = e
    if (e > hi) hi = e
  }
  const elMin = Math.floor((lo - 0.75) * 2) / 2
  const elMax = Math.max(elMin + 2, Math.min(30, Math.ceil((Math.max(p.seriesTop, hi, 6) + 0.75) * 2) / 2))
  const pyd = ph / (elMax - elMin)
  const elToY = (el: number) => y1 - (el - elMin) * pyd

  const ridge = new Path2D()
  for (let i = 0; i < cols; i++) {
    const x = x0 + (i / (cols - 1)) * pw, y = elToY(prof[i])
    if (i) ridge.lineTo(x, y)
    else ridge.moveTo(x, y)
  }
  const ground = new Path2D(ridge)
  ground.lineTo(x1, y1); ground.lineTo(x0, y1); ground.closePath()
  const sky = new Path2D(ridge)
  sky.lineTo(x1, 0); sky.lineTo(x0, 0); sky.closePath()

  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, 0, pw, p.h)
  ctx.clip()

  ctx.fillStyle = col.ground
  ctx.fill(ground)
  ctx.lineWidth = 1
  ctx.lineJoin = 'round'
  ctx.strokeStyle = col.rim
  ctx.stroke(ridge)

  // level line
  if (elMin < 0 && elMax > 0) {
    const y = Math.round(elToY(0)) + 0.5
    ctx.strokeStyle = col.d3
    ctx.globalAlpha = 0.55
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke()
    ctx.globalAlpha = 1
  }

  // tracks over the whole series
  const s = p.series
  if (s && p.sunClear && s.n > 1) {
    const styles = [
      { w: 1, a: 0.45, dash: false }, { w: 1, a: 0.22, dash: true },
      { w: 1.5, a: 0.85, dash: false }, { w: 1.5, a: 0.45, dash: true },
    ]
    const bodies = [
      { az: s.sunAz, el: s.sunEl, clear: p.sunClear, color: col.sun },
      { az: s.earthAz, el: s.earthEl, clear: s.earthClear, color: col.earth },
    ]
    for (const b of bodies) {
      const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()]
      const last = [-2, -2, -2, -2]
      let px = 0, py = 0, pdx = 0
      for (let k = 0; k < s.n; k++) {
        const dx = wrap180(b.az[k] - p.center)
        const x = x0 + (dx + half) * pxd, y = elToY(b.el[k])
        const offscreen = Math.abs(dx) > half + 2 && Math.abs(pdx) > half + 2
        if (k > 0 && Math.abs(dx - pdx) < 90 && !offscreen) {
          const below = b.clear[k - 1] + b.clear[k] < 0
          const inStay = p.stay0 !== undefined && p.stay1 !== undefined && k > p.stay0 && k <= p.stay1
          const key = (inStay ? 2 : 0) + (below ? 1 : 0)
          if (last[key] !== k - 1) paths[key].moveTo(px, py)
          paths[key].lineTo(x, y)
          last[key] = k
        }
        px = x; py = y; pdx = dx
      }
      ctx.strokeStyle = b.color
      for (let i = 0; i < 4; i++) {
        if (last[i] < 0) continue
        ctx.lineWidth = styles[i].w
        ctx.globalAlpha = styles[i].a
        ctx.setLineDash(styles[i].dash ? [3, 3] : [])
        ctx.stroke(paths[i])
      }
    }
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  // current discs, clipped to the sky so the terrain hides what is below it
  const labels: Label[] = []
  const placed = [
    { b: p.sun, name: 'Sun', color: col.sun, min: SUN_MIN_PX },
    { b: p.earth, name: 'Earth', color: col.earth, min: EARTH_MIN_PX },
  ]
  ctx.font = font(12)
  for (const { b, name, color, min } of placed) {
    if (!b) continue
    const rpx = Math.max(min, b.r * pyd)
    const dx = wrap180(b.az - p.center)
    const cx = azToX(b.az)
    const inView = Math.abs(dx) * pxd <= half * pxd + rpx
    const cy = b.hidden ? clamp(elToY(b.el), y0 + rpx, y1 - Math.min(rpx, 7) - 1) : elToY(b.el)
    if (inView) {
      // on a full circle the disc may straddle the seam
      const shifts = p.span >= 359.9 ? [-pw, 0, pw] : [0]
      for (const sh of shifts) {
        if (b.hidden) {
          ctx.strokeStyle = color
          ctx.lineWidth = 1.25
          ctx.beginPath(); ctx.arc(cx + sh, cy, Math.min(rpx, 7), 0, Math.PI * 2); ctx.stroke()
        } else {
          ctx.save()
          ctx.clip(sky)
          ctx.fillStyle = color
          ctx.beginPath(); ctx.arc(cx + sh, elToY(b.el), rpx, 0, Math.PI * 2); ctx.fill()
          ctx.restore()
        }
      }
    }
    const rest = inView ? b.words : `${b.words}, out of view to the ${dx > 0 ? 'right' : 'left'}`
    const wName = ctx.measureText(name + ' ').width
    const w = wName + ctx.measureText(rest).width
    let lx: number
    if (!inView) lx = dx > 0 ? x1 - 6 - w : x0 + 6
    else {
      lx = cx + rpx + 6
      if (lx + w > x1 - 6) lx = cx - rpx - 6 - w
      lx = clamp(lx, x0 + 4, Math.max(x0 + 4, x1 - 6 - w))
    }
    labels.push({ name, rest, color, x: lx, y: clamp(cy, y0 + 8, y1 - 8), wName, w })
  }
  if (labels.length === 2) {
    const [a, b] = labels
    const overlapX = a.x < b.x + b.w && b.x < a.x + a.w
    if (overlapX && Math.abs(a.y - b.y) < 15) {
      let ny = b.y >= a.y ? a.y + 15 : a.y - 15
      if (ny > y1 - 8 || ny < y0 + 8) ny = b.y >= a.y ? a.y - 15 : a.y + 15
      b.y = clamp(ny, y0 + 8, y1 - 8)
    }
  }
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  for (const l of labels) {
    ctx.fillStyle = l.color
    ctx.fillText(l.name, l.x, l.y)
    ctx.fillStyle = col.d2
    ctx.fillText(l.rest, l.x + l.wName, l.y)
  }

  // vertical exaggeration, stated plainly
  ctx.font = font(11)
  ctx.fillStyle = col.d3
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(`heights ${niceNumber(pyd / pxd)}`, x1 - 6, y0)

  // compass band
  ctx.fillStyle = col.sky
  ctx.fillRect(x0, y1, pw, p.h - y1)
  ctx.strokeStyle = col.rim
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x0, y1 + 0.5); ctx.lineTo(x1, y1 + 0.5); ctx.stroke()
  const steps: [number, number][] = [[5, 1], [10, 5], [15, 5], [30, 10], [45, 15], [90, 30]]
  const [major, minor] = steps.find(([st]) => st * pxd >= 44) ?? steps[steps.length - 1]
  const tick = minor * pxd >= 5 ? minor : major
  const end = a0 + p.span
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = col.d3
  ctx.beginPath()
  for (let a = Math.ceil(a0 / tick) * tick; p.span >= 360 ? a < end : a <= end; a += tick) {
    const x = Math.round(x0 + (a - a0) * pxd) + 0.5
    const az = Math.round(wrap360(a))
    const isMajor = az % major === 0
    ctx.moveTo(x, y1 + 1); ctx.lineTo(x, y1 + (isMajor ? 6 : 3))
    if (isMajor) {
      const point = az % 45 === 0
      ctx.fillStyle = point ? col.d2 : col.d3
      ctx.fillText(point ? POINTS[az / 45] : `${az}°`, x, y1 + 14)
    }
  }
  ctx.stroke()
  ctx.restore()

  // elevation ticks in the gutter
  const elStep = [0.5, 1, 2, 5, 10].find((st) => st * pyd >= 22) ?? 10
  ctx.font = font(11)
  ctx.fillStyle = col.d3
  ctx.strokeStyle = col.d3
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ctx.beginPath()
  for (let e = Math.ceil(elMin / elStep) * elStep; e <= elMax + 1e-9; e += elStep) {
    const y = Math.round(elToY(e)) + 0.5
    if (y < y0 + 4 || y > y1 - 2) continue
    ctx.moveTo(x0, y); ctx.lineTo(x0 + 4, y)
    const t = Number.isInteger(e) ? String(e) : e.toFixed(1)
    ctx.fillText(minus(t) + '°', x0 - 5, y)
  }
  ctx.stroke()
}

interface Gesture { x: number; c: number; s: number; dist: number; mid: number }

export function Panorama({ horizon, series, k, stay, height = 190 }: PanoramaProps): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const widthRef = useRef(0)
  const viewRef = useRef({ c: 180, s: SPAN_DEFAULT })
  const pointers = useRef(new Map<number, number>())
  const gesture = useRef<Gesture | null>(null)

  const [width, setWidth] = useState(0)
  const [view, setView] = useState<{ c: number | null; s: number }>({ c: null, s: SPAN_DEFAULT })
  const [hadData, setHadData] = useState(false)
  const [hoverAz, setHoverAz] = useState<number | null>(null)
  const [fontTick, setFontTick] = useState(0)

  const ok = series !== null && series.n > 0 ? series : null
  const sun = useMemo(() => (ok ? sunNow(ok, horizon, k) : null), [ok, horizon, k])
  const earth = useMemo(() => (ok ? earthNow(ok, horizon, k) : null), [ok, horizon, k])
  const sunClear = useMemo(() => {
    if (!ok) return null
    const c = new Float32Array(ok.n)
    for (let i = 0; i < ok.n; i++) c[i] = ok.sunEl[i] - horizonAt(horizon, ok.sunAz[i])
    return c
  }, [ok, horizon])
  const seriesTop = useMemo(() => {
    if (!ok) return -Infinity
    let top = -Infinity
    for (let i = 0; i < ok.n; i++) {
      top = Math.max(top, ok.sunEl[i] + ok.sunRadius[i], ok.earthEl[i] + EARTH_RADIUS)
    }
    return top
  }, [ok])

  // face the Sun the first time data arrives (and again after each reload)
  if ((ok !== null) !== hadData) {
    setHadData(ok !== null)
    if (sun) setView((v) => ({ ...v, c: sun.az }))
  }
  const center = view.c ?? sun?.az ?? 180
  const span = view.s

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      widthRef.current = w
      setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let live = true
    void document.fonts.ready.then(() => { if (live) setFontTick((t) => t + 1) })
    return () => { live = false }
  }, [])

  const stay0 = stay?.[0], stay1 = stay?.[1]
  useLayoutEffect(() => {
    viewRef.current = { c: center, s: span }
    const c = canvasRef.current
    if (!c || width <= 0) return
    paint(c, { w: width, h: height, horizon, series: ok, sunClear, seriesTop, center, span, sun, earth, stay0, stay1 })
  }, [width, height, horizon, ok, sunClear, seriesTop, center, span, sun, earth, stay0, stay1, fontTick])

  // wheel needs a non-passive listener to keep the page from scrolling while zooming
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const onWheel = (e: WheelEvent) => {
      const pw = widthRef.current - GUTTER
      if (pw <= 0) return
      const { c: vc, s } = viewRef.current
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault()
        setView({ c: wrap360(vc + (e.deltaX * s) / pw), s })
        return
      }
      const ns = clamp(s * Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), SPAN_MIN, SPAN_MAX)
      if (ns === s) return // at a limit: let the page scroll
      e.preventDefault()
      const fx = clamp((e.clientX - c.getBoundingClientRect().left - GUTTER) / pw, 0, 1) - 0.5
      const azUnder = vc + fx * s
      setView({ c: wrap360(azUnder - fx * ns), s: ns })
    }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  const localX = (clientX: number) => clientX - (canvasRef.current?.getBoundingClientRect().left ?? 0)

  const startGesture = () => {
    const xs = [...pointers.current.values()]
    const { c, s } = viewRef.current
    if (xs.length === 0) gesture.current = null
    else if (xs.length === 1) gesture.current = { x: xs[0], c, s, dist: 0, mid: xs[0] }
    else gesture.current = { x: xs[0], c, s, dist: Math.abs(xs[0] - xs[1]), mid: (xs[0] + xs[1]) / 2 }
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, localX(e.clientX))
    startGesture()
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const x = localX(e.clientX)
    const pw = widthRef.current - GUTTER
    if (pw <= 0) return
    const g = gesture.current
    if (g && pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, x)
      const xs = [...pointers.current.values()]
      if (xs.length === 1) {
        setView({ c: wrap360(g.c - ((xs[0] - g.x) * g.s) / pw), s: g.s })
      } else if (xs.length >= 2 && g.dist > 0) {
        const dist = Math.max(10, Math.abs(xs[0] - xs[1])), mid = (xs[0] + xs[1]) / 2
        const ns = clamp((g.s * g.dist) / dist, SPAN_MIN, SPAN_MAX)
        const f0 = (g.mid - GUTTER) / pw - 0.5, f1 = (mid - GUTTER) / pw - 0.5
        setView({ c: wrap360(g.c + f0 * g.s - f1 * ns), s: ns })
      }
    }
    const { c, s } = viewRef.current
    setHoverAz(x >= GUTTER ? wrap360(c + ((x - GUTTER) / pw - 0.5) * s) : null)
  }

  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId)
    startGesture()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const { c, s } = viewRef.current
    const turn = (e.shiftKey ? 1 / 3 : 1 / 12) * s
    if (e.key === 'ArrowLeft') setView({ c: wrap360(c - turn), s })
    else if (e.key === 'ArrowRight') setView({ c: wrap360(c + turn), s })
    else if (e.key === '+' || e.key === '=') setView({ c, s: clamp(s / 1.25, SPAN_MIN, SPAN_MAX) })
    else if (e.key === '-') setView({ c, s: clamp(s * 1.25, SPAN_MIN, SPAN_MAX) })
    else return
    e.preventDefault()
  }

  const face = (az: number) => setView((v) => ({ ...v, c: az }))

  const facing = POINT_WORDS[Math.round(wrap360(center) / 45) % 8]
  const aria = [
    `Horizon panorama facing ${facing}, azimuth ${Math.round(wrap360(center)) % 360}°, ${Math.round(span)}° wide.`,
    sun ? `Sun ${sun.words}, azimuth ${Math.round(sun.az) % 360}°.` : 'No Sun or Earth positions yet.',
    earth ? `Earth ${earth.words}, azimuth ${Math.round(earth.az) % 360}°.` : '',
    'Left and right arrow keys rotate the view.',
  ].filter(Boolean).join(' ')

  let readout = 'Drag to turn, scroll to zoom'
  if (hoverAz !== null) {
    const hz = horizonAt(horizon, hoverAz)
    readout = `Azimuth ${Math.round(hoverAz) % 360}°, ${horizon.terrain ? 'terrain horizon' : 'horizon'} ${signed1(hz)}°`
  }

  return (
    <div className="panorama" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="panorama-canvas"
        style={{ height }}
        role="img"
        tabIndex={0}
        aria-label={aria}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerLeave={() => setHoverAz(null)}
        onKeyDown={onKeyDown}
      />
      <div className="panorama-foot">
        <span className={hoverAz === null ? 'panorama-readout is-hint' : 'panorama-readout'}>{readout}</span>
        <span className="panorama-face">
          <button type="button" className="is-sun" disabled={!sun} onClick={() => sun && face(sun.az)}>
            Face the Sun
          </button>
          <button type="button" className="is-earth" disabled={!earth} onClick={() => earth && face(earth.az)}>
            Face the Earth
          </button>
        </span>
      </div>
      {!horizon.terrain && (
        <p className="panorama-note">No elevation data here. The horizon is that of a smooth sphere.</p>
      )}
    </div>
  )
}
