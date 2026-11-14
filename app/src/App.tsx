// Earthrise: the app shell. Holds the brief, the time, the chosen sites, and wires them to the map engine.
// Written with AI assistance (Claude); see the README.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import featuresJson from './data/features.json'
import replaysJson from './data/replays.json'
import sitesJson from './data/sites.json'
import { DataStore } from './engine/data'
import type { Engine } from './engine/engine'
import { computeSeries, landingWindows, ll2xy, sphereHorizon, summarize } from './model/sitecalc'
import type { Horizon, Site } from './model/types'
import { defaultBrief, fmtDate, fmtDateTime, fmtLat, fmtLon, type Brief as BriefT, type LayerId } from './state'
import { Brief, LayerPicker } from './ui/Brief'
import { Calendar, type CalendarData } from './ui/Calendar'
import { MapView, type Feature, type MapStatus, type MapViewState } from './ui/MapView'
import { Replays, type Replay } from './ui/Replays'
import { Ribbon } from './ui/Ribbon'
import { SiteSheet } from './ui/SiteSheet'
import './App.css'

const SITES = sitesJson as Site[]
const FEATURES = featuresJson as Feature[]
const REPLAYS = replaysJson as Replay[]
const SPAN_H = 100 * 24
const POLAR_LIMIT = -60.5 // elevation data reaches 60 S

const GROUPS: [Site['kind'], string][] = [
  ['candidate', 'Candidate sites at the south pole'], ['planned', 'Planned landings'], ['landed', 'Robotic landings'], ['apollo', 'Apollo'],
]

export default function App() {
  const [data, setData] = useState<DataStore | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const d = new DataStore()
    d.init().then(() => setData(d), (e) => setError(String(e?.message ?? e)))
  }, [])
  if (error) return <p className="boot">Earthrise could not load its data. {error}</p>
  if (!data) return <p className="boot">Loading the Moon’s south pole: elevation from LOLA, Sun and Earth positions from JPL…</p>
  return <Main data={data} />
}

