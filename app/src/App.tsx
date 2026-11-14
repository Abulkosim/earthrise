// Earthrise: the app shell. Holds the brief, the time, the chosen sites, and wires them to the map engine.
// Written with AI assistance (Claude); see the README.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import featuresJson from './data/features.json'
import replaysJson from './data/replays.json'
import sitesJson from './data/sites.json'
import { DataStore } from './engine/data'
import type { Engine } from './engine/engine'
import { computeSeries, landingWindows, ll2xy, sphereHorizon, summarize, xy2ll } from './model/sitecalc'
import type { Horizon, Site } from './model/types'
import { useStable } from '@/lib/useStable'
import { LAYERS, defaultBrief, fmtLat, fmtLon, needsVector, type Brief as BriefT, type LayerId } from './state'
import { MotionConfig } from 'motion/react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BriefPanel } from './ui/BriefPanel'
import { Calendar, type CalendarData } from './ui/Calendar'
import { CommandPalette } from './ui/CommandPalette'
import { Header, type Demo, type Run } from './ui/Header'
import { IntroDialog } from './ui/IntroDialog'
import { LayerDock, LayerLegend } from './ui/LayerDock'
import { LeftPanel, type LeftTab } from './ui/LeftPanel'
import { MapNote } from './ui/MapNote'
import { MapView, type Feature, type MapStatus, type MapViewState } from './ui/MapView'
import { RealLandings, type Replay } from './ui/RealLandings'
import { Ribbon } from './ui/Ribbon'
import { SitePanel } from './ui/SitePanel'
import { SiteSheet } from './ui/SiteSheet'
import { StatusPill } from './ui/StatusPill'
import { TimelineDock } from './ui/TimelineDock'
import './ui/shell.css'

const SITES = sitesJson as Site[]
const FEATURES = featuresJson as Feature[]
const REPLAYS = replaysJson as Replay[]
const SPAN_H = 100 * 24
const SCATTER_M = 500 // landing scatter used for the landing odds: a circle of this radius around the aim point
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

// ---- the view as a link ------------------------------------------------
// Everything that defines what is on screen goes into the address, so a planner can send a
// scenario to a colleague: place, zoom, time, landing, stay, brief, layer and sites.
interface Shared { view?: MapViewState; now?: number; brief?: BriefT; layer?: LayerId; selected?: Site; compared?: Site[] }
const customSite = (lat: number, lon: number): Site => ({ id: `pt-${lat.toFixed(4)}-${lon.toFixed(4)}`, name: `${fmtLat(lat)} ${fmtLon(lon)}`, lat, lon, kind: 'custom' })
function siteFromToken(t: string): Site | undefined {
  const known = SITES.find((s) => s.id === t)
  if (known) return known
  const m = t.split(',').map(Number)
  return m.length === 2 && m.every(Number.isFinite) && Math.abs(m[0]) <= 90 ? customSite(m[0], ((m[1] % 360) + 360) % 360) : undefined
}
const siteToken = (s: Site) => (s.kind === 'custom' ? `${s.lat.toFixed(4)},${s.lon.toFixed(4)}` : s.id)
function readShared(epochMs: number): Shared {
  const q = new URLSearchParams(location.hash.slice(1))
  const out: Shared = {}
  try {
    const c = q.get('c')?.split(',').map(Number)
    if (c && c.length === 3 && c.every(Number.isFinite) && c[2] > 0) out.view = { cx: c[0], cy: c[1], mpp: c[2] }
    const base = defaultBrief(epochMs)
    const l = Number(q.get('l')), d = Number(q.get('d'))
    const extra = q.get('b') ? JSON.parse(q.get('b')!) : {}
    if (q.has('l') || q.has('d') || q.has('b')) {
      out.brief = {
        landing: q.has('l') && Number.isFinite(l) ? l : base.landing,
        stayDays: q.has('d') && d >= 1 && d <= 60 ? Math.round(d) : base.stayDays,
        mission: { ...base.mission, ...(extra.m ?? {}) }, needs: { ...base.needs, ...(extra.n ?? {}) },
      }
    }
    const t = Number(q.get('t'))
    if (q.has('t') && Number.isFinite(t)) out.now = t
    const layer = q.get('layer')
    if (layer && LAYERS.some((x) => x.id === layer)) out.layer = layer as LayerId
    if (q.get('site')) out.selected = siteFromToken(q.get('site')!)
    if (q.has('cmp')) out.compared = q.get('cmp')!.split(';').filter(Boolean).map(siteFromToken).filter((s): s is Site => !!s).slice(0, 6)
  } catch { /* a damaged link falls back to the defaults */ }
  return out
}
function writeShared(epochMs: number, view: MapViewState, now: number, brief: BriefT, layer: LayerId, selected: Site | null, compared: Site[]) {
  const base = defaultBrief(epochMs)
  const diff = <T extends object>(a: T, b: T) => Object.fromEntries(Object.entries(a).filter(([k, v]) => (b as Record<string, unknown>)[k] !== v))
  const m = diff(brief.mission, base.mission), n = diff(brief.needs, base.needs)
  const q = new URLSearchParams()
  q.set('c', `${Math.round(view.cx)},${Math.round(view.cy)},${+view.mpp.toFixed(2)}`)
  q.set('t', String(Math.round(now)))
  q.set('l', String(Math.round(brief.landing)))
  q.set('d', String(brief.stayDays))
  if (Object.keys(m).length || Object.keys(n).length) q.set('b', JSON.stringify({ m, n }))
  q.set('layer', layer)
  if (selected) q.set('site', siteToken(selected))
  q.set('cmp', compared.map(siteToken).join(';'))
  history.replaceState(null, '', `#${q.toString()}`)
}

