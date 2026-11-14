// Written with AI assistance (Claude); see the README.
// The layer dock: what the map shows, as a row of pills. The active pill takes the hue of its
// layer and its background slides from pill to pill. A chip over the top of the map explains the
// layer and shows its ramp; the map note comes under that.
import { BatteryCharging, CircleCheck, Eclipse, Moon, Orbit, SatelliteDish, Sun, Sunrise, VolumeX, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { fade, spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { LAYERS, type Brief, type LayerId } from '../state'

/** The short label and the icon of each layer; the full label stays as tooltip and accessible name. */
const DOCK: Record<LayerId, { short: string; icon: LucideIcon }> = {
  now: { short: 'Light now', icon: Sun },
  needs: { short: 'Mission works', icon: CircleCheck },
  lit: { short: 'Sunlight', icon: Sunrise },
  longestDark: { short: 'Longest dark', icon: Moon },
  comm: { short: 'Contact', icon: SatelliteDish },
  longestCommGap: { short: 'Longest silence', icon: VolumeX },
  hoursAlive: { short: 'Power', icon: BatteryCharging },
  climate: { short: '18.6-year Sun', icon: Orbit },
  psr: { short: 'Permanent shadow', icon: Eclipse },
}

const Pills = memo(function Pills(p: { layer: LayerId; onChange(l: LayerId): void }) {
  return (
    <div role="radiogroup" aria-label="Map layer" className="dock glass no-scrollbar">
      {LAYERS.map((l) => {
        const on = l.id === p.layer
        const Icon = DOCK[l.id].icon
        return (
          <Tooltip key={l.id}>
            <TooltipTrigger asChild>
              <label className={cn('layer', `hue-${l.hue}`, on && 'on')}>
                <input type="radio" name="layer" className="sr-only" checked={on} onChange={() => p.onChange(l.id)} />
                {on && <motion.span layoutId="layer-pill" className="layer-pill" transition={spring} aria-hidden="true" />}
                <Icon className="layer-icon" aria-hidden="true" />
                <span className="layer-short" aria-hidden="true">{DOCK[l.id].short}</span>
                <span className="sr-only">{l.label}</span>
              </label>
            </TooltipTrigger>
            <TooltipContent side="bottom">{l.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
})

const Legend = memo(function Legend(p: { layer: LayerId; brief: Brief }) {
  const cur = LAYERS.find((l) => l.id === p.layer)!
  const legend = cur.legend?.(p.brief)
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={cur.id} className={cn('legend-chip glass-quiet', `hue-${cur.hue}`)}
        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={fade}
      >
        <p className="explain">{cur.explain}</p>
        {legend && (
          <p className="legend narrow" aria-label={`From ${legend[0]} to ${legend[1]}`}>
            <span>{legend[0]}</span><span className="bar" aria-hidden="true" /><span>{legend[1]}</span>
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  )
})

/** The pills, for the header. `onChange` should be stable (a state setter is): the pills are memoised. */
export function LayerDock(p: { layer: LayerId; onChange(l: LayerId): void }) {
  return (
    <section className="layers" aria-label="What the map shows">
      <Pills layer={p.layer} onChange={p.onChange} />
    </section>
  )
}

/** The legend chip and, under it, the children (the map note). It sits over the top of the free map. */
export function LayerLegend(p: { layer: LayerId; brief: Brief; children?: React.ReactNode }) {
  return (
    <div className="dock-stack">
      <Legend layer={p.layer} brief={p.brief} />
      {p.children}
    </div>
  )
}