function Main({ data }: { data: DataStore }) {
  const [view, setView] = useState<MapViewState>({ cx: -6000, cy: -9000, mpp: 42 })
  const [brief, setBriefRaw] = useState<BriefT>(() => defaultBrief(data.epochMs))
  // every change of the brief passes here, so the landing can never leave the ephemeris table
  const setBrief = useCallback((u: BriefT | ((b: BriefT) => BriefT)) => {
    setBriefRaw((b) => {
      const nb = typeof u === 'function' ? u(b) : u
      const landing = Math.min(data.maxHours - 100 * 24, Math.max(21 * 24, nb.landing))
      return landing === nb.landing ? nb : { ...nb, landing }
    })
  }, [data])
  const [replay, setReplay] = useState<Replay>()
  const [now, setNow] = useState(() => defaultBrief(data.epochMs).landing + 30)
  const [spanT0, setSpanT0] = useState(() => defaultBrief(data.epochMs).landing - 20 * 24)
  const [layer, setLayer] = useState<LayerId>('now')
  const [selected, setSelected] = useState<Site | null>(null)
  const [compared, setCompared] = useState<Site[]>(() =>
    ['connecting ridge', 'malapert', 'mons mouton plateau'].map((q) => SITES.find((s) => s.name.toLowerCase().includes(q))).filter((s): s is Site => !!s).slice(0, 3))
  const [status, setStatus] = useState<MapStatus>({ phase: 'loading', progress: 0, bakeMs: 0, evalMs: 0, pixels: 0, pass: null })
  const [playing, setPlaying] = useState(false)
  const [engine, setEngine] = useState<Engine | null>(null)
  const [calendar, setCalendar] = useState<CalendarData | null>(null)
  const span = useMemo(() => ({ t0: spanT0, hours: SPAN_H }), [spanT0])
  const [horizons, setHorizons] = useState<Record<string, Horizon>>({})
  const mast = brief.mission.mast
  const hkey = useCallback((s: Site) => `${s.id}@${mast}`, [mast])

  // keep the timeline around the landing date
  useEffect(() => {
    setSpanT0((t) => (brief.landing < t + 5 * 24 || brief.landing + brief.stayDays * 24 > t + SPAN_H - 5 * 24 ? brief.landing - 20 * 24 : t))
  }, [brief.landing, brief.stayDays])
  useEffect(() => { setNow((n) => Math.min(spanT0 + SPAN_H - 1, Math.max(spanT0, n))) }, [spanT0])

  // terrain horizons for the sites on screen, from the same GPU kernel as the map
  const wanted = useMemo(() => {
    const all = selected ? [selected, ...compared] : compared
    return all.filter((s, i) => all.findIndex((t) => t.id === s.id) === i)
  }, [selected, compared])
  const pending = useRef(new Set<string>())
  useEffect(() => {
    if (!engine) return
    for (const s of wanted) {
      const key = hkey(s)
      if (horizons[key] || pending.current.has(key)) continue
      pending.current.add(key)
      const done = (h: Horizon) => { pending.current.delete(key); setHorizons((m) => ({ ...m, [key]: h })) }
      if (s.lat > POLAR_LIMIT) { done(sphereHorizon(mast)); continue }
      const [x, y] = ll2xy(s.lat, s.lon)
      engine.probe([{ x, y, mast }], 720).then(
        (r) => done({ naz: 720, el: r.el, ground: r.ground[0], terrain: true }),
        () => done(sphereHorizon(mast)),
      )
    }
  }, [engine, wanted, horizons, hkey, mast])

  const n = SPAN_H
  const k0 = Math.round(brief.landing - spanT0), stay = Math.round(brief.stayDays * 24)
  const seriesOf = useMemo(() => {
    const out: Record<string, ReturnType<typeof computeSeries>> = {}
    for (const s of wanted) {
      const h = horizons[hkey(s)]
      if (h) out[s.id] = computeSeries(data, s.lat, s.lon, h, brief.mission, spanT0, n, 1, Math.max(0, k0))
    }
    return out
  }, [wanted, horizons, hkey, data, brief.mission, spanT0, n, k0])
  const psrOf = (s: Site): number | null => (engine && s.lat <= POLAR_LIMIT ? engine.psrDistanceAt(...ll2xy(s.lat, s.lon)) : null)
  // The stay is summarised from its own series, from landing to the end of the stay,
  // so the numbers do not depend on which part of the timeline is on screen.
  const stayOf = useMemo(() => {
    const out: Record<string, ReturnType<typeof summarize>> = {}
    for (const s of wanted) {
      const h = horizons[hkey(s)]
      if (h) out[s.id] = summarize(computeSeries(data, s.lat, s.lon, h, brief.mission, brief.landing, stay, 1), brief.mission)
    }
    return out
  }, [wanted, horizons, hkey, data, brief.mission, brief.landing, stay])
  const rows = useMemo(() => compared.filter((s) => seriesOf[s.id]).map((s) => {
    const series = seriesOf[s.id]
    // a site too far from permanent shadow has no landing window at all when the brief asks for it
    const d = psrOf(s)
    const far = brief.needs.psrKm > 0 && d !== null && d > brief.needs.psrKm * 1000
    return { id: s.id, name: s.name, series, summary: stayOf[s.id], windows: far ? new Uint8Array(series.n) : landingWindows(series, brief.mission, stay, brief.needs) }
    // status.pass changes when the map's long run finishes, which is when the distances appear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [compared, seriesOf, stayOf, brief.mission, brief.needs, stay, status.pass])

  // play: hours of lunar time per second of wall time
  const [speed, setSpeed] = useState(12)
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now()
    const tick = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000)
      last = t
      setNow((h) => {
        const nh = h + dt * speed
        if (nh >= spanT0 + SPAN_H - 1) { setPlaying(false); return spanT0 + SPAN_H - 1 }
        return nh
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, spanT0, speed])

  // "Slip the landing": move the landing date forward five weeks while the map and calendar follow
  const [slipping, setSlipping] = useState(false)
  useEffect(() => {
    if (!slipping) return
    let raf = 0, last = performance.now(), acc = 0
    const start = brief.landing
    const tick = (t: number) => {
      acc += Math.min(0.1, (t - last) / 1000) * 60 // 2.5 days per second
      last = t
      if (acc >= 35 * 24) { setSlipping(false); return }
      const h = Math.round(start + acc)
      setBrief((b) => (b.landing === h ? b : { ...b, landing: h }))
      setNow(h + 6)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // the start date is read once, when the slip begins
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slipping])
  const stopShows = () => { setPlaying(false); setSlipping(false) }
  const showMonth = () => { stopShows(); setLayer('now'); setSpeed(30); setNow(brief.landing); setPlaying(true) }
  const showSlip = () => { stopShows(); setLayer('needs'); setSlipping(true) }
  const showRidge = () => {
    stopShows()
    const s = SITES.find((t) => t.name.toLowerCase().includes('connecting ridge'))
    if (s) goTo(s)
    setLayer('now'); setSpeed(8); setNow(brief.landing); setPlaying(true)
  }

  function goTo(s: Site) {
    setSelected(s)
    if (s.lat <= POLAR_LIMIT) {
      const [x, y] = ll2xy(s.lat, s.lon)
      setView((v) => ({ cx: x, cy: y, mpp: Math.min(v.mpp, 60) }))
    }
  }
  const pick = (lat: number, lon: number, site?: Site) => {
    // the pole itself has no north; a metre away is as good and keeps every frame defined
    const la = Math.max(lat, -89.9999)
    setSelected(site ?? { id: `pt-${la.toFixed(4)}-${lon.toFixed(4)}`, name: `${fmtLat(la)} ${fmtLon(lon)}`, lat: la, lon, kind: 'custom' })
  }
  const toggleCompare = (s: Site) => setCompared((c) => (c.some((t) => t.id === s.id) ? c.filter((t) => t.id !== s.id) : [...c, s].slice(-6)))

  const [coord, setCoord] = useState({ lat: '-89.45', lon: '222.69' })
  const statusText =
    status.phase === 'loading' ? 'Loading terrain…'
    : status.phase === 'horizons' ? `Tracing the horizon in 360 directions from ${status.pixels.toLocaleString('en')} points… ${Math.round(status.progress * 100)}%`
    : status.phase === 'mission' ? 'Running the stay at every point…'
    : status.bakeMs ? `Horizons for ${status.pixels.toLocaleString('en')} points traced in ${(status.bakeMs / 1000).toFixed(1)} s. Stay evaluated at every point in ${(status.evalMs / 1000).toFixed(2)} s.` : ''

  const markers = useMemo(() => SITES.filter((s) => s.lat <= POLAR_LIMIT), [])

  return (
    <div className="app">
      <header className="top">
        <h1 className="place">Earthrise</h1>
        <p className="tag">Every landing site at the Moon’s south pole, every hour, on one map.</p>
        <p className="shows">
          Show me{' '}
          <button type="button" className="text" onClick={showMonth}>a lunar month of light</button>
          <button type="button" className="text" onClick={showSlip}>a landing date that slips</button>
          <button type="button" className="text" onClick={showRidge}>the view from the ridge</button>
          {(playing || slipping) && <button type="button" className="text" onClick={stopShows}>Stop</button>}
        </p>
        <p className="status narrow" role="status">{statusText}</p>
        <nav><a href={`${import.meta.env.BASE_URL}validation.html`}>How we know it is right</a></nav>
      </header>

      <div className="left">
        <Brief brief={brief} epochMs={data.epochMs} onChange={setBrief} />
        <LayerPicker layer={layer} brief={brief} onChange={setLayer} />
        <section className="goto" aria-label="Go to a site">
          <h2>Go to a site</h2>
          <select aria-label="Known sites" value="" onChange={(e) => { const s = SITES.find((t) => t.id === e.target.value); if (s) goTo(s) }}>
            <option value="">Pick a known site…</option>
            {GROUPS.map(([kind, label]) => (
              <optgroup key={kind} label={label}>
                {SITES.filter((s) => s.kind === kind).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
          <form className="coords" onSubmit={(e) => {
            e.preventDefault()
            const lat = Math.max(Number(coord.lat), -89.9999), lon = Number(coord.lon)
            if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90) goTo({ id: `pt-${lat.toFixed(4)}-${lon.toFixed(4)}`, name: `${fmtLat(lat)} ${fmtLon(lon)}`, lat, lon: ((lon % 360) + 360) % 360, kind: 'custom' })
          }}>
            <label>Latitude <input value={coord.lat} inputMode="decimal" onChange={(e) => setCoord({ ...coord, lat: e.target.value })} /></label>
            <label>Longitude east <input value={coord.lon} inputMode="decimal" onChange={(e) => setCoord({ ...coord, lon: e.target.value })} /></label>
            <button type="submit" className="text">Go to these coordinates</button>
          </form>
        </section>
        <Replays
          replays={REPLAYS} activeId={replay?.id}
          onReplay={(r) => {
            stopShows()
            setReplay(r)
            const t0 = data.hours(Date.parse(r.landingUtc)), t1 = data.hours(Date.parse(r.endUtc))
            setBrief((b) => ({ ...b, landing: Math.round(t0), stayDays: Math.min(60, Math.max(1, Math.ceil((t1 - t0) / 24))) }))
            setNow(Math.round(t0))
            setLayer('now')
            const s = SITES.find((t) => t.id === r.siteId)
            if (s) goTo(s)
          }}
        />
      </div>

      <MapView
        data={data} view={view} onView={setView} now={now} brief={brief} layer={layer} sites={markers}
        selected={selected} compared={compared.map((s) => s.id)} features={FEATURES}
        onPick={pick} onStatus={setStatus} span={span} onCalendar={setCalendar}
        onEngine={(e) => { setEngine(e); (window as unknown as { __earthrise: unknown }).__earthrise = { engine: e, data } }}
      />

      {layer !== 'now' && status.phase !== 'idle' && (
        <p className="map-note" role="status">
          {status.phase === 'horizons'
            ? `Tracing the horizon around every point in view… ${Math.round(status.progress * 100)}%`
            : status.phase === 'mission' ? 'Running the stay at every point…' : 'Loading terrain…'}
        </p>
      )}
      {status.pass !== null && layer !== 'now' && status.phase === 'idle' && (
        <p className="map-note" role="status">
          {status.pass === 0
            ? `No ground in view meets the brief for a landing on ${fmtDate(data.epochMs + brief.landing * 3600e3)}. Drag the stay in the timeline to try other dates, or relax a need.`
            : `${status.pass < 0.001 ? 'Under 0.1' : (status.pass * 100).toFixed(status.pass < 0.1 ? 1 : 0)}% of the ground in view meets the brief for a landing on ${fmtDate(data.epochMs + brief.landing * 3600e3)}.`}
        </p>
      )}

      {selected && (
        <SiteSheet
          site={selected} horizon={horizons[hkey(selected)] ?? null} series={seriesOf[selected.id] ?? null}
          summary={stayOf[selected.id] ?? null} psrM={psrOf(selected)}
          now={now} brief={brief} epochMs={data.epochMs} compared={compared.some((s) => s.id === selected.id)}
          onCompare={() => toggleCompare(selected)} onCentre={() => goTo(selected)} onClose={() => setSelected(null)}
        />
      )}

      <footer className="bottom">
        <div className="transport">
          <button type="button" className="text" onClick={() => { setSlipping(false); setSpeed(12); setPlaying((v) => !v) }}>{playing ? 'Pause' : 'Play time'}</button>
          <span className="clock narrow">{fmtDateTime(data.epochMs + now * 3600e3)} UTC</span>
          <button type="button" className="text" onClick={() => setNow(brief.landing)}>Jump to landing</button>
        </div>
        <Calendar
          data={calendar} t0={spanT0} hours={SPAN_H} epochMs={data.epochMs} landing={brief.landing} nameWidth={268}
          onLanding={(h) => setBrief((b) => ({ ...b, landing: Math.round(h) }))}
        />
        <Ribbon
          rows={rows} t0={spanT0} hours={SPAN_H} epochMs={data.epochMs} now={now} landing={brief.landing}
          stayHours={stay} batteryWh={brief.mission.batteryWh} selectedId={selected?.id}
          onNow={(h) => { setPlaying(false); setNow(h) }} onLanding={(h) => setBrief((b) => ({ ...b, landing: Math.round(h) }))}
          onSelect={(id) => { const s = compared.find((t) => t.id === id); if (s) setSelected(s) }}
          onRemove={(id) => setCompared((c) => c.filter((t) => t.id !== id))}
          onPan={(t) => setSpanT0(Math.min(data.maxHours - SPAN_H, Math.max(0, Math.round(t))))}
        />
      </footer>
    </div>
  )
}
