// Written with AI assistance (Claude); see the README.
// The two live checks of the GPU engine, shared by the validation page and the developer page (verify.html).
import { loadGrid, NODATA_M } from './engine/data'
import { DEFAULT_MISSION, type Engine } from './engine/engine'

export type Progress = (done: number, total: number, label: string) => void

interface Fixtures {
  mast: number; naz: number; window: { hours0: number; steps: number; dt_hours: number }
  points: { name: string; x: number; y: number; ground: number; horizon: number[]; lit_mean: number; lit_any: number; earth_clear: number }[]
}

export interface PointRow {
  name: string
  groundErr: number     // engine ground height minus reference, m
  mean: number; rms: number; p95: number; max: number // |horizon difference| over all azimuths, deg
  litRef: number; lit: number       // sunlit share, 0..1 (NaN when the field step is skipped)
  earthRef: number; earth: number   // Earth-contact share, 0..1
  probeMs: number; bakeMs: number; evalMs: number
}
export interface HorizonResult {
  rows: PointRow[]
  mean: number; p95: number; p99: number; max: number // all azimuths of all points, deg
  worstLit: number; worstEarth: number                // largest |engine - reference| share over the points
  ms: number
}
export interface HorizonOptions {
  mpp?: number      // view scale, m per canvas pixel (sets which terrain tiles are loaded)
  fieldW?: number   // horizon field width in pixels; any width works, the point sits on a pixel centre
  field?: boolean   // false: horizons only, no sunlit and contact shares
  growth?: number; fine?: number
  onRow?: (r: PointRow) => void // called as each point finishes
}

const sortedAt = (a: number[], q: number) => a[Math.min(a.length - 1, Math.floor(a.length * q))]

/**
 * 24 south-pole points against the Python reference (fixtures-v2.json, pipeline/scripts/make_fixtures.py):
 * the horizon in 720 directions, then the sunlit and Earth-contact shares over two lunar days.
 */
export async function horizonCheck(eng: Engine, onProgress?: Progress, o: HorizonOptions = {}): Promise<HorizonResult> {
  const t0 = performance.now()
  const r = await fetch(eng.data.base + 'fixtures-v2.json')
  if (!r.ok) throw new Error(`The reference answers (fixtures-v2.json) did not load: ${r.status}.`)
  const fx: Fixtures = await r.json()
  if (o.growth) eng.growth = o.growth
  if (o.fine) eng.fine = o.fine
  // 5 m per pixel: a view that small loads the 5 m tiles, the same terrain the reference used
  const mpp = o.mpp ?? 5, fieldW = o.fieldW ?? 512, doField = o.field ?? true
  const all: number[] = [], rows: PointRow[] = []
  for (const [k, p] of fx.points.entries()) {
    onProgress?.(k, fx.points.length, p.name)
    eng.setView(p.x, p.y, mpp)
    await eng.loadFocus()
    const tp = performance.now()
    const pr = await eng.probe([{ x: p.x, y: p.y, mast: fx.mast }], fx.naz)
    const probeMs = performance.now() - tp
    const err = Array.from(pr.el, (v, i) => Math.abs(v - p.horizon[i]))
    all.push(...err)
    const sorted = [...err].sort((a, b) => a - b)
    let lit = NaN, earth = NaN
    if (doField) {
      // shift the view so that the point sits on a field pixel centre
      const cell = eng.view.w / fieldW
      eng.setView(p.x + cell / 2, p.y + (cell / 2) * (eng.canvas.height / eng.canvas.width), mpp)
      if (!(await eng.bake(fx.mast, fieldW))) throw new Error('The horizon computation was interrupted.')
      const ok = await eng.evaluate(fx.window.hours0, fx.window.steps, fx.window.dt_hours, { ...DEFAULT_MISSION, mast: fx.mast, litMin: 1e-6, needDsn: false })
      if (!ok) throw new Error('The mission evaluation was interrupted.')
      const m = eng.readMetrics(p.x, p.y)
      if (!m) throw new Error(`${p.name} fell outside the computed field.`)
      lit = m.lit; earth = m.comm
    }
    const row: PointRow = {
      name: p.name, groundErr: pr.ground[0] - p.ground,
      mean: err.reduce((a, b) => a + b, 0) / err.length, rms: Math.sqrt(err.reduce((a, b) => a + b * b, 0) / err.length),
      p95: sortedAt(sorted, 0.95), max: sorted[sorted.length - 1],
      litRef: p.lit_mean, lit, earthRef: p.earth_clear, earth, probeMs, bakeMs: eng.stats.bakeMs, evalMs: eng.stats.evalMs,
    }
    rows.push(row)
    o.onRow?.(row)
  }
  onProgress?.(fx.points.length, fx.points.length, '')
  all.sort((a, b) => a - b)
  return {
    rows,
    mean: all.reduce((a, b) => a + b, 0) / all.length, p95: sortedAt(all, 0.95), p99: sortedAt(all, 0.99), max: all[all.length - 1],
    worstLit: Math.max(...rows.map((x) => Math.abs(x.lit - x.litRef))),
    worstEarth: Math.max(...rows.map((x) => Math.abs(x.earth - x.earthRef))),
    ms: performance.now() - t0,
  }
}

