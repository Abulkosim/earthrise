// Written with AI assistance (Claude); see the README.
// A stat tile: a 12 px label above a 22 px number. The number crossfades when it changes.
// A tile whose need fails gets a --fail dot and a thin outline.
import { AnimatePresence, motion } from 'motion/react'
import { fade } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { Tone } from './Chip'

interface Props {
  label: string
  value: string
  /** a smaller line under the number, e.g. "lowest 1,240 Wh" */
  detail?: string
  tone?: Tone
  fail?: boolean
  className?: string
}

export function StatTile({ label, value, detail, tone = 'none', fail = false, className }: Props) {
  return (
    <div className={cn('stat-tile min-w-0 rounded-2xl bg-raised px-3 py-2.5', fail ? 'outline outline-1 -outline-offset-1 outline-fail/55' : '', className)}>
      <div className="flex items-center gap-1.5 text-xs text-dust-2">
        {fail ? <span className="dot dot-fail" aria-hidden="true" /> : tone !== 'none' && <span className={`dot dot-${tone}`} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </div>
      <div className="relative mt-0.5 text-[22px] leading-7 font-semibold text-dust-1 tabular-nums">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} className="block truncate" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={fade}>
            {value}
          </motion.span>
        </AnimatePresence>
      </div>
      {detail && <div className="truncate text-xs text-dust-2">{detail}</div>}
    </div>
  )
}
