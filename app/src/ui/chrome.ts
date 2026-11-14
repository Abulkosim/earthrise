// Written with AI assistance (Claude); see the README.
// How much of each edge of the full-screen map the floating panels cover, in CSS pixels.
// The panels report their own size; the map chrome (scale bar, Sun and Earth marks, hover readout)
// reads the result, either with useChromeInsets() or from the CSS variables --inset-top,
// --inset-right, --inset-bottom and --inset-left on <html>. All four are 0 under 1100 px,
// where nothing overlaps the map.
import { useEffect, useSyncExternalStore, type RefObject } from 'react'

export interface Insets { top: number; right: number; bottom: number; left: number }
type Edge = keyof Insets

let insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const listeners = new Set<() => void>()

function set(edge: Edge, px: number) {
  const v = Math.max(0, Math.round(px))
  if (insets[edge] === v) return
  insets = { ...insets, [edge]: v }
  document.documentElement.style.setProperty(`--inset-${edge}`, `${v}px`)
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** The part of the map that panels cover on each side. */
export function useChromeInsets(): Insets {
  return useSyncExternalStore(subscribe, () => insets)
}

/** A panel calls this with its own element; `active` false means it is closed or collapsed. */
export function useReportInset(edge: Edge, ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !active) { set(edge, 0); return }
    const measure = () => {
      const r = el.getBoundingClientRect()
      const floating = window.innerWidth >= 1100 && r.width > 0 && r.height > 0
      if (!floating) return set(edge, 0)
      set(edge, edge === 'top' ? r.bottom : edge === 'left' ? r.right : edge === 'right' ? window.innerWidth - r.left : window.innerHeight - r.top)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    measure()
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); set(edge, 0) }
  }, [edge, ref, active])
}