export interface GoddardStats {
  n: number; bias: number; mae: number; rmse: number; corr: number; within5: number; meanOurs: number; meanTheirs: number
}
/** Permanent shadow: compared points that never see any part of the Sun, in their map (value 0) and in ours (lit-any count 0). */
export interface PsrStats {
  theirs: number; ours: number; both: number // point counts
  oursOfTheirs: number // of their permanent shadow, the share that is permanent shadow in ours, 0..1 (NaN when they have none)
  theirsOfOurs: number // of our permanent shadow, the share that is permanent shadow in theirs, 0..1 (NaN when we have none)
}
export interface GoddardResult {
  sun: GoddardStats; earth: GoddardStats
  psr: PsrStats
  w: number; h: number             // field size in pixels
  ours: { sun: Float32Array; earth: Float32Array }   // 0..1, row 0 at the north (top) of the field
  theirs: { sun: Float32Array; earth: Float32Array } // NaN outside their map
  years: number; dt: number; steps: number; cell: number
  bakeMs: number; evalMs: number; source: 'crop' | 'full'
}
export interface GoddardOptions {
  cx?: number; cy?: number  // field centre, map metres
  cell?: number             // m per field pixel
  fieldW?: number
  years?: number; dt?: number
  full?: boolean            // read the whole 5058 px maps (61 MB) even when the crop covers the field
}

interface GridInfo { file: string; n: number; offset?: number }
const FULL_N = 5058, FULL_HALF = 2529, CROP_N = 1024

/**
 * Our long-term average visibility against NASA Goddard's published maps (AVGVISIB_85S_060M_201608,
 * Mazarico et al. 2011 method). Observer on the surface; the Earth counts when any part of its disc shows.
 * Also compares permanent shadow: the points that never see any part of the Sun in each map.
 */
