// Written with AI assistance (Claude); see the README.
// "Replay a real landing": missions that flew, what happened, and what the model says.
import { Play } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo } from 'react'
import { spring } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { chipVariants } from './Chip'

export interface Replay {
  id: string
  siteId: string
  title: string
  landingUtc: string
  endUtc: string
  terrain: '20 m LOLA' | '240 m LOLA' | 'smooth sphere'
  happened: string
  model: string
  numbers: {
    sunElevationAtLandingDeg: number
    sunFractionAtLanding: number
    modelSunsetUtc: string | null
    modelSunriseUtc?: string
    earthElevationAboveTerrainAtLandingDeg: number
    earthClearShare: number
    eclipse?: { startUtc: string; maxUtc: string; endUtc: string }
  }
  sources: string[]
  /** changes to the default lander that this replay needs, e.g. SLIM's fixed west-facing array */
  mission?: { panelFixed?: boolean; panelAz?: number; panelTilt?: number }
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Memoised: pass a stable `onReplay`. */
export const RealLandings = memo(function RealLandings({ replays, onReplay, activeId }: { replays: Replay[]; onReplay(r: Replay): void; activeId?: string }) {
  return (
    <section className="replays px-2 pb-3" aria-label="Replay a real landing">
      <h2 className="px-2 pt-1 pb-2 text-xs font-medium text-dust-3">Replay a real landing</h2>
      <ul className="flex flex-col gap-1">
        {replays.map((r) => {
          const active = r.id === activeId
          return (
            <li key={r.id} className={cn('min-w-0 rounded-2xl transition-colors', active ? 'bg-raised shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]' : 'hover:bg-raised')}>
              <button type="button" aria-expanded={active} onClick={() => onReplay(r)} className="group flex w-full items-start gap-3 rounded-2xl p-2.5 text-left">
                <span className={cn('grid size-8 flex-none place-items-center rounded-full transition-colors', active ? 'bg-dust-1 text-[#0d0d0e]' : 'bg-raised text-dust-1 group-hover:bg-raised-hover')} aria-hidden="true">
                  <Play className="size-3.5 translate-x-px fill-current" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-dust-1">{r.title}</span>
                  {!active && <span className="line-clamp-2 text-[12.5px] leading-snug text-dust-2">{r.happened}</span>}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {active && (
                  <motion.div className="overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring}>
                    <div className="replay-body px-3 pb-3.5 text-[13.5px] leading-relaxed text-dust-2">
                      <h3 className="mb-0.5 text-xs font-medium text-dust-3">What happened</h3>
                      <p>{r.happened}</p>
                      <h3 className="mt-3 mb-0.5 text-xs font-medium text-dust-3">What the model says</h3>
                      <p className="text-dust-1">{r.model}</p>
                      <p className="mt-3 text-xs text-dust-3">Terrain: {r.terrain}. Sources:</p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.sources.map((u) => <li key={u}><a href={u} target="_blank" rel="noreferrer" className={cn(chipVariants({ size: 'sm' }), 'font-normal text-dust-2 hover:text-dust-1')}>{host(u)}</a></li>)}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ul>
    </section>
  )
})
