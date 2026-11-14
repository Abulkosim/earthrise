// Everything about one site: what the lander sees now, and how the stay goes.
// Written with AI assistance (Claude); see the README.
import {
  Check, CircleCheck, CircleX, Earth, ExternalLink, Footprints, LoaderCircle, LocateFixed, MapPin,
  MapPinned, Plus, RadioTower, Rocket, Sun, CalendarClock, X, type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fade } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { hoursToChange } from '../model/sitecalc'
import type { Horizon, Site, SiteSeries, SiteSummary } from '../model/types'
import { fmtDate, fmtDateTime, fmtDur, fmtLat, fmtLon, fmtPct, type Brief } from '../state'
import { Panorama } from './Panorama'
import { StatTile } from './StatTile'
import './SiteSheet.css'

const KIND: Record<Site['kind'], [string, LucideIcon]> = {
  apollo: ['Apollo landing', Footprints],
  landed: ['Landed', Rocket],
  planned: ['Planned landing', CalendarClock],
  candidate: ['Candidate site', MapPin],
  custom: ['Picked on the map', MapPinned],
}
const STATIONS = ['Goldstone', 'Madrid', 'Canberra']

interface Props {
  site: Site
  horizon: Horizon | null
  series: SiteSeries | null
  summary: SiteSummary | null // the stay, from landing to its end
  psrM: number | null         // metres to permanent shadow, when the site is in view and it is known
  odds: { share: number; points: number } | null // share of the ground within 500 m that meets the brief
  now: number
  brief: Brief
  epochMs: number
  compared: boolean
  onCompare(): void
  onCentre(): void
  onClose(): void
}

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** Durations such as "2 d 23 h" never break across lines. */
const keep = (s: string) => s.replace(/\d+ [dh](?: \d+ h)?/g, (m) => m.replace(/ /g, '\u00a0'))

