// Written with AI assistance (Claude); see the README.
// The mission brief, written as sentences. Every value that can change is a chip; a chip opens a
// popover with a slider, a number field and a few usual values. Switches sit inside the sentence
// they belong to.
import { CalendarDays, ListChecks, SatelliteDish, Snowflake, Zap, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { memo, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { springSnappy } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { LANDING_MAX_MS, LANDING_MIN_MS, fmtDate, type Brief as BriefT } from '../state'
import { Chip, ChipUnit, chipVariants, type Tone } from './Chip'

// "°" and "%" sit against the number; words and letters take a thin space
const tight = (unit: string) => unit === '°' || unit === '%'
const withUnit = (v: number, unit: string) => `${v}${tight(unit) ? '' : ' '}${unit}`

interface NumProps { value: number; onChange(v: number): void; min?: number; max?: number; step?: number; unit?: string; label: string }

/** The number field: keeps the text while typing, clamps, and commits valid numbers as they come. */
function Num(p: NumProps) {
  const [text, setText] = useState(String(p.value))
  useEffect(() => { setText((t) => (Number(t) === p.value ? t : String(p.value))) }, [p.value])
  return (
    <span className="inline-flex h-8 flex-none items-center gap-1 rounded-xl border border-input bg-raised px-2 text-dust-1 focus-within:border-white/30">
      <input
        type="number" inputMode="decimal" aria-label={p.label} value={text} min={p.min} max={p.max} step={p.step ?? 1}
        className="[appearance:textfield] bg-transparent text-right text-sm font-semibold tabular-nums outline-hidden [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        style={{ width: `${Math.max(3, text.length) + 1}ch` }}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(v)) p.onChange(Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v)))
        }}
        onBlur={() => setText(String(p.value))}
      />
      {p.unit && <span className="text-[13px] text-dust-2">{p.unit}</span>}
    </span>
  )
}

interface NumChipProps extends NumProps {
  min: number
  max: number
  unit: string
  tone?: Tone
  /** usual values, offered as buttons */
  presets?: number[]
  /** where the slider starts and ends, when the field accepts more than anyone usually sets */
  sliderMin?: number
  sliderMax?: number
  /** the chip arrives with a spring (values that only exist for some choices) */
  appear?: boolean
}

