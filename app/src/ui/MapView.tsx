// The map: a WebGL canvas driven by the field engine, with a chart overlay (graticule, names, sites).
// Written with AI assistance (Claude); see the README.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DataStore } from '../engine/data'
import { R_MOON } from '../engine/data'
import { Engine, type Metric } from '../engine/engine'
import { ll2xy, xy2ll } from '../model/sitecalc'
import type { Site } from '../model/types'
import { HUES, LAYERS, fmtLat, fmtLon, fmtPct, needsVector, type Brief, type LayerId } from '../state'
import { useChromeInsets } from './chrome'
import './MapView.css'

export interface MapViewState { cx: number; cy: number; mpp: number } // centre in map metres, metres per CSS pixel
export interface Feature { name: string; lat: number; lon: number; km: number; type: string }
export interface MapStatus { phase: 'idle' | 'loading' | 'horizons' | 'mission'; progress: number; bakeMs: number; evalMs: number; pixels: number; pass: number | null }

interface Props {
  data: DataStore
  view: MapViewState
  onView(v: MapViewState): void
  now: number
  brief: Brief
  layer: LayerId
  sites: Site[]          // markers to draw
  selected: Site | null
  compared: string[]
  features: Feature[]
  onPick(lat: number, lon: number, site?: Site): void
  onStatus(s: MapStatus): void
  onEngine?(e: Engine): void
  span: { t0: number; hours: number }   // the timeline's span, for the landing calendar
  onCalendar?(c: { t0: number; stepH: number; share: Float32Array; done: number } | null): void
}

const MIN_MPP = 6, MAX_MPP = 900
const MAX_R = 850e3 // the view centre stays inside the elevation data (60 S is 931 km from the pole)
function clampView(v: MapViewState): MapViewState {
  const r = Math.hypot(v.cx, v.cy)
  return r > MAX_R ? { ...v, cx: (v.cx * MAX_R) / r, cy: (v.cy * MAX_R) / r } : v
}
// Points in the field. Starts at about a quarter of a million and shrinks on GPUs that take too long.
let fieldBudget = window.matchMedia('(pointer: coarse)').matches ? 65536 : 262144 // phones start smaller