export async function goddardCheck(eng: Engine, onProgress?: Progress, o: GoddardOptions = {}): Promise<GoddardResult> {
  const cx = o.cx ?? 0, cy = o.cy ?? 0, fieldW = o.fieldW ?? 512, cell = o.cell ?? 80
  const years = o.years ?? 18.6, dt = o.dt ?? 12
  const steps = Math.round((years * 365.25 * 24) / dt)
  const half = (cell * fieldW) / 2
  const cropHalf = (CROP_N / 2) * 60
  const useCrop = !o.full && Math.max(Math.abs(cx) + half, Math.abs(cy) + half) <= cropHalf
  const val = (eng.data.manifest as unknown as { validation?: Record<string, GridInfo> }).validation ?? {}
  const grid = (body: 'sun' | 'earth'): GridInfo =>
    (useCrop ? val[`${body}_crop`] : val[body]) ??
    (useCrop ? { file: `validation/avgvisib_${body}_crop.bin.gz`, n: CROP_N, offset: (FULL_N - CROP_N) / 2 } : { file: `validation/avgvisib_${body}.bin.gz`, n: FULL_N })
  onProgress?.(0, 4, 'Loading the published maps')
  const [refSun, refEarth] = await Promise.all((['sun', 'earth'] as const).map(async (b) => {
    const g = grid(b)
    try { return { g, a: await loadGrid(eng.data.base + g.file, g.n) } }
    catch (e) { throw new Error(`NASA Goddard's ${b === 'sun' ? 'Sun' : 'Earth'} map did not load (${(e as Error).message}).`) }
  }))
  onProgress?.(1, 4, 'Computing horizons')
  eng.setView(cx, cy, (cell * fieldW) / eng.canvas.width)
  await eng.loadFocus()
  if (!(await eng.bake(0, fieldW, (f) => onProgress?.(1 + f, 4, 'Computing horizons')))) throw new Error('The horizon computation was interrupted.')
  onProgress?.(2, 4, `Running ${years} years in ${dt} hour steps`)
  // Earth: the published map counts any part of the disc, so the centre may sit 0.95 deg below the terrain
  const ok = await eng.evaluate(0, steps, dt, { ...DEFAULT_MISSION, mast: 0, litMin: 1e-6, needDsn: false, earthMargin: -0.95 },
    (f) => onProgress?.(2 + f, 4, `Running ${years} years in ${dt} hour steps`))
  if (!ok) throw new Error('The long-term run was interrupted.')
  const [w, h] = eng.fieldPx, f = eng.field!
  const res = { ours: {} as GoddardResult['ours'], theirs: {} as GoddardResult['theirs'], stats: {} as Record<'sun' | 'earth', GoddardStats> }
  let psrTheirs = 0, psrOurs = 0, psrBoth = 0
  for (const [body, ref] of [['sun', refSun], ['earth', refEarth]] as const) {
    const st = body === 'sun' ? eng.readState(2) : eng.readState(0) // litAny, comm counts in channel 3
    const n0 = ref.g.n, off = ref.g.offset ?? 0 // first row and column of the file within the full map
    const ours = new Float32Array(w * h), theirs = new Float32Array(w * h).fill(NaN)
    let n = 0, sd = 0, sad = 0, sq = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, within5 = 0
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const count = st[(j * w + i) * 4 + 3], a = count / steps
      const top = (h - 1 - j) * w + i // readState rows start at the bottom of the field
      ours[top] = a
      const x = f.x + ((i + 0.5) / w) * f.w, y = f.y + ((j + 0.5) / h) * f.h
      const c = Math.floor(x / 60 + FULL_HALF) - off, r = Math.floor(FULL_HALF - y / 60) - off
      if (c < 0 || r < 0 || c >= n0 || r >= n0) continue
      const raw = ref.a[r * n0 + c]
      if (raw === NODATA_M) continue
      const b = raw * 2 * 0.00004 // loadGrid halves the stored integers (height scale); the map scale is 0.00004
      theirs[top] = b
      const d = a - b
      n++; sd += d; sad += Math.abs(d); sq += d * d; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b
      if (Math.abs(d) <= 0.05) within5++
      if (body === 'sun') {
        // never lit: a stored 0 in their map, no step with any part of the Sun in ours
        const t = raw === 0, o = count === 0
        if (t) psrTheirs++
        if (o) psrOurs++
        if (t && o) psrBoth++
      }
    }
    const corr = (n * sab - sa * sb) / Math.sqrt((n * saa - sa * sa) * (n * sbb - sb * sb))
    res.stats[body] = { n, bias: sd / n, mae: sad / n, rmse: Math.sqrt(sq / n), corr, within5: within5 / n, meanOurs: sa / n, meanTheirs: sb / n }
    res.ours[body] = ours; res.theirs[body] = theirs
  }
  onProgress?.(4, 4, '')
  return {
    sun: res.stats.sun, earth: res.stats.earth,
    psr: { theirs: psrTheirs, ours: psrOurs, both: psrBoth, oursOfTheirs: psrBoth / psrTheirs, theirsOfOurs: psrBoth / psrOurs },
    w, h, ours: res.ours, theirs: res.theirs,
    years, dt, steps, cell, bakeMs: eng.stats.bakeMs, evalMs: eng.stats.evalMs, source: useCrop ? 'crop' : 'full',
  }
}

/** A plain-words reason for an error thrown by the engine or the checks. */
// ---- a published table ---------------------------------------------------
export interface BarkerRow {
  roi: number; mast: number; pixels: number
  avg: number; lcipDays: number; lcspDays: number           // ours, averaged over the region's pixels
  paperAvgP1: number; paperLcipP1: number; paperLcspP99: number
}
export interface BarkerResult { rows: BarkerRow[]; ms: number; source: string }

/**
 * Barker et al. 2021, Table 2: seven regions on the connecting ridge, 1 Jan 2024 to 1 Jan 2026, hourly,
 * at 1 m and 5 m above the surface. We trace the horizon at every 5 m pixel of each region with the
 * engine's probe and run the two years on the CPU. Their numbers are percentiles over 100 error clones
 * of the terrain (1st for average illumination and the longest lit period, 99th for the longest
 * shadow); ours is one run on the nominal terrain, with a uniform Sun disk where theirs is limb darkened.
 */
