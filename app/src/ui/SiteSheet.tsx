// Everything about one site: what the lander sees now, and how the stay goes.
// Written with AI assistance (Claude); see the README.
import { hoursToChange } from '../model/sitecalc'
import type { Horizon, Site, SiteSeries, SiteSummary } from '../model/types'
import { fmtDate, fmtDateTime, fmtDur, fmtLat, fmtLon, fmtPct, type Brief } from '../state'
import { Panorama } from './Panorama'

const KIND: Record<Site['kind'], string> = {
  apollo: 'Apollo landing', landed: 'Landed', planned: 'Planned landing', candidate: 'Candidate site', custom: 'Picked on the map',
}
const STATIONS = ['Goldstone', 'Madrid', 'Canberra']

interface Props {
  site: Site
  horizon: Horizon | null
  series: SiteSeries | null
  summary: SiteSummary | null // the stay, from landing to its end
  psrM: number | null         // metres to permanent shadow, when the site is in view and it is known
  now: number
  brief: Brief
  epochMs: number
  compared: boolean
  onCompare(): void
  onCentre(): void
  onClose(): void
}

export function SiteSheet(p: Props) {
  const { site, series: s, brief: b } = p
  const k = s ? Math.min(s.n - 1, Math.max(0, (p.now - s.t0) / s.dt)) : 0
  const ki = Math.round(k)
  const k0 = s ? Math.max(0, Math.round((b.landing - s.t0) / s.dt)) : 0
  const k1 = s ? Math.min(s.n, k0 + Math.round((b.stayDays * 24) / s.dt)) : 0
  const sum = p.summary

  let sunLine = '', earthLine = '', stationLine = ''
  if (s) {
    const f = s.sunFrac[ki]
    const sc = hoursToChange((j) => s.sunFrac[j] > 0, ki, s.n, s.dt)
    sunLine = f >= 0.999 ? 'The whole Sun is up' : f > 0 ? `${fmtPct(f)} of the Sun’s disk shows above the terrain` : 'The Sun is behind the terrain'
    if (sc) sunLine += f > 0 ? `. It sets in ${fmtDur(sc.hours)}.` : `. It rises in ${fmtDur(sc.hours)}.`
    else sunLine += f > 0 ? '. It stays up past the end of the timeline.' : '. It stays down past the end of the timeline.'
    const c = s.earthClear[ki]
    const ec = hoursToChange((j) => s.earthClear[j] > 0, ki, s.n, s.dt)
    earthLine = c > 0 ? `The Earth stands ${c.toFixed(1)}° above the terrain` : `The Earth is ${Math.abs(c).toFixed(1)}° below the terrain`
    if (ec) earthLine += c > 0 ? `. It sets in ${fmtDur(ec.hours)}.` : `. It rises in ${fmtDur(ec.hours)}.`
    else earthLine += c > 0 ? '. It does not set within the timeline.' : '. It does not rise within the timeline.'
    const st = STATIONS.filter((_, i) => s.dsn[ki] & (1 << i))
    stationLine = c > 0
      ? (st.length ? `${st.join(' and ')} can see the Moon${s.comm[ki] ? ', so contact is possible.' : ', but the Earth is not clear enough of the terrain for the brief.'}` : 'No Deep Space Network station has the Moon in view right now.')
      : 'No direct contact while the Earth is hidden.'
  }

  const fails: string[] = []
  if (sum) {
    if (sum.lit < b.needs.minLit) fails.push(`sunlight is ${fmtPct(sum.lit)} and the brief asks for ${fmtPct(b.needs.minLit)}`)
    if (sum.longestDarkH > b.needs.maxDarkH) fails.push(`the longest dark stretch is ${fmtDur(sum.longestDarkH)} and the brief allows ${fmtDur(b.needs.maxDarkH)}`)
    if (sum.comm < b.needs.minComm) fails.push(`contact is ${fmtPct(sum.comm)} and the brief asks for ${fmtPct(b.needs.minComm)}`)
    if (b.needs.powerLasts && !sum.survives) fails.push(`the battery is empty ${fmtDur(sum.hoursAlive)} after landing`)
    if (b.needs.psrKm > 0 && p.psrM !== null && p.psrM > b.needs.psrKm * 1000) fails.push(`permanent shadow is ${(p.psrM / 1000).toFixed(1)} km away and the brief asks for ${b.needs.psrKm} km`)
  }

  return (
    <aside className="sheet" aria-label={`Site: ${site.name}`}>
      <header>
        <h2 className="place">{site.name}</h2>
        <button type="button" className="text" onClick={p.onClose} aria-label="Close the site panel">Close</button>
      </header>
      <p className="where">
        {fmtLat(site.lat, 3)} {fmtLon(site.lon, 3)}
        <span className="kind">{KIND[site.kind]}{site.agency ? `, ${site.agency}` : ''}{site.date ? `, ${fmtDate(Date.parse(site.date))}` : ''}</span>
      </p>
      {site.note && <p className="note">{site.note}</p>}

      <h3>From the lander, {fmtDateTime(p.epochMs + p.now * 3600e3)} UTC</h3>
      {p.horizon
        ? <Panorama horizon={p.horizon} series={s} k={k} stay={[k0, k1]} />
        : <p className="wait">Reading the terrain around this point…</p>}
      {s && (
        <ul className="nowlist">
          <li className="sun">{sunLine}</li>
          <li className="earth">{earthLine}</li>
          <li>{stationLine}</li>
        </ul>
      )}

      <h3>A {b.stayDays}-day stay from {fmtDate(p.epochMs + b.landing * 3600e3)}</h3>
      {sum ? (
        <>
          <dl className="stay">
            <div><dt>Sunlight</dt><dd>{fmtPct(sum.lit)}</dd></div>
            <div><dt>Longest dark</dt><dd>{fmtDur(sum.longestDarkH)}</dd></div>
            <div><dt>Contact</dt><dd>{fmtPct(sum.comm)}</dd></div>
            <div><dt>Longest silence</dt><dd>{fmtDur(sum.longestSilenceH)}</dd></div>
            <div><dt>Power</dt><dd>{sum.survives ? `lasts, lowest ${Math.round(sum.minBatteryWh)} Wh` : `out after ${fmtDur(sum.hoursAlive)}`}</dd></div>
            {p.psrM !== null && <div><dt>Nearest permanent shadow</dt><dd>{p.psrM <= 0 ? 'the site is in it' : p.psrM < 1000 ? `${Math.round(p.psrM / 10) * 10} m` : `${(p.psrM / 1000).toFixed(1)} km`}</dd></div>}
          </dl>
          <p className={`verdict${fails.length ? ' fail' : ''}`}>
            {fails.length ? `Does not meet the brief: ${fails.join('; ')}.` : 'Meets the brief.'}
          </p>
        </>
      ) : <p className="wait">Working out the stay…</p>}

      <p className="actions">
        <button type="button" className="text" onClick={p.onCompare}>{p.compared ? 'Stop comparing this site' : 'Compare this site'}</button>
        <button type="button" className="text" onClick={p.onCentre}>Centre the map here</button>
        {site.source && <a href={site.source} target="_blank" rel="noreferrer">Source of the coordinates</a>}
      </p>
    </aside>
  )
}