function NumChip(p: NumChipProps) {
  const low = p.sliderMin ?? p.min, top = p.sliderMax ?? p.max
  const chip = (
    <Popover>
      <PopoverTrigger asChild>
        <Chip tone={p.tone} pulseKey={p.value} aria-label={`${p.label}: ${withUnit(p.value, p.unit)}. Change`}>
          <span>{p.value}{tight(p.unit) && p.unit}</span>
          {!tight(p.unit) && <ChipUnit>{p.unit}</ChipUnit>}
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[272px] p-3.5">
        <p className="text-[13px] leading-snug text-dust-2">{p.label}</p>
        <div className="mt-2.5 flex items-center gap-3">
          <Slider
            tone={p.tone} thumbLabel={p.label} value={[Math.min(top, Math.max(low, p.value))]} min={low} max={top} step={p.step ?? 1}
            onValueChange={([v]) => p.onChange(v)}
          />
          <Num label={p.label} value={p.value} min={p.min} max={p.max} step={p.step} unit={p.unit} onChange={p.onChange} />
        </div>
        {p.presets && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.presets.map((v) => (
              <Button key={v} type="button" size="xs" variant={v === p.value ? 'outline' : 'secondary'} className="rounded-full px-2.5 tabular-nums" onClick={() => p.onChange(v)}>
                {withUnit(v, p.unit)}
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
  if (!p.appear) return chip
  return (
    <motion.span className="inline-flex align-middle" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={springSnappy}>
      {chip}
    </motion.span>
  )
}

// The calendar works in local dates; the brief counts in UTC. A UTC day is shown as the local day
// with the same year, month and day, and read back the same way.
const utcToLocalDay = (ms: number) => { const d = new Date(ms); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }
const localDayToUtc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())

function DateChip(p: { ms: number; onChange(ms: number): void }) {
  const [open, setOpen] = useState(false)
  const day = utcToLocalDay(p.ms)
  const first = utcToLocalDay(LANDING_MIN_MS), last = utcToLocalDay(LANDING_MAX_MS)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Chip pulseKey={fmtDate(p.ms)} aria-label={`Landing date (UTC): ${fmtDate(p.ms)}. Change`}>
          <CalendarDays className="size-3.5 text-dust-2" aria-hidden="true" />
          {fmtDate(p.ms)}
        </Chip>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-auto p-2">
        <Calendar
          mode="single" required captionLayout="dropdown" weekStartsOn={1}
          selected={day} defaultMonth={day} startMonth={first} endMonth={last} disabled={{ before: first, after: last }}
          onSelect={(d) => {
            if (!d) return
            const ms = localDayToUtc(d)
            if (ms >= LANDING_MIN_MS && ms <= LANDING_MAX_MS) { p.onChange(ms); setOpen(false) }
          }}
        />
        <p className="px-2 pb-1.5 text-xs text-dust-3">Dates are UTC. The landing is at 00:00.</p>
      </PopoverContent>
    </Popover>
  )
}

/** A switch inside a sentence. The words after it are its label and dim when it is off. */
function Clause(p: { checked: boolean; onChange(v: boolean): void; tone?: Tone; children: React.ReactNode }) {
  return (
    <label className={cn('transition-colors', p.checked ? '' : 'text-dust-3')}>
      <Switch tone={p.tone} checked={p.checked} onCheckedChange={p.onChange} className="mr-1.5 align-middle" />
      {p.children}
    </label>
  )
}

/** Keeps a control and the punctuation after it on one line: a full stop alone at the start of a line reads as a mistake. */
function Tie({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>
}

function Section(p: { icon: LucideIcon; label: string; tone?: Tone; children: React.ReactNode }) {
  const Icon = p.icon
  return (
    <div className="border-t border-hairline py-3 first:border-t-0 first:pt-1">
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-dust-3">
        <Icon className={cn('size-3.5', p.tone === 'sun' ? 'text-sun' : p.tone === 'earth' ? 'text-earth' : '')} aria-hidden="true" />
        {p.label}
      </h3>
      <p className="text-[14px] leading-[30px] text-dust-2">{p.children}</p>
    </div>
  )
}

/** Memoised: pass a stable `onChange`. */
export const BriefPanel = memo(function BriefPanel(p: { brief: BriefT; epochMs: number; onChange(b: BriefT): void }) {
  const b = p.brief, m = b.mission, n = b.needs
  const setM = (k: keyof typeof m, v: number | boolean) => p.onChange({ ...b, mission: { ...m, [k]: v } })
  const setN = (k: keyof typeof n, v: number | boolean) => p.onChange({ ...b, needs: { ...n, [k]: v } })
  return (
    <section className="brief px-4 pb-4" aria-label="Mission brief">
      <Section icon={CalendarDays} label="Stay">
        Land on{' '}
        <DateChip ms={p.epochMs + b.landing * 3600e3} onChange={(ms) => p.onChange({ ...b, landing: (ms - p.epochMs) / 3600e3 })} />{' '}
        and work <Tie>for <NumChip label="Length of stay in days" value={b.stayDays} min={1} max={60} unit="days" presets={[7, 14, 28]} onChange={(v) => p.onChange({ ...b, stayDays: Math.round(v) })} />.</Tie>
      </Section>

      <Section icon={Zap} label="Power" tone="sun">
        The solar array{' '}
        <Tie><Select value={m.panelFixed ? 'fixed' : 'track'} onValueChange={(v) => setM('panelFixed', v === 'fixed')}>
          <SelectTrigger aria-label="How the solar array is mounted" className={cn(chipVariants(), 'inline-flex w-auto gap-1.5 py-0 data-[size=default]:h-[25px] [&>svg:last-child]:size-3.5')}>
            <span className="dot dot-sun" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start" sideOffset={6}>
            <SelectItem value="track">turns to follow the Sun</SelectItem>
            <SelectItem value="fixed">is fixed to the lander</SelectItem>
          </SelectContent>
        </Select>{m.panelFixed ? ',' : '.'}</Tie>
        {m.panelFixed && (<> facing <NumChip appear tone="sun" label="Azimuth the array faces, degrees from north" value={m.panelAz} min={0} max={359} step={5} unit="°" presets={[0, 90, 180, 270]} onChange={(v) => setM('panelAz', v)} /> from north
          and tilted <NumChip appear tone="sun" label="Tilt of the array from flat, degrees" value={m.panelTilt} min={0} max={180} step={5} unit="°" presets={[0, 45, 90]} onChange={(v) => setM('panelTilt', v)} /> from flat.</>)} It
        gives <NumChip tone="sun" label="Array power in full Sun, watts" value={m.arrayW} min={0} max={20000} sliderMax={2000} step={10} unit="W" presets={[200, 450, 1000]} onChange={(v) => setM('arrayW', v)} /> in
        full Sun and stands <NumChip label="Height of array and antenna above ground, metres" value={m.mast} min={0} max={30} step={0.5} unit="m" presets={[2, 5, 10]} onChange={(v) => setM('mast', v)} /> above
        the ground. The lander draws <NumChip tone="sun" label="Load while lit, watts" value={m.loadLitW} min={0} max={20000} sliderMax={1000} step={10} unit="W" onChange={(v) => setM('loadLitW', v)} /> when
        lit and <NumChip tone="sun" label="Load in the dark, watts" value={m.loadDarkW} min={0} max={20000} sliderMax={400} step={5} unit="W" onChange={(v) => setM('loadDarkW', v)} /> to
        stay warm in the dark, from a <NumChip tone="sun" label="Battery capacity, watt-hours" value={m.batteryWh} min={0} max={200000} sliderMax={20000} step={100} unit="Wh" presets={[1000, 3000, 10000]}
          onChange={(v) => p.onChange({ ...b, mission: { ...m, batteryWh: v, startWh: v } })} /> battery.
      </Section>

      <Section icon={SatelliteDish} label="Contact" tone="earth">
        Radio contact needs the Earth <NumChip tone="earth" label="Clearance of the Earth above the terrain, degrees" value={m.earthMargin} min={0} max={10} step={0.5} unit="°" presets={[0, 1, 2, 5]} onChange={(v) => setM('earthMargin', v)} /> clear
        of the terrain{' '}
        <Clause tone="earth" checked={m.needDsn} onChange={(v) => setM('needDsn', v)}>and a Deep Space Network station that can see the Moon</Clause>.
      </Section>

      <Section icon={ListChecks} label="Needs">
        It needs sunlight at least <NumChip tone="sun" label="Minimum share of sunlight, percent" value={Math.round(n.minLit * 100)} min={0} max={100} step={5} unit="%" presets={[25, 50, 75]} onChange={(v) => setN('minLit', v / 100)} /> of
        the time, no dark stretch longer <Tie>than <NumChip tone="sun" label="Longest allowed dark stretch, hours" value={n.maxDarkH} min={0} max={1500} sliderMax={360} step={6} unit="h" presets={[24, 72, 168]} onChange={(v) => setN('maxDarkH', v)} />,</Tie>{' '}
        contact at least <NumChip tone="earth" label="Minimum share of contact, percent" value={Math.round(n.minComm * 100)} min={0} max={100} step={5} unit="%" presets={[30, 50, 80]} onChange={(v) => setN('minComm', v / 100)} /> of
        the time{' '}
        <Clause tone="sun" checked={n.powerLasts} onChange={(v) => setN('powerLasts', v)}>and a battery that never runs empty</Clause>.
      </Section>

      <Section icon={Snowflake} label="Science">
        <Clause checked={n.psrKm > 0} onChange={(v) => setN('psrKm', v ? 2 : 0)}>The science team wants ground that never sees the Sun, where ice can last,</Clause>{' '}
        within <NumChip label="Largest distance to permanent shadow, kilometres" value={n.psrKm > 0 ? n.psrKm : 2} min={0.1} max={50} sliderMin={0.5} sliderMax={10} step={0.5} unit="km" presets={[1, 2, 5]} onChange={(v) => setN('psrKm', v)} /> of
        the landing point.
      </Section>
    </section>
  )
})
