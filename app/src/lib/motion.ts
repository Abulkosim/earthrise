// Written with AI assistance (Claude); see the README.
// Motion presets, so every panel moves the same way. Use these instead of new numbers.
import type { Transition } from 'motion/react'

/** Anything that moves in space: panels, the sheet, the dock, the sliding pills. */
export const spring: Transition = { type: 'spring', stiffness: 320, damping: 32 }
/** A lighter, quicker spring for small things: chips, dots, icon swaps. */
export const springSnappy: Transition = { type: 'spring', stiffness: 520, damping: 34 }
/** Fades: 160 to 220 ms. */
export const fade: Transition = { duration: 0.18, ease: 'easeOut' }

type Side = 'top' | 'bottom' | 'left' | 'right'

// The one entrance on load is a CSS animation (.enter in shell.css): it runs off the main thread,
// so it does not compete with the first horizon trace.

/** A panel that slides in from a side and out again (AnimatePresence child). */
export function slide(from: Side, distance = 28) {
  const off = from === 'left' ? { x: -distance } : from === 'right' ? { x: distance } : from === 'top' ? { y: -distance } : { y: distance }
  return {
    initial: { opacity: 0, ...off },
    animate: { opacity: 1, x: 0, y: 0 },
    exit: { opacity: 0, ...off, transition: { ...spring, stiffness: 420 } },
    transition: spring,
  }
}

/** Small pills that pop in under the dock: the map note, the legend. */
export const pop = {
  initial: { opacity: 0, y: -6, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.97, transition: fade },
  transition: springSnappy,
}
