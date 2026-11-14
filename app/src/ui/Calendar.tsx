// The landing calendar: for each possible landing date, how much of the ground in view meets the brief.
// Written with AI assistance (Claude); see the README.
import { useEffect, useRef, useState } from 'react'
import { fmtDate } from '../state'

export interface CalendarData { t0: number; stepH: number; share: Float32Array; done: number }

interface Props {
  data: CalendarData | null
  t0: number        // visible span, hours since the epoch (same as the ribbon)
  hours: number
  epochMs: number
  landing: number
  nameWidth: number // width of the ribbon's name column, so the two line up
  onLanding(h: number): void
}

const H = 44

/** A bar with rounded top corners, in CSS pixels. */
function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(2.5, w / 2, h / 2)
  g.beginPath()
  if (g.roundRect) g.roundRect(x, y, w, h, [r, r, 0, 0])
  else g.rect(x, y, w, h)
  g.fill()
}

export function Calendar(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [w, setW] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current!.parentElement!
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const d = p.data
  let peak = 0
  if (d) for (let i = 0; i < d.done; i++) if (d.share[i] > peak) peak = d.share[i]
  const idx = hover !== null && d ? Math.floor((hover - d.t0) / d.stepH) : -1

  useEffect(() => {
    const c = ref.current
    if (!c || w < 4) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(w * dpr); c.height = Math.round(H * dpr)
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, H)
    const css = getComputedStyle(c)
    const col = (n: string) => css.getPropertyValue(n).trim()
    g.fillStyle = col('--ground-3')
    g.fillRect(0, H - 1, w, 1)
    if (!d) return
    const x = (h: number) => ((h - p.t0) / p.hours) * w
    const top = Math.max(peak, 0.002)
    for (let i = 0; i < d.done; i++) {
      const s = d.share[i]
      if (!(s > 0)) continue
      const x0 = x(d.t0 + i * d.stepH), x1 = x(d.t0 + (i + 1) * d.stepH)
      const bh = Math.max(2, (s / top) * (H - 6))
      const on = p.landing >= d.t0 + i * d.stepH && p.landing < d.t0 + (i + 1) * d.stepH
      g.globalAlpha = on || i === idx ? 1 : 0.42
      g.fillStyle = col(on ? '--both' : '--dust-2')
      if (on) { g.shadowColor = 'rgba(242, 238, 230, 0.55)'; g.shadowBlur = 10 }
      bar(g, x0 + 0.75, H - 1 - bh, Math.max(1, x1 - x0 - 1.5), bh)
      g.shadowBlur = 0
    }
    g.globalAlpha = 1
    // days still being worked out
    if (d.done < d.share.length) {
      g.fillStyle = col('--ground-2')
      g.globalAlpha = 0.6
      g.fillRect(x(d.t0 + d.done * d.stepH), 0, w, H - 1)
      g.globalAlpha = 1
    }
  }, [d, w, peak, idx, p.t0, p.hours, p.landing])

  const at = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return p.t0 + ((ev.clientX - r.left) / r.width) * p.hours
  }
  const share = d && idx >= 0 && idx < d.done ? d.share[idx] : null
  const pct = (s: number) => (s === 0 ? 'none' : s < 0.001 ? 'under 0.1%' : `${(s * 100).toFixed(s < 0.1 ? 1 : 0)}%`)

  return (
    <div className="calendar" style={{ gridTemplateColumns: `${p.nameWidth}px minmax(0, 1fr)` }}>
      <p className="calendar-name">
        Ground in view that meets the brief, by landing date
        <span className="narrow">
          {hover !== null && share !== null
            ? `Land ${fmtDate(p.epochMs + (d!.t0 + idx * d!.stepH) * 3600e3)}: ${pct(share)}`
            : !d ? 'Waiting for the map…'
            : d.done < d.share.length ? `Trying every landing date… ${Math.round((d.done / d.share.length) * 100)}%`
            : peak > 0 ? `Best day: ${pct(peak)} of the ground. Click a bar to land then.` : 'No landing date in this span works anywhere in view.'}
        </span>
      </p>
      <div className="calendar-plot">
        <canvas
          ref={ref} style={{ width: '100%', height: H }} aria-hidden="true"
          onPointerMove={(ev) => setHover(at(ev))} onPointerLeave={() => setHover(null)}
          onClick={(ev) => { if (d) p.onLanding(Math.floor((at(ev as unknown as React.PointerEvent) - d.t0) / d.stepH) * d.stepH + d.t0) }}
        />
      </div>
    </div>
  )
}
