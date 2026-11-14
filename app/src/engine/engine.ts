// The field engine: terrain horizons and mission metrics for every pixel of the view, on the GPU.
// Written with AI assistance (Claude); see the README.
import { DataStore, NODATA_M, TILE, type TileLevel } from './data'
import * as G from './glsl'

/** Map rectangle in metres: left, bottom, width, height. */
export interface Rect { x: number; y: number; w: number; h: number }

export interface Mission {
  mast: number        // height of the solar array / antenna above ground, m
  litMin: number      // Sun disk fraction that counts as "lit"
  earthMargin: number // degrees the Earth's centre must clear the horizon
  needDsn: boolean    // also require a DSN complex with the Moon above its mask
  arrayW: number      // array output in full Sun, W
  loadLitW: number    // load while lit, W
  loadDarkW: number   // load in the dark (survival heaters), W
  batteryWh: number
  startWh: number
}
export const DEFAULT_MISSION: Mission = {
  mast: 2, litMin: 0.5, earthMargin: 0, needDsn: true,
  arrayW: 400, loadLitW: 250, loadDarkW: 60, batteryWh: 1500, startWh: 1500,
}

export const METRICS = ['lit', 'longestDark', 'comm', 'longestCommGap', 'hoursAlive', 'litAndComm', 'litAny'] as const
export type Metric = (typeof METRICS)[number]

const FOCUS_N = 2048
const UNITS: Record<string, number> = {
  uFar: 0, uMid: 1, uFocus: 2, uHorizon: 3, uEphem: 4, uS0: 5, uS1: 6, uS2: 7, uM0: 5, uM1: 6, uM2: 7, uNow: 8, uPoints: 9,
}
const CHUNK = 96

interface Prog { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }
interface Focus { level: TileLevel; res: number; left: number; top: number; size: number }

export class Engine {
  gl: WebGL2RenderingContext
  data: DataStore
  canvas: HTMLCanvasElement
  view: Rect = { x: -40000, y: -40000, w: 80000, h: 80000 }
  field: Rect | null = null       // rect the horizon cache covers
  fieldPx: [number, number] = [0, 0]
  nowRect: Rect | null = null
  metricRect: Rect | null = null
  metricSteps = 0
  metricHours = 0
  focus: Focus | null = null
  growth = 0.012
  fine = 0.5
  dmax = 400e3
  baked = false
  stats = { bakeMs: 0, evalMs: 0, nowMs: 0 }
  private progs: Record<string, Prog> = {}
  private tex: Record<string, WebGLTexture> = {}
  private fbo: WebGLFramebuffer
  private state: WebGLTexture[][] = []
  private cur = 0
  private job = 0
  private focusKey = ''
  private tile = 128

  constructor(canvas: HTMLCanvasElement, data: DataStore) {
    this.canvas = canvas
    this.data = data
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    if (!gl) throw new Error('This browser has no WebGL 2.')
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This GPU cannot render to float textures.')
    if (!gl.getExtension('OES_texture_float_linear')) throw new Error('This GPU cannot filter float textures.')
    this.gl = gl
    this.fbo = gl.createFramebuffer()!
    for (const [name, fs] of Object.entries({ bake: G.FS_BAKE, probe: G.FS_PROBE, now: G.FS_NOW, eval: G.FS_EVAL, view: G.FS_VIEW }))
      this.progs[name] = this.program(fs, name)
    const m = data.manifest.dem
    this.tex.far = this.gridTex(data.far, m.far.n)
    this.tex.mid = this.gridTex(data.mid, m.mid.n)
    this.tex.focus = this.gridTex(null, FOCUS_N)
    this.tex.ephem = this.floatTex(CHUNK, 2, gl.RGBA32F, gl.NEAREST)
  }