export function MapView(p: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const eng = useRef<Engine | null>(null)
  const [size, setSize] = useState<[number, number]>([0, 0])
  const [error, setError] = useState<string | null>(null)
  const [hover, setHover] = useState<{ lat: number; lon: number; text: string; px: number; py: number } | null>(null)
  const live = useRef(p)
  live.current = p
  const dirty = useRef(false)
  const moving = useRef(0)
  const ticking = useRef(0)      // when the time last changed: tells playback and scrubbing from rest
  const lastCoarse = useRef(0)
  const gpuBusy = useRef(false)
  const again = useRef(false)
  const requestFrameRef = useRef<() => void>(() => {})
  const settleTimer = useRef(0)
  const settleId = useRef(0)
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  // ---- drawing ----------------------------------------------------------
  const frame = useCallback(() => {
    dirty.current = false
    const e = eng.current, q = live.current
    if (!e || !canvas.current || canvas.current.width < 8) return
    e.setView(q.view.cx, q.view.cy, q.view.mpp / dpr)
    const layer = LAYERS.find((l) => l.id === q.layer)!
    if (layer.id === 'now' || !e.metricRect || (layer.slot === 2 && !e.psrDist)) {
      // Walking the terrain for every screen pixel is the costly way to get this picture. It is done
      // once the view and the time are at rest. While time runs, the light comes from the cached
      // horizons (one lookup per pixel). While the map moves, the last picture is reused and only
      // refreshed coarsely a few times a second. And nothing new is issued before the GPU is done
      // with the last frame, or the whole machine starts to stutter.
      const t = performance.now(), mast = q.brief.mission.mast
      const isMoving = t - moving.current < 200, isPlaying = t - ticking.current < 250
      if (gpuBusy.current) { again.current = true }
      else {
        let heavy = false
        if (isMoving) {
          if (t - lastCoarse.current > 180) { e.renderNow(q.now, mast, 0.25); lastCoarse.current = t; heavy = true }
        } else if (isPlaying) {
          if (!e.renderNowFast(q.now, mast)) { e.renderNow(q.now, mast, 0.25); heavy = true }
        } else {
          // at rest: sharp, but never more than about 1.6 million walked pixels
          const c = canvas.current
          e.renderNow(q.now, mast, Math.min(1, Math.sqrt(1.6e6 / (c.width * c.height))))
          heavy = true
        }
        if (heavy) {
          gpuBusy.current = true
          void e.idle().then(() => { gpuBusy.current = false; if (again.current) { again.current = false; requestFrameRef.current() } })
        }
      }
      e.draw({ mode: 'now', hours: q.now })
    } else {
      // the long-run layers show their own numbers; the brief's needs dim only the stay layers
      e.draw({
        mode: layer.id === 'needs' ? 'needs' : 'metric', hours: q.now, metric: layer.metric as Metric, slot: layer.slot ?? 0,
        range: layer.range!(q.brief), hue: HUES[layer.hue],
        needs: layer.slot ? [0, 1e9, 0, 0] : needsVector(q.brief), maxPsrM: layer.slot ? 0 : q.brief.needs.psrKm * 1000,
      })
    }
  }, [dpr])
  const requestFrame = useCallback(() => {
    if (dirty.current) return
    dirty.current = true
    requestAnimationFrame(frame)
  }, [frame])
  requestFrameRef.current = requestFrame

  const status = useCallback((phase: MapStatus['phase'], progress = 0) => {
    const e = eng.current
    live.current.onStatus({
      phase, progress, bakeMs: e?.stats.bakeMs ?? 0, evalMs: e?.stats.evalMs ?? 0,
      pixels: e ? e.fieldPx[0] * e.fieldPx[1] : 0,
      pass: e && phase === 'idle' && e.metricRect ? e.passShare(needsVector(live.current.brief), 0, live.current.brief.needs.psrKm * 1000) : null,
    })
  }, [])

  // The landing calendar: the same stay, started on each day of the timeline, for every pixel.
  // It runs in the background in its own result slot and picks up where it left off when interrupted.
  const cal = useRef<{ key: string; share: Float32Array; next: number; t0: number } | null>(null)
  const sweep = useCallback(async () => {
    const e = eng.current, q = live.current
    if (!e || !e.baked || !e.field || !q.onCalendar) return
    const stepH = 24, days = Math.floor(q.span.hours / stepH)
    const f = e.field
    const key = JSON.stringify([f.x, f.y, f.w, f.h, q.span.t0, days, q.brief.stayDays, q.brief.mission, q.brief.needs])
    if (cal.current?.key !== key) {
      cal.current = { key, share: new Float32Array(days).fill(NaN), next: 0, t0: q.span.t0 }
      q.onCalendar({ t0: q.span.t0, stepH, share: cal.current.share.slice(), done: 0 })
    }
    const c = cal.current
    const steps = Math.ceil((q.brief.stayDays * 24) / 2)
    while (c.next < days) {
      const ok = await e.evaluate(c.t0 + c.next * stepH, steps, 2, q.brief.mission, undefined, 1)
      if (!ok || cal.current !== c) return
      c.share[c.next++] = e.passShare(needsVector(q.brief), 1, q.brief.needs.psrKm * 1000)
      if (c.next % 4 === 0 || c.next === days) live.current.onCalendar?.({ t0: c.t0, stepH, share: c.share.slice(), done: c.next })
    }
  }, [])

  const evaluate = useCallback(async () => {
    const e = eng.current, q = live.current
    if (!e || !e.baked) return
    status('mission', 0)
    const steps = Math.round(q.brief.stayDays * 24)
    const ok = await e.evaluate(q.brief.landing, steps, 1, q.brief.mission)
    if (!ok) return
    status('idle', 1); requestFrame()
    // once per bake: the 18.6-year run, for average sunlight and permanent shadow
    if (!e.psrDist) {
      if (!(await e.climate(q.brief.mission.mast))) return
      status('idle', 1); requestFrame()
    }
    void sweep()
  }, [requestFrame, status, sweep])

  // Once the view rests: load the fine tiles, bake the horizons, run the mission.
  const settle = useCallback(async () => {
    const e = eng.current
    if (!e) return
    const id = ++settleId.current
    const q = live.current
    cal.current = null
    q.onCalendar?.(null)
    e.setView(q.view.cx, q.view.cy, q.view.mpp / dpr)
    status('loading', 0)
    await e.loadFocus()
    if (id !== settleId.current) return
    requestFrame()
    status('horizons', 0)
    // A few percent in, the time for the whole bake is known. If this machine would need more than
    // 15 seconds, start again with as many points as it can do in about 8.
    const t0 = performance.now()
    let restart = false
    const ok = await e.bake(q.brief.mission.mast, -fieldBudget, (f) => {
      if (id !== settleId.current || restart) return
      status('horizons', f)
      const est = (performance.now() - t0) / f
      if (f >= 0.03 && f < 0.3 && est > 15000 && fieldBudget > 16384) {
        fieldBudget = Math.max(16384, Math.floor((fieldBudget * 8000) / est / 4096) * 4096)
        restart = true
        queueMicrotask(() => { void settle() })
      }
    })
    if (!ok || restart || id !== settleId.current) return
    if (e.stats.bakeMs < 2500 && fieldBudget < 262144) fieldBudget = Math.min(262144, fieldBudget * 2)
    await evaluate()
  }, [dpr, evaluate, requestFrame, status])
  const scheduleSettle = useCallback(() => {
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(settle, 380)
  }, [settle])

  // ---- engine lifecycle -------------------------------------------------
  useEffect(() => {
    if (!canvas.current || eng.current) return
    try {
      eng.current = new Engine(canvas.current, p.data)
      eng.current.onLost = () => setError('The graphics context was lost. Reload the page.')
      p.onEngine?.(eng.current)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(() => setSize([el.clientWidth, el.clientHeight]))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = canvas.current
    if (!c || size[0] < 8) return
    c.width = Math.round(size[0] * dpr)
    c.height = Math.round(size[1] * dpr)
    requestFrame()
    scheduleSettle()
  }, [size, dpr, requestFrame, scheduleSettle])

  const { cx, cy, mpp } = p.view
  useEffect(() => { moving.current = performance.now(); requestFrame(); scheduleSettle() }, [cx, cy, mpp, requestFrame, scheduleSettle])
  useEffect(() => { ticking.current = performance.now() }, [p.now])
  useEffect(() => {
    requestFrame()
    // a second pass at full sharpness once playback or scrubbing stops
    const t = window.setTimeout(requestFrame, 300)
    return () => window.clearTimeout(t)
  }, [p.now, p.layer, requestFrame])
  useEffect(() => { requestFrame(); if (eng.current?.metricRect) { status('idle', 1); void sweep() } }, [p.brief.needs, p.span.t0, requestFrame, status, sweep])
  const m = p.brief.mission
  useEffect(() => { scheduleSettle() }, [m.mast, scheduleSettle])
  useEffect(() => { void evaluate() }, [p.brief.landing, p.brief.stayDays, m.litMin, m.earthMargin, m.needDsn, m.arrayW, m.loadLitW, m.loadDarkW, m.batteryWh, m.startWh, evaluate])

  // ---- pointer ----------------------------------------------------------
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)
  const toMap = (px: number, py: number): [number, number] => [cx + (px - size[0] / 2) * mpp, cy - (py - size[1] / 2) * mpp]
  const local = (ev: { clientX: number; clientY: number }): [number, number] => {
    const r = wrap.current!.getBoundingClientRect()
    return [ev.clientX - r.left, ev.clientY - r.top]
  }
  const onDown = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    drag.current = { x: ev.clientX, y: ev.clientY, cx, cy, moved: false }
  }
  const onMove = (ev: React.PointerEvent) => {
    const d = drag.current
    if (d) {
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
      if (d.moved) {
        if (hover) setHover(null) // the readout would point at ground that has moved away
        p.onView(clampView({ cx: d.cx - dx * mpp, cy: d.cy + dy * mpp, mpp }))
      }
      return
    }
    const [px, py] = local(ev)
    const [x, y] = toMap(px, py)
    const [lat, lon] = xy2ll(x, y)
    let text = ''
    const e = eng.current
    if (e && p.layer !== 'now') {
      const mt = e.readMetrics(x, y)
      if (mt) text = `${Number.isFinite(mt.psrDistance) ? (mt.psrDistance <= 0 ? 'permanent shadow, ' : `permanent shadow ${(mt.psrDistance / 1000).toFixed(1)} km away, `) : ''}${fmtPct(mt.lit)} sunlit, longest dark ${Math.round(mt.longestDark)} h, ${fmtPct(mt.comm)} contact, power ${mt.hoursAlive >= p.brief.stayDays * 24 - 0.5 ? 'lasts' : `out after ${Math.round(mt.hoursAlive)} h`}`
    }
    setHover({ lat, lon, text, px, py })
  }
  const onUp = (ev: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved) return
    const [px, py] = local(ev)
    const [x, y] = toMap(px, py)
    const [lat, lon] = xy2ll(x, y)
    p.onPick(lat, lon)
  }
  useEffect(() => {
    const el = wrap.current!
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      const q = live.current.view
      const r = el.getBoundingClientRect()
      const px = ev.clientX - r.left, py = ev.clientY - r.top
      const k = Math.exp(ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0016))
      const nm = Math.min(MAX_MPP, Math.max(MIN_MPP, q.mpp * k))
      // keep the point under the cursor fixed
      const x = q.cx + (px - r.width / 2) * q.mpp, y = q.cy - (py - r.height / 2) * q.mpp
      live.current.onView(clampView({ cx: x - (px - r.width / 2) * nm, cy: y + (py - r.height / 2) * nm, mpp: nm }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  const onKey = (ev: React.KeyboardEvent) => {
    const step = 60 * mpp
    const k: Record<string, MapViewState> = {
      ArrowLeft: { cx: cx - step, cy, mpp }, ArrowRight: { cx: cx + step, cy, mpp },
      ArrowUp: { cx, cy: cy + step, mpp }, ArrowDown: { cx, cy: cy - step, mpp },
      '+': { cx, cy, mpp: Math.max(MIN_MPP, mpp / 1.3) }, '=': { cx, cy, mpp: Math.max(MIN_MPP, mpp / 1.3) },
      '-': { cx, cy, mpp: Math.min(MAX_MPP, mpp * 1.3) },
    }
    if (k[ev.key]) { ev.preventDefault(); p.onView(clampView(k[ev.key])) }
  }

  // ---- chart overlay ----------------------------------------------------
  const [W, H] = size
  const sx = (x: number) => (x - cx) / mpp + W / 2
  const sy = (y: number) => H / 2 - (y - cy) / mpp
  const overlay = useMemo(() => {
    if (W < 8) return null
    const viewKm = (W * mpp) / 1000
    const latStep = viewKm < 25 ? 0.1 : viewKm < 70 ? 0.25 : viewKm < 160 ? 0.5 : viewKm < 400 ? 1 : viewKm < 900 ? 2 : 5
    const lonStep = viewKm < 60 ? 10 : 30
    const far = Math.hypot(Math.abs(cx) + (W / 2) * mpp, Math.abs(cy) + (H / 2) * mpp)
    const near = Math.max(0, Math.hypot(cx, cy) - Math.hypot(W, H) * mpp * 0.5)
    const rOf = (lat: number) => 2 * R_MOON * Math.tan(((90 + lat) * Math.PI) / 360)
    const circles: { lat: number; r: number }[] = []
    for (let lat = -90 + latStep; lat <= -60 + 1e-9 && circles.length < 60; lat += latStep) {
      const r = rOf(lat)
      if (r > far) break
      if (r >= near) circles.push({ lat, r })
    }
    const spokes: number[] = []
    for (let lon = 0; lon < 360; lon += lonStep) spokes.push(lon)
    // names: the largest features whose centre is in view, sized so they do not crowd
    const minKm = viewKm / 14
    const names = p.features.filter((f) => f.km >= minKm && f.km < viewKm * 1.4).map((f) => {
      const [x, y] = ll2xy(f.lat, f.lon)
      return { f, px: sx(x), py: sy(y) }
    }).filter((n) => n.px > 20 && n.px < W - 20 && n.py > 14 && n.py < H - 14).slice(0, 26)
    return { circles, spokes, names, latStep, far }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H, cx, cy, mpp, p.features])

  // The part of the map that no panel covers: the chrome (Sun and Earth marks, hover readout) stays inside it.
  const insets = useChromeInsets()
  const free = (() => {
    // the bottom 40 px of it hold the scale and the status pill
    const f = { l: insets.left, r: W - insets.right, t: insets.top, b: H - insets.bottom - 40 }
    return f.r - f.l > 200 && f.b - f.t > 160 ? f : { l: 0, r: W, t: 0, b: H - 40 }
  })()
  const freeX = (free.l + free.r) / 2, freeY = (free.t + free.b) / 2

  // direction of the Sun and the Earth across the map, from the ephemeris
  const se = p.data.sample(p.now)
  const edge = (vx: number, vy: number) => {
    const n = Math.hypot(vx, vy) || 1
    const ux = vx / n, uy = vy / n
    const t = Math.min(((free.r - free.l) / 2 - 26) / Math.abs(ux || 1e-9), ((free.b - free.t) / 2 - 26) / Math.abs(uy || 1e-9))
    const x = freeX + ux * t
    let y = freeY - uy * t
    // the legend chip and the map note sit over the top centre of the free map: stay under them
    // (under 1100 px they lie on the map itself and the chip takes two lines)
    const stackHalf = Math.min(350, (free.r - free.l) / 2) + 16
    const stackH = (insets.top > 0 ? 76 : 100) + (p.layer === 'now' ? 0 : 44)
    if (Math.abs(x - freeX) < stackHalf) y = Math.max(y, Math.min(freeY, free.t + stackH))
    return { x, y, side: x > freeX ? 'left' : 'right' }
  }
  const sunEdge = edge(se[1], se[0])
  const earthEdge = edge(se[5], se[4])

  // names of the sites that carry one (selected, compared, or all of them when zoomed in), as pills over the chart
  const labels: { id: string; name: string; px: number; py: number; sel: boolean }[] = []
  let selMark: { px: number; py: number } | null = null
  let customSel: { px: number; py: number } | null = null
  if (W >= 8) {
    for (const s of p.sites) {
      const [x, y] = ll2xy(s.lat, s.lon)
      const px = sx(x), py = sy(y)
      if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue
      const sel = p.selected?.id === s.id
      if (sel) selMark = { px, py }
      if (sel || p.compared.includes(s.id) || mpp < 22) labels.push({ id: s.id, name: s.name, px, py, sel })
    }
    if (p.selected && !p.sites.some((s) => s.id === p.selected!.id)) {
      const [x, y] = ll2xy(p.selected.lat, p.selected.lon)
      customSel = { px: sx(x), py: sy(y) }
      selMark = customSel
      labels.push({ id: p.selected.id, name: p.selected.name, px: customSel.px, py: customSel.py, sel: true })
    }
  }

  const scaleKm = (() => {
    const target = (140 * mpp) / 1000
    const pow = Math.pow(10, Math.floor(Math.log10(target)))
    const n = target / pow >= 5 ? 5 : target / pow >= 2 ? 2 : 1
    return n * pow
  })()

  return (
    <div className="map" ref={wrap} tabIndex={0} onKeyDown={onKey} aria-label="Map of the lunar south pole. Arrow keys pan, plus and minus zoom."
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => setHover(null)}>
      <canvas ref={canvas} />
      {error && <p className="map-error">{error.includes('lost') ? error : `The map needs WebGL 2 with float textures. ${error}`}</p>}
      {overlay && (
        <svg className="map-chart" width={W} height={H} aria-hidden="true">
          <g className="graticule">
            {overlay.circles.map((c) => <circle key={c.lat.toFixed(2)} cx={sx(0)} cy={sy(0)} r={c.r / mpp} />)}
            {overlay.spokes.map((lon) => {
              const a = (lon * Math.PI) / 180, r = overlay.far
              return <line key={lon} x1={sx(0)} y1={sy(0)} x2={sx(r * Math.sin(a))} y2={sy(r * Math.cos(a))} />
            })}
          </g>
          <g className="graticule-text narrow">
            {overlay.circles.map((c) => {
              // label each parallel where it crosses the vertical through the view centre, if visible
              const dx = cx, inside = Math.abs(dx) < c.r
              if (!inside) return null
              const yy = Math.sqrt(c.r * c.r - dx * dx)
              const y = Math.abs(cy - yy) < Math.abs(cy + yy) ? yy : -yy
              const py = sy(y)
              if (py < 12 || py > H - 12) return null
              return <text key={c.lat.toFixed(2)} x={W / 2 + 4} y={py - 3}>{fmtLat(c.lat, overlay.latStep < 1 ? (overlay.latStep < 0.25 ? 1 : 2) : 0)}</text>
            })}
          </g>
          <g className="names">
            {overlay.names.map(({ f, px, py }) => (
              <text key={f.name} x={px} y={py} className="place" style={{ fontSize: Math.min(17, Math.max(11.5, (f.km * 1000) / mpp / 9)) }}>{f.name}</text>
            ))}
          </g>
          <g className="sites">
            {p.sites.map((s) => {
              const [x, y] = ll2xy(s.lat, s.lon)
              const px = sx(x), py = sy(y)
              if (px < -20 || px > W + 20 || py < -20 || py > H + 20) return null
              const sel = p.selected?.id === s.id, cmp = p.compared.includes(s.id)
              return (
                <g key={s.id} className={`site${sel ? ' sel' : ''}${cmp ? ' cmp' : ''}`} transform={`translate(${px} ${py})`}
                  onPointerDown={(ev) => ev.stopPropagation()} onClick={() => p.onPick(s.lat, s.lon, s)}>
                  <circle className="hit" r={12} />
                  <circle className="under" r={sel ? 7 : 4.5} />
                  <circle className="ring" r={sel ? 7 : 4.5} />
                  {sel && <circle className="core" r={2.5} />}
                </g>
              )
            })}
            {customSel && (
              <g className="site sel" transform={`translate(${customSel.px} ${customSel.py})`}>
                <circle className="under" r={7} /><circle className="ring" r={7} /><circle className="core" r={2.5} />
              </g>
            )}
          </g>
        </svg>
      )}
      {overlay && (
        <div className="map-marks" aria-hidden="true">
          {labels.map((l) => (
            <span key={l.id} className={`site-label place${l.sel ? ' sel' : ''}`} style={{ translate: `${Math.round(l.px + (l.sel ? 15 : 11))}px ${Math.round(l.py)}px` }}>{l.name}</span>
          ))}
          {selMark && <span className="site-pulse" style={{ translate: `${selMark.px}px ${selMark.py}px` }} />}
          <span className="toward-mark is-sun" data-side={sunEdge.side} style={{ translate: `${sunEdge.x}px ${sunEdge.y}px` }}><i /><b>to the Sun</b></span>
          <span className="toward-mark is-earth" data-side={earthEdge.side} style={{ translate: `${earthEdge.x}px ${earthEdge.y}px` }}><i /><b>to the Earth</b></span>
          <span className="map-scale narrow">
            <i style={{ width: (scaleKm * 1000) / mpp }} />
            {scaleKm >= 1 ? `${scaleKm} km` : `${scaleKm * 1000} m`}
          </span>
        </div>
      )}
      {hover && (() => {
        // beside the pointer, on whichever side has room in the free part of the map
        const left = hover.px > free.r - 300, up = hover.py > free.b - 96
        return (
          <p className="map-readout glass-quiet" style={{ translate: `${Math.round(hover.px + (left ? -14 : 16))}px ${Math.round(hover.py + (up ? -12 : 18))}px`, transform: `translate(${left ? '-100%' : '0'}, ${up ? '-100%' : '0'})` }}>
            <span className="where">{fmtLat(hover.lat, 3)} {fmtLon(hover.lon, 2)}</span>
            {hover.text && <span className="what">{hover.text}</span>}
          </p>
        )
      })()}
    </div>
  )
}