export async function barkerCheck(eng: Engine, onProgress?: Progress): Promise<BarkerResult> {
  const t00 = performance.now()
  const r = await fetch(eng.data.base + 'validation/barker-site1.json')
  if (!r.ok) throw new Error(`The published table (barker-site1.json) did not load: ${r.status}.`)
  const fx = await r.json() as {
    source: string; window_utc: [string, string]; step_hours: number
    rois: { roi: number; points_m: [number, number][]; paper: Record<'1m' | '5m', { avg_p1: number; lcip_p1_days: number; lcsp_p99_days: number }> }[]
  }
  const data = eng.data, R2D = 180 / Math.PI
  const h0 = data.hours(Date.parse(fx.window_utc[0] + 'Z')), h1 = data.hours(Date.parse(fx.window_utc[1] + 'Z'))
  const n = Math.round((h1 - h0) / fx.step_hours)
  // the Sun for every step, once: unit vector, angular radius (deg), share hidden by the Earth
  const sun = new Float64Array(n * 5), e = new Float64Array(9)
  for (let k = 0; k < n; k++) {
    data.sample(h0 + k * fx.step_hours, e)
    sun.set([e[0], e[1], e[2], Math.asin(695700 / e[3]) * R2D, Math.min(1, e[8])], k * 5)
  }
  const rows: BarkerRow[] = []
  const total = fx.rois.length * 2
  let done = 0
  for (const roi of fx.rois) {
    for (const mast of [1, 5]) {
      onProgress?.(done++, total, `region ${roi.roi}, ${mast} m`)
      let sAvg = 0, sLit = 0, sDark = 0
      for (let b0 = 0; b0 < roi.points_m.length; b0 += 200) {
        const batch = roi.points_m.slice(b0, b0 + 200)
        const pr = await eng.probe(batch.map(([x, y]) => ({ x, y, mast })), 720)
        for (let i = 0; i < batch.length; i++) {
          const [x, y] = batch[i]
          const rho = Math.hypot(x, y), c = 2 * Math.atan(rho / (2 * 1737400)), sl = x / rho, cl = y / rho
          const up = [Math.sin(c) * cl, Math.sin(c) * sl, -Math.cos(c)], east = [-sl, cl, 0]
          const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]]
          const hz = pr.el.subarray(i * 720, (i + 1) * 720)
          let acc = 0, lit = 0, dark = 0, maxLit = 0, maxDark = 0
          for (let k = 0; k < n; k++) {
            const sx = sun[k * 5], sy = sun[k * 5 + 1], sz = sun[k * 5 + 2]
            const el = Math.asin(sx * up[0] + sy * up[1] + sz * up[2]) * R2D
            let az = Math.atan2(sx * east[0] + sy * east[1] + sz * east[2], sx * north[0] + sy * north[1] + sz * north[2]) * R2D
            if (az < 0) az += 360
            const a = az * 2, i0 = Math.floor(a), f = a - i0
            const hel = hz[i0 % 720] * (1 - f) + hz[(i0 + 1) % 720] * f
            const z = Math.min(1, Math.max(-1, (hel - el) / sun[k * 5 + 3]))
            const frac = ((Math.acos(z) - z * Math.sqrt(1 - z * z)) / Math.PI) * (1 - sun[k * 5 + 4])
            acc += frac
            if (frac > 0) { lit++; dark = 0; if (lit > maxLit) maxLit = lit } else { dark++; lit = 0; if (dark > maxDark) maxDark = dark }
          }
          sAvg += acc / n; sLit += maxLit; sDark += maxDark
        }
      }
      const px = roi.points_m.length, p = roi.paper[mast === 1 ? '1m' : '5m']
      rows.push({
        roi: roi.roi, mast, pixels: px, avg: (sAvg / px) * 100, lcipDays: (sLit / px) * fx.step_hours / 24, lcspDays: (sDark / px) * fx.step_hours / 24,
        paperAvgP1: p.avg_p1, paperLcipP1: p.lcip_p1_days, paperLcspP99: p.lcsp_p99_days,
      })
    }
  }
  onProgress?.(total, total, 'done')
  return { rows, ms: performance.now() - t00, source: fx.source }
}

export function explain(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/WebGL 2/.test(m)) return 'This browser does not offer WebGL 2, which the engine needs. A recent Chrome, Edge, Firefox or Safari on a desktop computer has it.'
  if (/float textures/.test(m)) return `${m} The engine stores horizons and results as 32-bit floats on the GPU, so the check cannot run here. Most desktop GPUs can; many phones cannot.`
  if (/CONTEXT_LOST|context lost/i.test(m)) return 'The browser took the GPU away from the page (context lost). Reload and try again with fewer tabs open.'
  if (/Failed to fetch|NetworkError|did not load|: 404/.test(m)) return `A data file did not load: ${m}`
  return m
}