  // ---- GL helpers -------------------------------------------------------
  private program(fs: string, name: string): Prog {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`${name}: ${gl.getShaderInfoLog(s)}`)
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, G.VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`${name}: ${gl.getProgramInfoLog(p)}`)
    const u = new Map<string, WebGLUniformLocation | null>()
    gl.useProgram(p)
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < n; i++) {
      const nm = gl.getActiveUniform(p, i)!.name
      const loc = gl.getUniformLocation(p, nm)
      u.set(nm, loc)
      if (nm in UNITS) gl.uniform1i(loc, UNITS[nm])
    }
    return { p, u }
  }
  private gridTex(a: Float32Array | null, n: number) {
    const gl = this.gl, t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R32F, n, n)
    if (a) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, n, gl.RED, gl.FLOAT, a)
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.LINEAR)
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)
    return t
  }
  private floatTex(w: number, h: number, fmt: number, filter: number) {
    const gl = this.gl, t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h)
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, filter)
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)
    return t
  }
  private use(name: string, vals: Record<string, number | number[] | boolean>) {
    const gl = this.gl, pr = this.progs[name]
    gl.useProgram(pr.p)
    const f = this.focus
    const all: Record<string, number | number[] | boolean> = {
      uFocusRect: f ? [f.left, f.top, f.size, 1] : [0, 0, 1, 0], uFocusRes: f ? f.res : 160,
      uGrowth: this.growth, uDmax: this.dmax, uFine: this.fine, ...vals,
    }
    for (const [k, v] of Object.entries(all)) {
      const loc = pr.u.get(k)
      if (loc == null) continue
      if (typeof v === 'boolean') gl.uniform1f(loc, v ? 1 : 0)
      else if (typeof v === 'number') (k === 'uSteps' && name === 'eval') || k === 'uMode' || k === 'uMetric' ? gl.uniform1i(loc, v) : gl.uniform1f(loc, v)
      else if (v.length === 2) gl.uniform2fv(loc, v)
      else if (v.length === 3) gl.uniform3fv(loc, v)
      else gl.uniform4fv(loc, v)
    }
    const bind = (unit: number, target: number, t: WebGLTexture | undefined) => {
      if (!t) return
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t)
    }
    bind(0, gl.TEXTURE_2D, this.tex.far); bind(1, gl.TEXTURE_2D, this.tex.mid); bind(2, gl.TEXTURE_2D, this.tex.focus)
    bind(3, gl.TEXTURE_2D_ARRAY, this.tex.horizon); bind(4, gl.TEXTURE_2D, this.tex.ephem)
    bind(8, gl.TEXTURE_2D, this.tex.now); bind(9, gl.TEXTURE_2D, this.tex.points)
    const st = this.state[this.cur]
    if (st) for (let i = 0; i < 3; i++) bind(5 + i, gl.TEXTURE_2D, st[i])
  }
  private tri() { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3) }

  /** Resolves when the GPU has finished everything issued so far. (gl.finish does not wait in Chrome.) */
  private gpuDone(): Promise<void> {
    const gl = this.gl
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!
    gl.flush()
    return new Promise((resolve) => {
      const ch = new MessageChannel()
      let polls = 0
      const poll = () => {
        const st = gl.clientWaitSync(sync, 0, 0)
        if (st === gl.TIMEOUT_EXPIRED) {
          if (++polls < 200) ch.port2.postMessage(0)
          else setTimeout(poll, 1)
          return
        }
        gl.deleteSync(sync)
        ch.port1.close()
        resolve()
      }
      ch.port1.onmessage = poll
      poll()
    })
  }

  /**
   * Draw a w x h target in scissor tiles, waiting for the GPU after each one. This keeps every
   * draw short (long draws get a GPU reset on some systems) and lets the page stay responsive.
   * setup() must bind everything the draw needs; it is called again after each wait.
   */
  private async tiled(w: number, h: number, job: number, weight: number, setup: () => void): Promise<boolean> {
    const gl = this.gl
    const T = this.tile // fixed for this pass; adapted for the next one
    let worst = 0
    for (let y = 0; y < h; y += T) {
      for (let x = 0; x < w; x += T) {
        const t0 = performance.now()
        setup()
        gl.enable(gl.SCISSOR_TEST)
        gl.scissor(x, y, T, T)
        this.tri()
        gl.disable(gl.SCISSOR_TEST)
        await this.gpuDone()
        if (job !== this.job) return false
        worst = Math.max(worst, (performance.now() - t0) / weight)
      }
    }
    if (worst > 30 && T > 32) this.tile = T >> 1
    else if (worst < 6 && T < 1024 && (w > T || h > T)) this.tile = T << 1
    return true
  }

  // ---- view and focus ---------------------------------------------------
  /** Centre (map metres) and metres per canvas pixel. */
  setView(cx: number, cy: number, mpp: number) {
    const w = this.canvas.width * mpp, h = this.canvas.height * mpp
    this.view = { x: cx - w / 2, y: cy - h / 2, w, h }
  }
  get mpp() { return this.view.w / this.canvas.width }

  /** Load the finest tiles that cover the view with room to spare. Returns true when the focus changed. */
  async loadFocus(): Promise<boolean> {
    const v = this.view, span = Math.max(v.w, v.h) * 1.3
    const level: TileLevel | null = span <= FOCUS_N * 20 ? 't20' : span <= FOCUS_N * 40 ? 't40' : span <= FOCUS_N * 80 ? 't80' : null
    if (!level) {
      const changed = this.focus !== null
      this.focus = null; this.focusKey = ''
      return changed
    }
    const { n, res } = this.data.level(level)
    const size = FOCUS_N * res
    // snap to a 256-texel lattice so small pans reuse the same grid
    const snap = 256 * res
    const left = Math.round((v.x + v.w / 2 - size / 2) / snap) * snap
    const top = Math.round((v.y + v.h / 2 + size / 2) / snap) * snap
    const key = `${level}/${left}/${top}`
    if (key === this.focusKey) return false
    this.focusKey = key
    const col0 = Math.round(left / res + n / 2), row0 = Math.round(n / 2 - top / res)
    const grid = new Float32Array(FOCUS_N * FOCUS_N).fill(NODATA_M)
    const jobs: Promise<void>[] = []
    for (let tr = Math.floor(row0 / TILE); tr <= Math.floor((row0 + FOCUS_N - 1) / TILE); tr++) {
      for (let tc = Math.floor(col0 / TILE); tc <= Math.floor((col0 + FOCUS_N - 1) / TILE); tc++) {
        jobs.push(this.data.tile(level, tr, tc).then((t) => {
          if (!t) return
          const r0 = Math.max(row0, tr * TILE), r1 = Math.min(row0 + FOCUS_N, (tr + 1) * TILE)
          const c0 = Math.max(col0, tc * TILE), c1 = Math.min(col0 + FOCUS_N, (tc + 1) * TILE)
          for (let r = r0; r < r1; r++) {
            const src = (r - tr * TILE) * TILE + (c0 - tc * TILE)
            grid.set(t.subarray(src, src + (c1 - c0)), (r - row0) * FOCUS_N + (c0 - col0))
          }
        }))
      }
    }
    await Promise.all(jobs)
    if (key !== this.focusKey) return false
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex.focus)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FOCUS_N, FOCUS_N, gl.RED, gl.FLOAT, grid)
    this.focus = { level, res, left, top, size }
    return true
  }

  // ---- light at one instant ---------------------------------------------
  private sunEarth(hours: number) {
    const s = this.data.sample(hours)
    return {
      sun: [s[0], s[1], s[2], Math.asin(695700 / s[3])],
      earth: [s[4], s[5], s[6], s[8]],
      dsn: s[7],
    }
  }
  /** Sun disk fraction and Earth clearance for every pixel of the view at one time. scale < 1 renders coarser. */
  renderNow(hours: number, mast: number, scale = 1) {
    const gl = this.gl, t0 = performance.now()
    const w = Math.max(16, Math.round(this.canvas.width * scale)), h = Math.max(16, Math.round(this.canvas.height * scale))
    const key = `${w}x${h}`
    if (this.tex.now === undefined || (this as unknown as { nowKey: string }).nowKey !== key) {
      if (this.tex.now) gl.deleteTexture(this.tex.now)
      this.tex.now = this.floatTex(w, h, gl.RGBA16F, gl.LINEAR)
      ;(this as unknown as { nowKey: string }).nowKey = key
    }
    const se = this.sunEarth(hours)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex.now, 0)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0])
    gl.viewport(0, 0, w, h)
    const v = this.view
    this.use('now', { uField: [v.x, v.y, v.w, v.h], uFieldPx: [w, h], uMast: mast, uSun: se.sun, uEarth: se.earth })
    this.tri()
    this.nowRect = { ...v }
    this.stats.nowMs = performance.now() - t0
    return se
  }

  // ---- horizon cache ----------------------------------------------------
  /** Compute the horizon in 360 directions for every pixel of the current view. */
  async bake(mast: number, width = 512, onProgress?: (f: number) => void): Promise<boolean> {
    const gl = this.gl, job = ++this.job, t0 = performance.now()
    this.baked = false
    const w = width, h = Math.max(16, Math.round((width * this.canvas.height) / this.canvas.width))
    if (this.fieldPx[0] !== w || this.fieldPx[1] !== h || !this.tex.horizon) {
      if (this.tex.horizon) gl.deleteTexture(this.tex.horizon)
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t)
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGB10_A2, w, h, G.LAYERS)
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, k, gl.NEAREST)
      this.tex.horizon = t
      for (const s of this.state) for (const x of s) gl.deleteTexture(x)
      this.state = [0, 1].map(() => [0, 1, 2].map(() => this.floatTex(w, h, gl.RGBA32F, gl.LINEAR)))
      this.fieldPx = [w, h]
      this.metricRect = null
    }
    const f = { ...this.view }
    const step = (2 * Math.PI) / G.NAZ
    for (let l = 0; l < G.LAYERS; l++) {
      const setup = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.tex.horizon, 0, l)
        gl.drawBuffers([gl.COLOR_ATTACHMENT0])
        gl.viewport(0, 0, w, h)
        this.use('bake', { uField: [f.x, f.y, f.w, f.h], uFieldPx: [w, h], uAz0: l * 3 * step, uAzStep: step, uMast: mast })
      }
      if (!(await this.tiled(w, h, job, 3, setup))) return false
      onProgress?.((l + 1) / G.LAYERS)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, null, 0, 0)
    this.field = f
    this.baked = true
    this.stats.bakeMs = performance.now() - t0
    return true
  }

  // ---- mission evaluation -----------------------------------------------
  /** Run the mission over [t0, t0 + steps*dt] for every pixel of the baked field. */
  async evaluate(t0Hours: number, steps: number, dtHours: number, m: Mission, onProgress?: (f: number) => void): Promise<boolean> {
    if (!this.baked || !this.field) return false
    const gl = this.gl, job = ++this.job, tStart = performance.now()
    const [w, h] = this.fieldPx, f = this.field
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    // initial state
    this.cur = 0
    const init = [[0, 0, 0, 0], [0, 0, m.startWh, 0], [m.startWh, 0, 0, 0]]
    for (let i = 0; i < 3; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.state[0][i], 0)
      gl.drawBuffers([gl.COLOR_ATTACHMENT0])
      gl.clearBufferfv(gl.COLOR, 0, init[i])
    }
    const buf = new Float32Array(CHUNK * 2 * 4)
    const s = new Float64Array(9)
    for (let k0 = 0; k0 < steps; k0 += CHUNK) {
      const n = Math.min(CHUNK, steps - k0)
      for (let k = 0; k < n; k++) {
        this.data.sample(t0Hours + (k0 + k) * dtHours, s)
        buf.set([s[0], s[1], s[2], Math.asin(695700 / s[3])], k * 4)
        buf.set([s[4], s[5], s[6], s[7] + Math.min(s[8], 1) * 0.999], (CHUNK + k) * 4)
      }
      const dst = this.state[1 - this.cur]
      const setup = () => {
        // the chunk is re-uploaded on every setup: another evaluation may not run in between, but a draw may
        gl.activeTexture(gl.TEXTURE0 + 4)
        gl.bindTexture(gl.TEXTURE_2D, this.tex.ephem)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CHUNK, 2, gl.RGBA, gl.FLOAT, buf)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
        for (let i = 0; i < 3; i++) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, dst[i], 0)
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2])
        gl.viewport(0, 0, w, h)
        this.use('eval', {
          uField: [f.x, f.y, f.w, f.h], uFieldPx: [w, h], uSteps: n, uDt: dtHours, uMast: m.mast, uLitMin: m.litMin,
          uEarthMargin: m.earthMargin, uNeedDsn: m.needDsn, uPower: [m.arrayW, m.loadLitW, m.loadDarkW, m.batteryWh],
        })
      }
      const ok = await this.tiled(w, h, job, 1, setup)
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
      for (let i = 1; i < 3; i++) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, null, 0)
      gl.drawBuffers([gl.COLOR_ATTACHMENT0])
      if (!ok) return false
      this.cur = 1 - this.cur
      onProgress?.(Math.min(1, (k0 + n) / steps))
    }
    this.metricRect = { ...f }
    this.metricSteps = steps
    this.metricHours = steps * dtHours
    this.stats.evalMs = performance.now() - tStart
    return true
  }

  /** Metrics at a map point, from the last evaluation. */
  readMetrics(x: number, y: number): Record<Metric, number> | null {
    const r = this.metricRect
    if (!r) return null
    const [w, h] = this.fieldPx
    const px = Math.floor(((x - r.x) / r.w) * w), py = Math.floor(((y - r.y) / r.h) * h)
    if (px < 0 || py < 0 || px >= w || py >= h) return null
    const gl = this.gl, out = new Float32Array(12)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    for (let i = 0; i < 3; i++) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.state[this.cur][i], 0)
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, out.subarray(i * 4, i * 4 + 4))
    }
    const n = this.metricSteps
    return {
      lit: out[0] / n, longestDark: out[2], comm: out[3] / n, longestCommGap: out[5],
      hoursAlive: out[7], litAndComm: out[9] / n, litAny: out[11] / n,
    }
  }
  /** Whole metric layer as floats (row 0 at the bottom of the field). */
  readState(i: number): Float32Array {
    const gl = this.gl, [w, h] = this.fieldPx, out = new Float32Array(w * h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.state[this.cur][i], 0)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, out)
    return out
  }

  // ---- picture ----------------------------------------------------------
  draw(opts: { mode: 'now' | 'metric'; hours: number; metric?: Metric; range?: [number, number]; needs?: [number, number, number, number] }) {
    const gl = this.gl, v = this.view
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    const se = this.sunEarth(opts.hours)
    const nr = this.nowRect, mr = this.metricRect
    this.use('view', {
      uView: [v.x, v.y, v.w, v.h], uViewPx: [this.canvas.width, this.canvas.height], uPx: this.mpp,
      uNowRect: nr ? [nr.x, nr.y, nr.w, nr.h] : [0, 0, 0, 0], uMRect: mr ? [mr.x, mr.y, mr.w, mr.h] : [0, 0, 0, 0],
      uSunDir: se.sun.slice(0, 3), uMode: opts.mode === 'now' ? 0 : 1, uMetric: METRICS.indexOf(opts.metric ?? 'lit'),
      uRange: opts.range ?? [0, 1], uSteps: Math.max(1, this.metricSteps), uHours: this.metricHours,
      uNeeds: opts.needs ?? [0, 1e6, 0, 0],
    })
    this.tri()
  }

  // ---- verification -----------------------------------------------------
  /** Horizon profiles (degrees) at given map points; result[i * naz + j] for point i, azimuth j. */
  async probe(points: { x: number; y: number; mast: number }[], naz = 720): Promise<{ el: Float32Array; ground: Float32Array }> {
    const gl = this.gl, n = points.length, job = ++this.job
    const pts = new Float32Array(n * 4)
    points.forEach((p, i) => pts.set([p.x, p.y, p.mast, 0], i * 4))
    if (this.tex.points) gl.deleteTexture(this.tex.points)
    this.tex.points = this.floatTex(n, 1, gl.RGBA32F, gl.NEAREST)
    gl.bindTexture(gl.TEXTURE_2D, this.tex.points)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, 1, gl.RGBA, gl.FLOAT, pts)
    const target = this.floatTex(n, naz, gl.RGBA32F, gl.NEAREST)
    await this.tiled(n, naz, job, 1, () => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0)
      gl.drawBuffers([gl.COLOR_ATTACHMENT0])
      gl.viewport(0, 0, n, naz)
      this.use('probe', { uNaz: naz })
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0)
    const raw = new Float32Array(n * naz * 4)
    gl.readPixels(0, 0, n, naz, gl.RGBA, gl.FLOAT, raw)
    gl.deleteTexture(target)
    const el = new Float32Array(n * naz), ground = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      ground[i] = raw[i * 4 + 1]
      for (let j = 0; j < naz; j++) el[i * naz + j] = raw[(j * n + i) * 4]
    }
    return { el, ground }
  }
}