export function SiteSheet(p: Props) {
  const { site, series: s, brief: b } = p
  const k = s ? Math.min(s.n - 1, Math.max(0, (p.now - s.t0) / s.dt)) : 0
  const ki = Math.round(k)
  const k0 = s ? Math.max(0, Math.round((b.landing - s.t0) / s.dt)) : 0
  const k1 = s ? Math.min(s.n, k0 + Math.round((b.stayDays * 24) / s.dt)) : 0
  const sum = p.summary

  let sunLine = '', earthLine = '', stationLine = ''
  let sunUp = false, earthUp = false, contact = false
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
    sunUp = f > 0
    earthUp = c > 0
    contact = !!s.comm[ki]
  }

  const fails: string[] = []
  const failing = { lit: false, dark: false, comm: false, power: false, psr: false }
  if (sum) {
    if (sum.lit < b.needs.minLit) { failing.lit = true; fails.push(`sunlight is ${fmtPct(sum.lit)} and the brief asks for ${fmtPct(b.needs.minLit)}`) }
    if (sum.longestDarkH > b.needs.maxDarkH) { failing.dark = true; fails.push(`the longest dark stretch is ${fmtDur(sum.longestDarkH)} and the brief allows ${fmtDur(b.needs.maxDarkH)}`) }
    if (sum.comm < b.needs.minComm) { failing.comm = true; fails.push(`contact is ${fmtPct(sum.comm)} and the brief asks for ${fmtPct(b.needs.minComm)}`) }
    if (b.needs.powerLasts && !sum.survives) { failing.power = true; fails.push(`the battery is empty ${fmtDur(sum.hoursAlive)} after landing`) }
    if (b.needs.psrKm > 0 && p.psrM !== null && p.psrM > b.needs.psrKm * 1000) { failing.psr = true; fails.push(`permanent shadow is ${(p.psrM / 1000).toFixed(1)} km away and the brief asks for ${b.needs.psrKm} km`) }
  }

  const [kindLabel, KindIcon] = KIND[site.kind]
  const meta = [site.agency, site.date ? fmtDate(Date.parse(site.date)) : ''].filter(Boolean).join(', ')
  const psr = p.psrM === null ? null : p.psrM <= 0 ? 'In it' : p.psrM < 1000 ? `${Math.round(p.psrM / 10) * 10} m` : `${(p.psrM / 1000).toFixed(1)} km`

  return (
    <aside className="sheet" aria-label={`Site: ${site.name}`}>
      <motion.header key={site.id} className="sheet-head" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={fade}>
        <div className="flex items-start gap-3">
          <h2 className="place min-w-0 flex-1 text-[26px] leading-[1.12] text-balance text-dust-1">{site.name}</h2>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" className="-mt-0.5 -mr-1.5 rounded-full" onClick={p.onClose} aria-label="Close the site panel">
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">Close</TooltipContent>
          </Tooltip>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px]">
          <Badge variant="secondary" className="h-6 gap-1.5 border-white/10 px-2.5 text-dust-1">
            <KindIcon aria-hidden="true" className="text-dust-2" />
            {kindLabel}
          </Badge>
          <span className="text-dust-1 tabular-nums">{fmtLat(site.lat, 3)} {fmtLon(site.lon, 3)}</span>
          {meta && <span className="text-dust-2">{meta}</span>}
        </div>
        {site.note && <p className="mt-2.5 text-[13px] leading-relaxed text-pretty text-dust-2">{site.note}</p>}
      </motion.header>

      <section className="sheet-card" aria-labelledby="sheet-lander">
        <div className="sheet-card-head">
          <h3 id="sheet-lander">From the lander</h3>
          <span className="sheet-when">{fmtDateTime(p.epochMs + p.now * 3600e3)} <span className="text-dust-3">UTC</span></span>
        </div>
        {p.horizon
          ? <Panorama horizon={p.horizon} series={s} k={k} stay={[k0, k1]} height={180} />
          : <Waiting tall>Reading the terrain around this point…</Waiting>}
        {s && (
          <ul className="mt-3 grid gap-2.5 px-1 pb-1">
            <NowRow icon={Sun} tone="sun" on={sunUp}>{sunLine}</NowRow>
            <NowRow icon={Earth} tone="earth" on={earthUp}>{earthLine}</NowRow>
            <NowRow icon={RadioTower} tone="earth" on={contact}>{stationLine}</NowRow>
          </ul>
        )}
      </section>

      <section className="sheet-card @container" aria-labelledby="sheet-stay">
        <div className="sheet-card-head">
          <h3 id="sheet-stay">The stay</h3>
          <span className="sheet-when">{b.stayDays} days from {fmtDate(p.epochMs + b.landing * 3600e3)}</span>
        </div>
        {sum ? (
          <>
            <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
              <StatTile label="Sunlight" tone="sun" value={fmtPct(sum.lit)} fail={failing.lit} />
              <StatTile label="Longest dark" tone="sun" value={fmtDur(sum.longestDarkH)} fail={failing.dark} />
              <StatTile label="Contact" tone="earth" value={fmtPct(sum.comm)} fail={failing.comm} />
              <StatTile label="Longest silence" tone="earth" value={fmtDur(sum.longestSilenceH)} />
              <StatTile
                label="Power" tone="sun" fail={failing.power}
                className={psr === null ? 'col-span-2' : ''}
                value={sum.survives ? `${Math.round(sum.minBatteryWh)} Wh` : fmtDur(sum.hoursAlive)}
                detail={sum.survives ? 'lowest charge, it lasts' : 'until the battery is empty'}
              />
              {psr !== null && (
                <StatTile
                  label="Permanent shadow" value={psr} fail={failing.psr}
                  detail={p.psrM! <= 0 ? 'the site is in it' : 'to the nearest'}
                />
              )}
              {p.odds && (
                <StatTile
                  label="If the landing misses" className="col-span-2" value={`${Math.round(p.odds.share * 100)}%`}
                  detail="of the ground within 500 m of this point meets the brief"
                />
              )}
            </div>
            <Verdict fails={fails} />
          </>
        ) : <Waiting>Working out the stay…</Waiting>}
      </section>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" className="flex-1" aria-pressed={p.compared} onClick={p.onCompare}>
          {p.compared ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {p.compared ? 'Stop comparing' : 'Compare'}
        </Button>
        <Button type="button" variant="secondary" size="sm" className="flex-1" onClick={p.onCentre}>
          <LocateFixed aria-hidden="true" />
          Centre the map here
        </Button>
        {site.source && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="sm">
                <a href={site.source} target="_blank" rel="noreferrer">
                  Source
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Source of the coordinates</TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  )
}

function NowRow({ icon: Icon, tone, on, children }: { icon: LucideIcon; tone: 'sun' | 'earth'; on: boolean; children: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cn('now-icon', on ? `is-${tone}` : '')} aria-hidden="true">
        <Icon />
      </span>
      <span className={cn('min-w-0 pt-[3px] text-[13px] leading-snug', on ? 'text-dust-1' : 'text-dust-2')}>{keep(children)}</span>
    </li>
  )
}

function Verdict({ fails }: { fails: string[] }) {
  if (!fails.length) {
    return (
      <div className="verdict is-ok" role="status">
        <CircleCheck aria-hidden="true" className="size-[18px] text-sun" />
        <span className="font-semibold text-both">Meets the brief</span>
      </div>
    )
  }
  return (
    <div className="verdict is-fail" role="status">
      <CircleX aria-hidden="true" className="mt-px size-[18px] text-fail" />
      <div className="min-w-0">
        <span className="font-semibold text-fail">Does not meet the brief</span>
        <ul className="mt-1.5 grid gap-1 text-[13px] leading-snug text-dust-1">
          {fails.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="dot dot-fail mt-[7px]" aria-hidden="true" />
              <span>{keep(upper(f))}.</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Waiting({ children, tall = false }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <p className={cn('flex items-center gap-2 text-[13px] text-dust-2', tall && 'h-[180px] justify-center rounded-[14px] bg-black/40')}>
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-dust-3 motion-reduce:animate-none" />
      {children}
    </p>
  )
}
