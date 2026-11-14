// Written with AI assistance (Claude); see the README.
// The map note: one pill under the layer dock that says how much of the ground in view meets the
// brief, or what the map is working on.
import { AnimatePresence, motion } from 'motion/react'
import { pop } from '@/lib/motion'
import { fmtDate } from '../state'
import type { MapStatus } from './MapView'

export function MapNote({ status, show, landingMs }: { status: MapStatus; show: boolean; landingMs: number }) {
  const working = status.phase !== 'idle'
  const visible = show && (working || status.pass !== null)
  const pass = status.pass ?? 0
  return (
    <AnimatePresence>
      {visible && (
        <motion.p key="note" className="map-note glass-quiet pointer-events-auto max-w-full rounded-full px-4 py-2 text-center text-[13px] leading-snug text-dust-1" role="status" {...pop}>
          {working ? (
            status.phase === 'horizons'
              ? `Tracing the horizon around every point in view… ${Math.round(status.progress * 100)}%`
              : status.phase === 'mission' ? 'Running the stay at every point…' : 'Loading terrain…'
          ) : pass === 0 ? (
            `No ground in view meets the brief for a landing on ${fmtDate(landingMs)}. Drag the stay in the timeline to try other dates, or relax a need.`
          ) : (
            <>
              <span className="mr-0.5 align-[-1px] text-[19px] leading-none font-semibold tabular-nums">{pass < 0.001 ? 'Under 0.1' : (pass * 100).toFixed(pass < 0.1 ? 1 : 0)}%</span>
              {` of the ground in view meets the brief for a landing on ${fmtDate(landingMs)}.`}
            </>
          )}
        </motion.p>
      )}
    </AnimatePresence>
  )
}
