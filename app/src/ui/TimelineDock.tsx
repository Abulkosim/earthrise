// Written with AI assistance (Claude); see the README.
// The bottom glass dock. The transport row (play, the time, jump to landing, speed, and the lane
// legend or hover readout that the ribbon puts in it), then the landing calendar and the site rows
// (children). A chevron folds the dock down to the transport row.
import { ChevronDown, Gauge, Pause, Play, SkipBack } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { spring, springSnappy } from '@/lib/motion'
import { fmtDate } from '../state'
import { useReportInset } from './chrome'
import { DockInfoSlot } from './dockSlot'
import './TimelineDock.css'

const SPEEDS = [6, 12, 30, 60]

interface Props {
  /** width of the name column that the calendar and the ribbon share, in CSS pixels */
  nameWidth: number
  epochMs: number
  /** hours since the epoch */
  now: number
  landing: number
  stayHours: number
  playing: boolean
  onPlay(): void
  onJump(): void
  /** hours of lunar time per second */
  speed: number
  onSpeed(v: number): void
  /** the calendar and the ribbon */
  children: React.ReactNode
}

const p2 = (n: number) => String(n).padStart(2, '0')

function span(h: number): string {
  const r = Math.round(h)
  if (r < 48) return `${r} h`
  const d = Math.floor(r / 24), rest = r % 24
  return rest ? `${d} d ${rest} h` : `${d} d`
}

/** Where the clock stands against the stay: before it, which day of it, or after it. */
function phase(now: number, landing: number, stayHours: number): string {
  const d = now - landing
  if (d < 0) return `${span(-d)} before landing`
  if (d <= stayHours) return `Day ${Math.min(Math.floor(d / 24) + 1, Math.max(1, Math.round(stayHours / 24)))} of the ${Math.round(stayHours / 24)}-day stay`
  return `${span(d - stayHours)} after the stay`
}

export function TimelineDock(p: Props) {
  const ref = useRef<HTMLElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useReportInset('bottom', ref)
  const ms = p.epochMs + Math.round(p.now) * 3600e3
  const d = new Date(ms)
  const speeds = SPEEDS.includes(p.speed) ? SPEEDS : [...SPEEDS, p.speed].sort((a, b) => a - b)
  const playLabel = p.playing ? 'Pause' : 'Play time'

  return (
    <footer className="bottom" ref={ref} style={{ '--ribbon-name-w': `${p.nameWidth}px` } as React.CSSProperties}>
      <div className="timeline-dock glass enter enter-bottom" data-collapsed={collapsed} style={{ '--enter-order': 4 } as React.CSSProperties}>
        <div className="transport">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon-lg" className="play-button rounded-full" data-playing={p.playing} aria-label={playLabel} onClick={p.onPlay}>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={p.playing ? 'pause' : 'play'} className="grid place-items-center"
                    initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={springSnappy}
                  >
                    {p.playing ? <Pause className="size-[18px] fill-current" aria-hidden="true" /> : <Play className="size-[18px] translate-x-px fill-current" aria-hidden="true" />}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{playLabel}</TooltipContent>
          </Tooltip>

          <div className="clock-block">
            <span className="clock">
              {fmtDate(ms)} <b>{p2(d.getUTCHours())}:{p2(d.getUTCMinutes())}</b> <small>UTC</small>
            </span>
            <span className="clock-phase narrow">{phase(p.now, p.landing, p.stayHours)}</span>
          </div>

          <div className="transport-controls">
            <Button type="button" variant="ghost" size="sm" onClick={p.onJump}>
              <SkipBack aria-hidden="true" />
              Jump to landing
            </Button>
            <Select value={String(p.speed)} onValueChange={(v) => p.onSpeed(Number(v))}>
              <SelectTrigger size="sm" className="speed-trigger rounded-full border-transparent" aria-label="Playback speed">
                <Gauge aria-hidden="true" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" side="top" align="start">
                {speeds.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s} h per second</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="dock-info" ref={setSlot} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button" variant="ghost" size="icon-sm" className="dock-collapse rounded-full"
                aria-label={collapsed ? 'Show the timeline' : 'Hide the timeline'} aria-expanded={!collapsed}
                onClick={() => setCollapsed((c) => !c)}
              >
                <motion.span className="grid place-items-center" animate={{ rotate: collapsed ? 180 : 0 }} transition={spring}>
                  <ChevronDown aria-hidden="true" />
                </motion.span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{collapsed ? 'Show the timeline' : 'Hide the timeline'}</TooltipContent>
          </Tooltip>
        </div>

        <motion.div
          className="dock-body" initial={false} inert={collapsed}
          animate={collapsed ? { height: 0, opacity: 0 } : { height: 'auto', opacity: 1 }}
          transition={{ height: spring, opacity: { duration: 0.18 } }}
        >
          <div className="timeline-body">
            <DockInfoSlot.Provider value={slot}>{p.children}</DockInfoSlot.Provider>
          </div>
        </motion.div>
      </div>
    </footer>
  )
}