function Main({ data }: { data: DataStore }) {
  const [shared] = useState(() => readShared(data.epochMs))
  const [view, setView] = useState<MapViewState>(shared.view ?? { cx: -6000, cy: -9000, mpp: 42 })
  const [brief, setBriefRaw] = useState<BriefT>(() => shared.brief ?? defaultBrief(data.epochMs))
  // every change of the brief passes here, so the landing can never leave the ephemeris table
  const setBrief = useCallback((u: BriefT | ((b: BriefT) => BriefT)) => {
    setBriefRaw((b) => {
      const nb = typeof u === 'function' ? u(b) : u
      const landing = Math.min(data.maxHours - 100 * 24, Math.max(21 * 24, nb.landing))
      return landing === nb.landing ? nb : { ...nb, landing }
    })
  }, [data])
  const [replay, setReplay] = useState<Replay>()
  const [now, setNow] = useState(() => shared.now ?? (shared.brief ?? defaultBrief(data.epochMs)).landing + 30)
  const [spanT0, setSpanT0] = useState(() => (shared.brief ?? defaultBrief(data.epochMs)).landing - 20 * 24)
  const [layer, setLayer] = useState<LayerId>(shared.layer ?? 'now')
  const [selected, setSelected] = useState<Site | null>(shared.selected ?? null)
  const [compared, setCompared] = useState<Site[]>(() => shared.compared ??
    // one site that meets the default brief (a 5 m region on the connecting ridge) and two candidate regions that do not
    ['barker-site1-roi4', 'a3-malapert-massif', 'a3-mons-mouton-plateau'].map((id) => SITES.find((s) => s.id === id)).filter((s): s is Site => !!s))
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
  // share of the ground within the scatter radius of a site that meets the brief (null when unknown)
  const oddsOf = (s: Site) => (engine && s.lat <= POLAR_LIMIT && status.pass !== null ? engine.landingOdds(...ll2xy(s.lat, s.lon), SCATTER_M, needsVector(brief), brief.needs.psrKm * 1000) : null)
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
    const s = SITES.find((t) => t.id === 'barker-site1-roi4') ?? SITES.find((t) => t.name.toLowerCase().includes('connecting ridge'))
    if (s) goTo(s)
    setLayer('now'); setSpeed(8); setNow(brief.landing); setPlaying(true)
  }

  function goTo(s: Site) {
    setSelected(s)
    if (s.lat <= POLAR_LIMIT) {
      const [x, y] = ll2xy(s.lat, s.lon)
      // Beyond 80 S the terrain is coarse (hundreds of metres a sample): stay far enough out that
      // the map shows landforms and not the samples themselves.
      const floor = Math.hypot(x, y) > 300e3 ? 320 : 0
      setView((v) => ({ cx: x, cy: y, mpp: Math.max(floor, Math.min(v.mpp, 60)) }))
    }
  }
  const pick = (lat: number, lon: number, site?: Site) => {
    // the pole itself has no north; a metre away is as good and keeps every frame defined
    const la = Math.max(lat, -89.9999)
    setSelected(site ?? customSite(la, lon))
  }
  const toggleCompare = (s: Site) => setCompared((c) => (c.some((t) => t.id === s.id) ? c.filter((t) => t.id !== s.id) : [...c, s].slice(-6)))

  // "Find a site" (the command palette) and the tab of the left panel
  const [finding, setFinding] = useState(false)
  const [leftTab, setLeftTab] = useState<LeftTab>('mission')
  const goToCoords = (latTyped: number, lon: number) => {
    const lat = Math.max(latTyped, -89.9999)
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90) goTo(customSite(lat, ((lon % 360) + 360) % 360))
  }

  // keep the address in step with the view (not while time is running: that would write 60 times a second)
  useEffect(() => {
    if (playing || slipping) return
    const t = window.setTimeout(() => writeShared(data.epochMs, view, now, brief, layer, selected, compared), 400)
    return () => window.clearTimeout(t)
  }, [data, view, now, brief, layer, selected, compared, playing, slipping])
  // a short explanation for people who have never thought about the lunar pole; shown once
  const [intro, setIntro] = useState(() => { try { return !location.hash && localStorage.getItem('earthrise-intro') !== 'seen' } catch { return false } })
  const closeIntro = () => { setIntro(false); try { localStorage.setItem('earthrise-intro', 'seen') } catch { /* private mode: show it again next time */ } }
  // Hooks for scripted capture (screenshots, the demo video, the end-to-end check): the same state
  // setters the interface uses, so a script can step time or the landing date frame by frame.
  useEffect(() => {
    const w = window as unknown as { __earthrise?: Record<string, unknown> }
    w.__earthrise = { ...(w.__earthrise ?? {}), data, ui: { setNow, setLayer, setBrief, setView, setSelected, setCompared, setPlaying, sites: SITES } }
  }, [data, setBrief])
  // the timeline's name column. On a phone it is only a gutter for the "UTC" label: each site's
  // name and numbers sit on a line of their own above its lanes (see Ribbon.css), so nothing is cut short
  const [nameW, setNameW] = useState(() => (window.innerWidth < 700 ? 44 : 268))
  useEffect(() => {
    const on = () => setNameW(window.innerWidth < 700 ? 44 : 268)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const copyLink = () => {
    writeShared(data.epochMs, view, now, brief, layer, selected, compared)
    // no clipboard (an insecure origin, a refused permission): say where the link is instead of saying nothing
    const failed = () => { toast('The link is in the address bar') }
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(location.href).then(() => { toast('Link copied') }, failed)
    else failed()
  }
  const statusText =
    status.phase === 'loading' ? 'Loading terrain…'
    : status.phase === 'horizons' ? `Tracing the horizon in 360 directions from ${status.pixels.toLocaleString('en')} points… ${Math.round(status.progress * 100)}%`
    : status.phase === 'mission' ? 'Running the stay at every point…'
    : status.bakeMs ? `Horizons for ${status.pixels.toLocaleString('en')} points traced in ${(status.bakeMs / 1000).toFixed(1)} s. Stay evaluated at every point in ${(status.evalMs / 1000).toFixed(2)} s.` : ''

  const markers = useMemo(() => SITES.filter((s) => s.lat <= POLAR_LIMIT), [])

  const onReplay = (r: Replay) => {
    stopShows()
    setReplay(r)
    const t0 = data.hours(Date.parse(r.landingUtc)), t1 = data.hours(Date.parse(r.endUtc))
    // each replay starts from a Sun-tracking array and applies what that lander needs
    setBrief((b) => ({ ...b, landing: Math.round(t0), stayDays: Math.min(60, Math.max(1, Math.ceil((t1 - t0) / 24))), mission: { ...b.mission, panelFixed: false, ...(r.mission ?? {}) } }))
    setNow(Math.round(t0))
    setLayer('now')
    const s = SITES.find((t) => t.id === r.siteId)
    if (s) goTo(s)
  }
  // "The best place to land": the point in view with the most workable ground within 500 m of it,
  // so that a landing that misses by a few hundred metres still works.
  const showBest = () => {
    stopShows()
    const b = engine?.bestPoint(needsVector(brief), brief.needs.psrKm * 1000, SCATTER_M)
    setLayer('needs')
    if (!b) { toast('No ground in view meets the brief for this landing date.'); return }
    const [lat, lon] = xy2ll(b.x, b.y)
    setSelected({ ...customSite(lat, lon), name: 'Best place to land in view' })
    toast(`${Math.round(b.share * 100)}% of the ground within ${SCATTER_M} m of it meets the brief.`)
  }
  // The same handlers with a fixed identity, so the memoised panels do not re-render on every
  // progress tick of the engine (a slow shell makes the map think the GPU is slow).
  const act = useStable({ showMonth, showSlip, showRidge, showBest, stopShows, copyLink, onReplay, goTo, goToCoords, find: () => setFinding(true), openIntro: () => setIntro(true) })
  const demos = useMemo<Demo[]>(() => [
    { title: 'A lunar month of light', explain: 'Time runs on from the landing date and the shadows turn with the Sun.', run: act.showMonth },
    { title: 'A landing date that slips', explain: 'The landing moves five weeks later, and the ground that meets the brief changes with it.', run: act.showSlip },
    { title: 'The view from the ridge', explain: 'Goes to the Shackleton connecting ridge and plays time there from the landing date.', run: act.showRidge },
    { title: 'The best place to land', explain: 'Picks the point in view with the most workable ground around it, for this brief and landing date.', run: act.showBest },
  ], [act])
  // how far the running demonstration is, for the ring on the Stop button
  const run = useMemo<Run | null>(
    () => (slipping ? { kind: 'slip', at: brief.landing, span: 35 * 24 } : playing ? { kind: 'play', at: now, end: spanT0 + SPAN_H - 1 } : null),
    [slipping, playing, brief.landing, now, spanT0],
  )
  const landingMs = data.epochMs + brief.landing * 3600e3

  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <div className="app">
          <Header
            demos={demos} run={run} onStop={act.stopShows} onFind={act.find} onCopy={act.copyLink} onIntro={act.openIntro}
            validationHref={`${import.meta.env.BASE_URL}validation.html`}
          >
            <LayerDock layer={layer} onChange={setLayer} />
          </Header>

          <LeftPanel
            tab={leftTab} onTab={setLeftTab}
            mission={<BriefPanel brief={brief} epochMs={data.epochMs} onChange={setBrief} />}
            landings={
              <RealLandings replays={REPLAYS} activeId={replay?.id} onReplay={act.onReplay} />
            }
          />

          <MapView
            data={data} view={view} onView={setView} now={now} brief={brief} layer={layer} sites={markers}
            selected={selected} compared={compared.map((s) => s.id)} features={FEATURES}
            onPick={pick} onStatus={setStatus} span={span} onCalendar={setCalendar}
            onEngine={(e) => { setEngine(e); const w = window as unknown as { __earthrise?: Record<string, unknown> }; w.__earthrise = { ...(w.__earthrise ?? {}), engine: e, data } }}
          />

          {/* the free cell over the map, between the panels */}
          <div className="stage">
            <LayerLegend layer={layer} brief={brief}>
              <MapNote status={status} show={!intro && layer !== 'now'} landingMs={landingMs} />
            </LayerLegend>
            <StatusPill status={status} text={statusText} />
          </div>

          <SitePanel open={!!selected}>
            {selected && (
              <SiteSheet
                site={selected} horizon={horizons[hkey(selected)] ?? null} series={seriesOf[selected.id] ?? null}
                summary={stayOf[selected.id] ?? null} psrM={psrOf(selected)} odds={oddsOf(selected)}
                now={now} brief={brief} epochMs={data.epochMs} compared={compared.some((s) => s.id === selected.id)}
                onCompare={() => toggleCompare(selected)} onCentre={() => goTo(selected)} onClose={() => setSelected(null)}
              />
            )}
          </SitePanel>

          <TimelineDock
            nameWidth={nameW} epochMs={data.epochMs} now={now} landing={brief.landing} stayHours={stay}
            playing={playing} onPlay={() => { setSlipping(false); setPlaying((v) => !v) }} onJump={() => setNow(brief.landing)}
            speed={speed} onSpeed={setSpeed}
          >
            <Calendar
              data={calendar} t0={spanT0} hours={SPAN_H} epochMs={data.epochMs} landing={brief.landing} nameWidth={nameW}
              onLanding={(h) => setBrief((b) => ({ ...b, landing: Math.round(h) }))}
            />
            <Ribbon
              rows={rows} t0={spanT0} hours={SPAN_H} epochMs={data.epochMs} now={now} landing={brief.landing}
              stayHours={stay} batteryWh={brief.mission.batteryWh} selectedId={selected?.id}
              onNow={(h) => { setPlaying(false); setNow(h) }} onLanding={(h) => setBrief((b) => ({ ...b, landing: Math.round(h) }))}
              onSelect={(id) => { const s = compared.find((t) => t.id === id); if (s) setSelected(s) }}
              onRemove={(id) => setCompared((c) => c.filter((t) => t.id !== id))}
              onPan={(t) => setSpanT0(Math.min(data.maxHours - SPAN_H, Math.max(0, Math.round(t))))}
              onFind={act.find}
            />
          </TimelineDock>
        </div>

        <CommandPalette open={finding} onOpenChange={setFinding} sites={SITES} groups={GROUPS} onSite={act.goTo} onCoords={act.goToCoords} />
        <IntroDialog open={intro} onClose={closeIntro} onMonth={showMonth} onSlip={showSlip} />
        <Toaster position="top-right" offset={{ top: 72, right: 14 }} mobileOffset={{ top: 12, right: 12 }} />
      </TooltipProvider>
    </MotionConfig>
  )
}
