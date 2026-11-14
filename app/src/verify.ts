// Compares the GPU engine with the Python reference model (fixtures.json) and prints the errors.
// Written with AI assistance (Claude); see the README.
import { DataStore } from './engine/data'
import { DEFAULT_MISSION, Engine } from './engine/engine'

interface Fx {
  mast: number; naz: number; window: { hours0: number; steps: number; dt_hours: number }
  points: { name: string; x: number; y: number; ground: number; horizon: number[]; lit_mean: number; lit_any: number; earth_clear: number }[]
}
const out = document.getElementById('out')!
const lines: string[] = []
const log = (s: string) => { lines.push(s); out.textContent = lines.join('\n'); console.log('[verify] ' + s) }
const q = new URLSearchParams(location.search)

async function main() {
  const data = new DataStore()
  await data.init()
  const fx: Fx = await (await fetch(data.base + 'fixtures.json')).json()
  const eng = new Engine(document.getElementById('c') as HTMLCanvasElement, data)
  if (q.get('growth')) eng.growth = Number(q.get('growth'))
  if (q.get('fine')) eng.fine = Number(q.get('fine'))
  const mpp = Number(q.get('mpp') ?? 20)
  const doField = q.get('field') !== '0'
  const fieldW = Number(q.get('w') ?? 512)
  log(`growth ${eng.growth}, fine ${eng.fine}, view ${mpp} m/px, field ${fieldW}px`)
  log('point                    ground err   horizon err (deg): mean   rms    p95    max  | lit ref  gpu   | earth ref  gpu  | bake s  eval s')
  const all: number[] = []
  const res: Record<string, unknown>[] = []
  for (const p of fx.points) {
    // put the point exactly on a field pixel centre
    eng.setView(p.x, p.y, mpp)
    await eng.loadFocus()
    const t0 = performance.now()
    const pr = await eng.probe([{ x: p.x, y: p.y, mast: fx.mast }], fx.naz)
    const probeMs = performance.now() - t0
    const err = Array.from(pr.el, (v, i) => Math.abs(v - p.horizon[i]))
    all.push(...err)
    const sorted = [...err].sort((a, b) => a - b)
    const mean = err.reduce((a, b) => a + b, 0) / err.length
    const rms = Math.sqrt(err.reduce((a, b) => a + b * b, 0) / err.length)
    let lit = NaN, earth = NaN
    if (doField) {
      const cell = (eng.view.w / fieldW)
      // shift the view so that the point sits on a cell centre
      eng.setView(p.x + cell / 2, p.y + cell / 2 * (eng.canvas.height / eng.canvas.width), mpp)
      await eng.bake(fx.mast, fieldW)
      await eng.evaluate(fx.window.hours0, fx.window.steps, fx.window.dt_hours, { ...DEFAULT_MISSION, mast: fx.mast, litMin: 1e-6, needDsn: false })
      const m = eng.readMetrics(p.x, p.y)!
      lit = m.lit; earth = m.comm
      eng.renderNow(fx.window.hours0 + 200, fx.mast)
      eng.draw({ mode: 'now', hours: fx.window.hours0 + 200 })
    }
    const r = {
      name: p.name, groundErr: pr.ground[0] - p.ground, mean, rms, p95: sorted[Math.floor(err.length * 0.95)], max: sorted[err.length - 1],
      litRef: p.lit_mean, lit, earthRef: p.earth_clear, earth, probeMs, bakeMs: eng.stats.bakeMs, evalMs: eng.stats.evalMs,
    }
    res.push(r)
    const f = (v: number, w = 6, d = 3) => v.toFixed(d).padStart(w)
    log(`${p.name.padEnd(24)} ${f(r.groundErr, 7, 2)} m   ${f(mean)} ${f(rms)} ${f(r.p95)} ${f(r.max)}  | ${f(p.lit_mean * 100, 5, 1)} ${f(lit * 100, 5, 1)} | ${f(p.earth_clear * 100, 5, 1)} ${f(earth * 100, 5, 1)}  | ${f(eng.stats.bakeMs / 1000, 5, 1)} ${f(eng.stats.evalMs / 1000, 5, 2)}`)
  }
  all.sort((a, b) => a - b)
  const mean = all.reduce((a, b) => a + b, 0) / all.length
  log(`ALL  horizon abs error: mean ${mean.toFixed(4)}  p95 ${all[Math.floor(all.length * 0.95)].toFixed(4)}  p99 ${all[Math.floor(all.length * 0.99)].toFixed(4)}  max ${all[all.length - 1].toFixed(3)} deg`)
  ;(window as unknown as { __verify: unknown }).__verify = { done: true, res, mean }
  log('DONE')
}
main().catch((e) => { log('ERROR ' + (e?.stack ?? e)); (window as unknown as { __verify: unknown }).__verify = { done: true, error: String(e) } })
