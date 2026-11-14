// Written with AI assistance (Claude); see the README.
// Compares the GPU engine with the Python reference model (fixtures.json) and prints the errors.
// URL parameters: mode=goddard (cx, cy, w, cell, years, dt, full=1) or the 24-point check (growth, fine, mpp, w, field=0).
import { barkerCheck, explain, goddardCheck, horizonCheck } from './checks'
import { DataStore } from './engine/data'
import { Engine } from './engine/engine'

const out = document.getElementById('out')!
const lines: string[] = []
const log = (s: string) => { lines.push(s); out.textContent = lines.join('\n'); console.log('[verify] ' + s) }
const q = new URLSearchParams(location.search)
const num = (k: string) => (q.get(k) === null ? undefined : Number(q.get(k)))
const setResult = (v: unknown) => { (window as unknown as { __verify: unknown }).__verify = v }

// Our 18.6-year average visibility against NASA Goddard's published maps (Mazarico et al. 2011 method).
async function goddard(eng: Engine) {
  const o = { cx: num('cx'), cy: num('cy'), fieldW: num('w'), cell: num('cell'), years: num('years'), dt: num('dt'), full: q.get('full') === '1' }
  log(`Goddard check: centre ${o.cx ?? 0}, ${o.cy ?? 0} m, ${o.cell ?? 80} m cells, ${o.fieldW ?? 512} px field, ${o.years ?? 18.6} years at ${o.dt ?? 12} h steps, observer on the surface`)
  let last = ''
  const r = await goddardCheck(eng, (_d, _t, label) => { if (label && label !== last) { last = label; log(label) } }, o)
  log(`maps: ${r.source}, ${r.steps} steps; horizons ${(r.bakeMs / 1000).toFixed(1)} s, run ${(r.evalMs / 1000).toFixed(1)} s`)
  for (const body of ['sun', 'earth'] as const) {
    const s = r[body]
    log(`${body.padEnd(5)}: ${s.n} points, ours ${(s.meanOurs * 100).toFixed(2)}% vs published ${(s.meanTheirs * 100).toFixed(2)}% on average; bias ${(s.bias * 100).toFixed(2)} pts, mean abs diff ${(s.mae * 100).toFixed(2)} pts, rms ${(s.rmse * 100).toFixed(2)} pts, correlation ${s.corr.toFixed(4)}, within 5 pts: ${(s.within5 * 100).toFixed(1)}%`)
  }
  eng.draw({ mode: 'metric', hours: 0, metric: 'litAny', range: [0, 1], hue: [0.953, 0.8, 0.455] })
  setResult({ done: true, goddard: { bakeMs: r.bakeMs, evalMs: r.evalMs, sun: r.sun, earth: r.earth } })
  log('DONE')
}

async function points(eng: Engine) {
  const o = { growth: num('growth'), fine: num('fine'), mpp: num('mpp'), fieldW: num('w'), field: q.get('field') !== '0' }
  log(`growth ${o.growth ?? eng.growth}, fine ${o.fine ?? eng.fine}, view ${o.mpp ?? 20} m/px, field ${o.fieldW ?? 512}px`)
  const r = await horizonCheck(eng, (d, t, name) => { if (name) log(`${d + 1}/${t} ${name}`) }, o)
  log('point                    ground err   horizon err (deg): mean   rms    p95    max  | lit ref  gpu   | earth ref  gpu  | bake s  eval s')
  const f = (v: number, w = 6, d = 3) => v.toFixed(d).padStart(w)
  for (const p of r.rows)
    log(`${p.name.padEnd(24)} ${f(p.groundErr, 7, 2)} m   ${f(p.mean)} ${f(p.rms)} ${f(p.p95)} ${f(p.max)}  | ${f(p.litRef * 100, 5, 1)} ${f(p.lit * 100, 5, 1)} | ${f(p.earthRef * 100, 5, 1)} ${f(p.earth * 100, 5, 1)}  | ${f(p.bakeMs / 1000, 5, 1)} ${f(p.evalMs / 1000, 5, 2)}`)
  log(`ALL  horizon abs error: mean ${r.mean.toFixed(4)}  p95 ${r.p95.toFixed(4)}  p99 ${r.p99.toFixed(4)}  max ${r.max.toFixed(3)} deg`)
  if (o.field) eng.draw({ mode: 'metric', hours: 0, metric: 'lit', range: [0, 1], hue: [0.953, 0.8, 0.455] })
  setResult({ done: true, res: r.rows, mean: r.mean })
  log('DONE')
}

async function main() {
  const data = new DataStore()
  await data.init()
  const eng = new Engine(document.getElementById('c') as HTMLCanvasElement, data)
  if (q.get('fine')) eng.fine = Number(q.get('fine'))
  if (q.get('mode') === 'barker') return barker(eng)
  return q.get('mode') === 'goddard' ? goddard(eng) : points(eng)
}

// The engine against Barker et al. 2021, Table 2 (seven regions on the connecting ridge, 2024-2026).
async function barker(eng: Engine) {
  log('Barker et al. 2021, Table 2, case A. Ours: one run on the nominal terrain, mean over the region.')
  log('Theirs: 1st percentile over 100 terrain clones (average, longest lit), 99th percentile (longest shadow).')
  log('region height pixels | avg ill %: ours  paper p1 | longest lit d: ours  paper p1 | longest shadow d: ours  paper p99')
  const r = await barkerCheck(eng, (d, t, label) => { if (d < t) log(`${d + 1}/${t} ${label}`) })
  const f = (v: number, w = 7, d = 2) => v.toFixed(d).padStart(w)
  for (const x of r.rows) log(`RoI ${x.roi}  ${x.mast} m  ${String(x.pixels).padStart(4)} | ${f(x.avg)} ${f(x.paperAvgP1)} | ${f(x.lcipDays)} ${f(x.paperLcipP1)} | ${f(x.lcspDays)} ${f(x.paperLcspP99)}`)
  log(`focus ${eng.data.hasLevel('t5') ? '5 m tiles' : '20 m tiles'}; ${(r.ms / 1000).toFixed(0)} s`)
  setResult({ done: true, barker: r.rows })
  log('DONE')
}
main().catch((e) => { log('ERROR ' + explain(e) + '\n' + (e?.stack ?? '')); setResult({ done: true, error: String(e) }) })
