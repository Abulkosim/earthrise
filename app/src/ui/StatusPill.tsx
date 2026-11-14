// Written with AI assistance (Claude); see the README.
// What the engine is doing, as a quiet pill at the bottom right of the map. The dot pulses while
// the GPU works and a thin bar fills during the horizon trace.
import { AnimatePresence, motion } from 'motion/react'
import { fade } from '@/lib/motion'
import type { MapStatus } from './MapView'

export function StatusPill({ status, text }: { status: MapStatus; text: string }) {
  const working = status.phase !== 'idle'
  return (
    <AnimatePresence>
      {text && (
        <motion.div className="status-pill glass-quiet pointer-events-auto relative flex max-w-full items-center gap-2 overflow-hidden rounded-full py-1.5 pr-3.5 pl-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
          <span
            className="dot" aria-hidden="true"
            style={working ? { background: 'var(--dust-1)', animation: 'status-pulse 1.1s ease-in-out infinite' } : undefined}
          />
          <p className="status narrow min-w-0 text-[12px] leading-tight text-dust-2" role="status" title={text}>{text}</p>
          {status.phase === 'horizons' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/8" aria-hidden="true">
              <span className="block h-full bg-dust-1 transition-[width] duration-200" style={{ width: `${Math.round(status.progress * 100)}%` }} />
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
