// Compares the GPU engine with the Python reference model (fixtures.json) and prints the errors.
// Written with AI assistance (Claude); see the README.
import { DataStore, loadGrid } from './engine/data'
import { DEFAULT_MISSION, Engine } from './engine/engine'

interface Fx {
  mast: number; naz: number; window: { hours0: number; steps: number; dt_hours: number }
  points: { name: string; x: number; y: number; ground: number; horizon: number[]; lit_mean: number; lit_any: number; earth_clear: number }[]
}
const out = document.getElementById('out')!
const lines: string[] = []
const log = (s: string) => { lines.push(s); out.textContent = lines.join('\n'); console.log('[verify] ' + s) }
const q = new URLSearchParams(location.search)

// Our 18.6-year average visibility against NASA Goddard's published maps (Mazarico et al. 2011 method).
async function goddard(data: DataStore) {
  const eng = new Engine(document.getElementById('c') as HTMLCanvasElement, data)
  const cx = Number(q.get('cx') ?? 0), cy = Number(q.get('cy') ?? 0), fieldW = Number(q.get('w') ?? 512)
  const cell = Number(q.get('cell') ?? 80)
  const mpp = (cell * fieldW) / eng.canvas.width
  const years = Number(q.get('years') ?? 18.6), dt = Number(q.get('dt') ?? 12)
  const steps = Math.round((years * 365.25 * 24) / dt)
  log(`Goddard check: centre ${cx}, ${cy} m, ${cell} m cells, ${fieldW} px field, ${years} years at ${dt} h steps (${steps} steps), observer on the surface`)
  eng.setView(cx, cy, mpp)
  await eng.loadFocus()
  await eng.bake(0, fieldW)
  log(`horizons: ${(eng.stats.bakeMs / 1000).toFixed(1)} s`)
  const [w, h] = eng.fieldPx, f = eng.field!
  const res: Record<string, unknown> = { bakeMs: eng.stats.bakeMs }
  for (const body of ['sun', 'earth'] as const) {
    const ref = await loadGrid(`${data.base}validation/avgvisib_${body}.bin.gz`, 5058)
    // Earth: the published map counts any part of the disc, so the centre may sit 0.95 deg below the terrain
    await eng.evaluate(0, steps, dt, { ...DEFAULT_MISSION, mast: 0, litMin: 1e-6, needDsn: false, earthMargin: -0.95 })
    const st = body === 'sun' ? eng.readState(2) : eng.readState(0)
    let n = 0, sd = 0, sad = 0, sq = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, within5 = 0
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const ours = st[(j * w + i) * 4 + 3] / steps
      const x = f.x + ((i + 0.5) / w) * f.w, y = f.y + ((j + 0.5) / h) * f.h
      const c = Math.floor(x / 60 + 2529), r = Math.floor(2529 - y / 60)
      if (c < 0 || r < 0 || c >= 5058 || r >= 5058) continue
      const theirs = ref[r * 5058 + c] * 2 * 0.00004
      const d = ours - theirs
      n++; sd += d; sad += Math.abs(d); sq += d * d; sa += ours; sb += theirs; saa += ours * ours; sbb += theirs * theirs; sab += ours * theirs
      if (Math.abs(d) <= 0.05) within5++
    }
    const corr = (n * sab - sa * sb) / Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb))
    const r = { n, bias: sd / n, mae: sad / n, rmse: Math.sqrt(sq / n), corr, within5: within5 / n, meanOurs: sa / n, meanTheirs: sb / n, evalMs: eng.stats.evalMs }
    res[body] = r
    log(`${body.padEnd(5)}: ${n} points, ours ${(r.meanOurs * 100).toFixed(2)}% vs published ${(r.meanTheirs * 100).toFixed(2)}% on average; bias ${(r.bias * 100).toFixed(2)} pts, mean abs diff ${(r.mae * 100).toFixed(2)} pts, rms ${(r.rmse * 100).toFixed(2)} pts, correlation ${corr.toFixed(4)}, within 5 pts: ${(r.within5 * 100).toFixed(1)}%  (${(eng.stats.evalMs / 1000).toFixed(1)} s)`)
    if (body === 'sun') eng.draw({ mode: 'metric', hours: 0, metric: 'litAny', range: [0, 1], hue: [0.953, 0.8, 0.455] })
  }
  ;(window as unknown as { __verify: unknown }).__verify = { done: true, goddard: res }
  log('DONE')
}

async function main() {
  const data = new DataStore()
  await data.init()
  if (q.get('mode') === 'goddard') return goddard(data)
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
