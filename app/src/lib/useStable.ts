// Written with AI assistance (Claude); see the README.
import { useLayoutEffect, useMemo, useRef } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fns = Record<string, (...args: any[]) => unknown>

/**
 * Handlers that keep their identity from render to render and always call the latest version.
 * The app shell re-renders on every progress tick of the map engine; memoised panels that get
 * their handlers through this do not re-render with it, which keeps the horizon trace fast.
 */
export function useStable<T extends Fns>(fns: T): T {
  const latest = useRef(fns)
  useLayoutEffect(() => { latest.current = fns })
  return useMemo(() => {
    const out: Fns = {}
    for (const k of Object.keys(latest.current)) out[k] = (...args: unknown[]) => latest.current[k](...args)
    return out as T
    // the set of names is fixed for the life of the component
  }, [])
}
