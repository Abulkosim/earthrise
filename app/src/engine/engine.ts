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
  panelFixed: boolean // false: the array tracks the Sun; true: it is fixed to the lander
  panelAz: number     // a fixed array faces this azimuth, degrees clockwise from north
  panelTilt: number   // and is tilted this far from lying flat, degrees (90: upright)
  loadLitW: number    // load while lit, W
  loadDarkW: number   // load in the dark (survival heaters), W
  batteryWh: number
  startWh: number
}
export const DEFAULT_MISSION: Mission = {
  mast: 2, litMin: 0.5, earthMargin: 0, needDsn: true,
  // a small polar lander: enough battery to sit out about three days of shadow
  arrayW: 450, loadLitW: 200, loadDarkW: 40, batteryWh: 3000, startWh: 3000,
  panelFixed: false, panelAz: 0, panelTilt: 90,
}

export const METRICS = ['lit', 'longestDark', 'comm', 'longestCommGap', 'hoursAlive', 'litAndComm', 'litAny', 'psrDistance'] as const
export type Metric = (typeof METRICS)[number]

const FOCUS_N = 2048
const UNITS: Record<string, number> = {
  uFar: 0, uMid: 1, uFocus: 2, uHorizon: 3, uEphem: 4, uS0: 5, uS1: 6, uS2: 7, uM0: 5, uM1: 6, uM2: 7, uNow: 8, uPoints: 9, uPsr: 10, uRing: 11,
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
  ring: Focus | null = null          // coarser tiles around a 5 or 10 m focus
  private pfocus: Focus | null = null
  private pring: Focus | null = null
  private pfocusKey = ''
  growth = 0.012
  elMax = G.EL_MAX // top of the stored horizon range for the current bake, degrees
  fine = 0.25 // smallest step as a share of the grid spacing; 0.25 is the setting the checks were run with
  dmax = 400e3
  baked = false
  lost = false
  manual = false
  onLost?: () => void
  stats = { bakeMs: 0, evalMs: 0, nowMs: 0 }
  private progs: Record<string, Prog> = {}
  private tex: Record<string, WebGLTexture> = {}
  private fbo: WebGLFramebuffer       // single attachment: bake, light now, probes, readbacks
  private fboEval: WebGLFramebuffer   // three attachments: mission evaluation only
  private bakeJob = 0
  private evalJob = [0, 0, 0]
  // evaluation state: per slot (0 the map, 1 background sweeps) three sets of three textures;
  // disp[slot] is the finished result, the other two are scratch
  private state: WebGLTexture[][][] = []
  private disp = [0, 0, 0]
  private slotSteps = [0, 0, 0]
  private slotRect: (Rect | null)[] = [null, null, null] // the map rectangle each slot's result belongs to
  /** Distance in metres from each field pixel to ground that never saw the Sun in the long run; null until computed. */
  psrDist: Float32Array | null = null
  private srcState: WebGLTexture[] | undefined
  private focusKey = ''
  private tile = 128

  constructor(canvas: HTMLCanvasElement, data: DataStore) {
    this.canvas = canvas
    this.data = data
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
    if (!gl) throw new Error('This browser has no WebGL 2.')
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('This GPU cannot render to float textures.')
    // Without float filtering (some phones) the shaders blend height samples themselves and the
    // result layers are shown unsmoothed. Slower and blockier, but the numbers are the same.
    this.manual = !gl.getExtension('OES_texture_float_linear') || new URLSearchParams(location.search).has('nolinear')
    this.gl = gl
    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); this.lost = true; this.onLost?.() })
    this.fbo = gl.createFramebuffer()!
    this.fboEval = gl.createFramebuffer()!
    for (const [name, fs] of Object.entries({ bake: G.FS_BAKE, probe: G.FS_PROBE, now: G.FS_NOW, eval: G.FS_EVAL, view: G.FS_VIEW }))
      this.progs[name] = this.program(fs, name)
    const m = data.manifest.dem
    this.tex.far = this.gridTex(data.far, m.far.n)
    this.tex.mid = this.gridTex(data.mid, m.mid.n)
    this.tex.focus = this.gridTex(null, FOCUS_N)
    this.tex.pfocus = this.gridTex(null, FOCUS_N)
    this.tex.ring = this.gridTex(null, FOCUS_N)
    this.tex.pring = this.gridTex(null, FOCUS_N)
    this.tex.ephem = this.floatTex(CHUNK, 2, gl.RGBA32F, gl.NEAREST)
  }

  // ---- GL helpers -------------------------------------------------------
  private program(fs: string, name: string): Prog {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src.replace('/*DEFINES*/', this.manual ? '#define MANUAL_BILINEAR' : '')); gl.compileShader(s)
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
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, this.manual ? gl.NEAREST : gl.LINEAR)
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)
    return t
  }
  private floatTex(w: number, h: number, fmt: number, filter: number) {
    const gl = this.gl, t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h)
    // 32-bit float textures can only be smoothed where the GPU supports it
    const f = this.manual && (fmt === gl.RGBA32F || fmt === gl.R32F) ? gl.NEAREST : filter
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, f)
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE)
    return t
  }
  private use(name: string, vals: Record<string, number | number[] | boolean>) {
    const gl = this.gl, pr = this.progs[name]
    gl.useProgram(pr.p)
    const f = name === 'probe' ? this.pfocus : this.focus
    const rg = name === 'probe' ? this.pring : this.ring
    const all: Record<string, number | number[] | boolean> = {
      uFocusRect: f ? [f.left, f.top, f.size, 1] : [0, 0, 1, 0], uFocusRes: f ? f.res : 160,
      // a walk reads the focus grid for 500 of its cells (2.5 km at 5 m), at most 10 km
      uFocusT: f ? Math.min(10000, f.res * 500) : 10000,
      uRingRect: rg ? [rg.left, rg.top, rg.size, 1] : [0, 0, 1, 0], uRingRes: rg ? rg.res : 160,
      uGrowth: this.growth, uDmax: this.dmax, uFine: this.fine, uElMax: this.elMax, ...vals,
    }
    for (const [k, v] of Object.entries(all)) {
      const loc = pr.u.get(k)
      if (loc == null) continue
      if (typeof v === 'boolean') gl.uniform1f(loc, v ? 1 : 0)
      else if (typeof v === 'number') {
        if ((k === 'uSteps' && name === 'eval') || k === 'uMode' || k === 'uMetric') gl.uniform1i(loc, v)
        else gl.uniform1f(loc, v)
      }
      else if (v.length === 2) gl.uniform2fv(loc, v)
      else if (v.length === 3) gl.uniform3fv(loc, v)
      else gl.uniform4fv(loc, v)
    }
    const bind = (unit: number, target: number, t: WebGLTexture | undefined) => {
      if (!t) return
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t)
    }
    bind(0, gl.TEXTURE_2D, this.tex.far); bind(1, gl.TEXTURE_2D, this.tex.mid); bind(2, gl.TEXTURE_2D, name === 'probe' ? this.tex.pfocus : this.tex.focus)
    bind(11, gl.TEXTURE_2D, name === 'probe' ? this.tex.pring : this.tex.ring)
    bind(3, gl.TEXTURE_2D_ARRAY, this.tex.horizon); bind(4, gl.TEXTURE_2D, this.tex.ephem)
    bind(8, gl.TEXTURE_2D, this.tex.now); bind(9, gl.TEXTURE_2D, this.tex.points); bind(10, gl.TEXTURE_2D, this.tex.psr)
    const st = this.srcState
    if (st) for (let i = 0; i < 3; i++) bind(5 + i, gl.TEXTURE_2D, st[i])
  }
  private tri() { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3) }

  /** Resolves when the GPU has finished everything issued so far. (gl.finish does not wait in Chrome.) */
  private gpuDone(): Promise<void> {
    const gl = this.gl
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (!sync || this.lost) return Promise.reject(new Error('The graphics context was lost.'))
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
  private async tiled(w: number, h: number, alive: () => boolean, weight: number, setup: () => void): Promise<boolean> {
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
        if (!alive()) return false
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

  /**
   * Which tiles to load around a centre: the focus level and, for a 5 or 10 m focus, a ring of
   * coarser tiles around it.
   * size > 0 is a map view that many metres across: the focus must cover it with room to spare, and
   * 20 m and finer tiles are used only where they cover the whole view (a view should not mix
   * resolutions). size = 0 is a probe at one point: the finest level that covers the point.
   */
  private pickLevels(size: number, cx: number, cy: number): { fine: TileLevel | null; ring: TileLevel | null } {
    const T = this.data.manifest.dem.tiles
    const r = Math.hypot(cx, cy), m = Math.max(Math.abs(cx), Math.abs(cy)), half = size / 2
    const square = (l: 't5' | 't10') => this.data.hasLevel(l) && m + half < (T[l]!.n * T[l]!.res) / 2 - 200
    const t20ok = r + half < T.t20.max_radius_m
    let fine: TileLevel | null = null
    if (square('t5') && size * 2 <= FOCUS_N * 5) fine = 't5'
    else if (square('t10') && size * 2 <= FOCUS_N * 10) fine = 't10'
    else if (t20ok && size * 1.3 <= FOCUS_N * 20) fine = 't20'
    else if (size * 1.3 <= FOCUS_N * 40) fine = 't40'
    else if (size * 1.3 <= FOCUS_N * 80) fine = 't80'
    const ring: TileLevel | null = fine === 't5' || fine === 't10' ? (r + 20000 < T.t20.max_radius_m ? 't20' : 't40') : null
    return { fine, ring }
  }
  /** Assemble a FOCUS_N grid of one tile level around a centre. */
  private async assemble(level: TileLevel, cx: number, cy: number): Promise<{ grid: Float32Array; focus: Focus; key: string }> {
    const { n, res } = this.data.level(level)
    const size = FOCUS_N * res
    const snap = 256 * res // snap to a lattice so small pans reuse the same grid
    const left = Math.round((cx - size / 2) / snap) * snap
    const top = Math.round((cy + size / 2) / snap) * snap
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
    return { grid, focus: { level, res, left, top, size }, key: `${level}/${left}/${top}` }
  }

  /** Load the finest tiles that cover the view with room to spare. Returns true when the focus changed. */
  async loadFocus(): Promise<boolean> {
    const v = this.view, cx = v.x + v.w / 2, cy = v.y + v.h / 2
    const { fine, ring } = this.pickLevels(Math.max(v.w, v.h), cx, cy)
    if (!fine) {
      const changed = this.focus !== null
      this.focus = null; this.ring = null; this.focusKey = ''
      return changed
    }
    const keyOf = (l: TileLevel) => {
      const { res } = this.data.level(l)
      const size = FOCUS_N * res, snap = 256 * res
      return `${l}/${Math.round((cx - size / 2) / snap) * snap}/${Math.round((cy + size / 2) / snap) * snap}`
    }
    const key = keyOf(fine) + (ring ? '+' + keyOf(ring) : '')
    if (key === this.focusKey) return false
    this.focusKey = key
    const [a, b] = await Promise.all([this.assemble(fine, cx, cy), ring ? this.assemble(ring, cx, cy) : null])
    if (key !== this.focusKey) return false
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex.focus)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FOCUS_N, FOCUS_N, gl.RED, gl.FLOAT, a.grid)
    if (b) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex.ring)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FOCUS_N, FOCUS_N, gl.RED, gl.FLOAT, b.grid)
    }
    this.focus = a.focus
    this.ring = b ? b.focus : null
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
    const gl = this.gl, job = ++this.bakeJob, t0 = performance.now()
    // a new bake supersedes every evaluation in flight
    this.evalJob[0]++; this.evalJob[1]++; this.evalJob[2]++
    this.psrDist = null
    this.tile = Math.min(this.tile, 128)
    this.baked = false
    // width <= 0: pick the width that gives about -width pixels in total for this canvas shape
    const aspect = this.canvas.width / this.canvas.height
    const w = width > 0 ? width : Math.min(1024, Math.round(Math.sqrt(-width * aspect) / 16) * 16)
    const h = Math.max(16, Math.round(w / aspect))
    if (this.fieldPx[0] !== w || this.fieldPx[1] !== h || !this.tex.horizon) {
      if (this.tex.horizon) gl.deleteTexture(this.tex.horizon)
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, t)
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGB10_A2, w, h, G.LAYERS)
      for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, k, gl.NEAREST)
      this.tex.horizon = t
      for (const sl of this.state) for (const s of sl) for (const x of s) gl.deleteTexture(x)
      this.state = [0, 1, 2].map(() => [0, 1, 2].map(() => [0, 1, 2].map(() => this.floatTex(w, h, gl.RGBA32F, gl.LINEAR))))
      this.disp = [0, 0, 0]
      if (this.tex.psr) gl.deleteTexture(this.tex.psr)
      this.tex.psr = this.floatTex(w, h, gl.R32F, gl.LINEAR)
      this.fieldPx = [w, h]
      this.metricRect = null
      this.slotSteps = [0, 0, 0]
      this.slotRect = [null, null, null]
    }
    const f = { ...this.view }
    // The stored range must reach as high as the Sun or the Earth can stand anywhere in view:
    // colatitude of the farthest corner, plus the Earth's 6.7 deg of libration and a margin.
    const far = Math.hypot(Math.max(Math.abs(f.x), Math.abs(f.x + f.w)), Math.max(Math.abs(f.y), Math.abs(f.y + f.h)))
    this.elMax = Math.max(G.EL_MAX, (2 * Math.atan(far / (2 * 1737400)) * 180) / Math.PI + 9)
    const step = (2 * Math.PI) / G.NAZ
    for (let l = 0; l < G.LAYERS; l++) {
      const setup = () => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.tex.horizon, 0, l)
        gl.drawBuffers([gl.COLOR_ATTACHMENT0])
        gl.viewport(0, 0, w, h)
        this.use('bake', { uField: [f.x, f.y, f.w, f.h], uFieldPx: [w, h], uAz0: l * 3 * step, uAzStep: step, uMast: mast })
      }
      if (!(await this.tiled(w, h, () => job === this.bakeJob, 3, setup))) return false
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
  /**
   * Run the mission over [t0, t0 + steps*dt] for every pixel of the baked field.
   * slot 0 is what the map shows; slot 1 is for background sweeps and leaves the map alone;
   * slot 2 holds the long-run climate (see climate()).
   */
  async evaluate(t0Hours: number, steps: number, dtHours: number, m: Mission, onProgress?: (f: number) => void, slot = 0): Promise<boolean> {
    if (!this.baked || !this.field) return false
    const gl = this.gl, job = ++this.evalJob[slot], tStart = performance.now()
    const [w, h] = this.fieldPx, f = this.field
    const sets = this.state[slot]
    const scratch = [0, 1, 2].filter((i) => i !== this.disp[slot])
    let src = scratch[0], dst = scratch[1]
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboEval)
    const init = [[0, 0, 0, 0], [0, 0, m.startWh, 0], [m.startWh, 0, 0, 0]]
    for (let i = 0; i < 3; i++) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, sets[src][i], 0)
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2])
    for (let i = 0; i < 3; i++) gl.clearBufferfv(gl.COLOR, i, init[i])
    const buf = new Float32Array(CHUNK * 2 * 4)
    const s = new Float64Array(9)
    for (let k0 = 0; k0 < steps; k0 += CHUNK) {
      const n = Math.min(CHUNK, steps - k0)
      for (let k = 0; k < n; k++) {
        this.data.sample(t0Hours + (k0 + k) * dtHours, s)
        buf.set([s[0], s[1], s[2], Math.asin(695700 / s[3])], k * 4)
        buf.set([s[4], s[5], s[6], s[7] + Math.min(s[8], 1) * 0.999], (CHUNK + k) * 4)
      }
      const from = sets[src], to = sets[dst]
      const setup = () => {
        // the chunk is re-uploaded on every setup, since a map redraw may have run in between
        gl.activeTexture(gl.TEXTURE0 + 4)
        gl.bindTexture(gl.TEXTURE_2D, this.tex.ephem)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CHUNK, 2, gl.RGBA, gl.FLOAT, buf)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboEval)
        for (let i = 0; i < 3; i++) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, to[i], 0)
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2])
        gl.viewport(0, 0, w, h)
        this.srcState = from
        this.use('eval', {
          uField: [f.x, f.y, f.w, f.h], uFieldPx: [w, h], uSteps: n, uDt: dtHours, uMast: m.mast, uLitMin: m.litMin,
          uEarthMargin: m.earthMargin, uNeedDsn: m.needDsn, uPower: [m.arrayW, m.loadLitW, m.loadDarkW, m.batteryWh],
          uPanel: [m.panelFixed ? 1 : 0, (m.panelAz * Math.PI) / 180, (m.panelTilt * Math.PI) / 180],
        })
      }
      const ok = await this.tiled(w, h, () => job === this.evalJob[slot], 1, setup)
      if (!ok) return false
      ;[src, dst] = [dst, src]
      onProgress?.(Math.min(1, (k0 + n) / steps))
    }
    this.disp[slot] = src // the finished result; the old one becomes scratch
    this.slotSteps[slot] = steps
    this.slotRect[slot] = { ...f }
    if (slot === 0) {
      this.metricRect = { ...f }
      this.metricSteps = steps
      this.metricHours = steps * dtHours
      this.stats.evalMs = performance.now() - tStart
    }
    return true
  }

  /**
   * The long run: 18.6 years (one cycle of the Moon's orbit plane) in 12 h steps for every pixel.
   * Gives the average sunlight and the ground that never sees any part of the Sun, and from that
   * the distance of every pixel to permanent shadow. Science wants the shadow (it can hold ice),
   * engineering wants the light; the distance lets a brief ask for both.
   */
  async climate(mast: number): Promise<boolean> {
    const years = 18.6, dt = 12
    const steps = Math.round((years * 365.25 * 24) / dt)
    const m: Mission = { ...DEFAULT_MISSION, mast, litMin: 1e-6, needDsn: false }
    if (!(await this.evaluate(0, steps, dt, m, undefined, 2))) return false
    const [w, h] = this.fieldPx, f = this.field!
    const st = this.readState(2, 2), s0 = this.readState(0, 2)
    const inf = 1e20
    const g = new Float64Array(w * h)
    // lit-any count of zero: permanent shadow. Pixels with no terrain are not shadow, they are nothing:
    // the evaluation marks them with a dark run of 1e6 h. (A real dark run here is at most the whole
    // 163,000 h of the long run, so the test sits between the two.)
    for (let i = 0; i < w * h; i++) g[i] = st[i * 4 + 3] === 0 && s0[i * 4 + 1] < 5e5 ? 0 : inf
    // exact squared Euclidean distance transform (Felzenszwalb and Huttenlocher), rows then columns
    const pass = (len: number, get: (i: number) => number, set: (i: number, v: number) => void) => {
      const v = new Int32Array(len), z = new Float64Array(len + 1)
      let k = 0
      v[0] = 0; z[0] = -inf; z[1] = inf
      for (let q = 1; q < len; q++) {
        let s = 0
        for (;;) {
          const p = v[k]
          s = (get(q) + q * q - (get(p) + p * p)) / (2 * q - 2 * p)
          if (s <= z[k] && k > 0) k--
          else break
        }
        k++; v[k] = q; z[k] = s; z[k + 1] = inf
      }
      k = 0
      const out = new Float64Array(len)
      for (let q = 0; q < len; q++) {
        while (z[k + 1] < q) k++
        const p = v[k]
        out[q] = (q - p) * (q - p) + get(p)
      }
      for (let q = 0; q < len; q++) set(q, out[q])
    }
    for (let y = 0; y < h; y++) pass(w, (i) => g[y * w + i], (i, val) => { g[y * w + i] = val })
    for (let x = 0; x < w; x++) pass(h, (i) => g[i * w + x], (i, val) => { g[i * w + x] = val })
    const cell = f.w / w
    const d = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) d[i] = Math.min(1e7, Math.sqrt(g[i]) * cell)
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.tex.psr)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RED, gl.FLOAT, d)
    this.psrDist = d
    return true
  }
  /** Distance in metres from a map point to permanent shadow, or null when unknown (outside the field). */
  psrDistanceAt(x: number, y: number): number | null {
    const r = this.field, d = this.psrDist
    if (!r || !d) return null
    const [w, h] = this.fieldPx
    const px = Math.floor(((x - r.x) / r.w) * w), py = Math.floor(((y - r.y) / r.h) * h)
    return px < 0 || py < 0 || px >= w || py >= h ? null : d[py * w + px]
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
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.state[0][this.disp[0]][i], 0)
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, out.subarray(i * 4, i * 4 + 4))
    }
    const n = this.metricSteps
    return {
      lit: out[0] / n, longestDark: out[2], comm: out[3] / n, longestCommGap: out[5],
      hoursAlive: out[7], litAndComm: out[9] / n, litAny: out[11] / n, psrDistance: this.psrDistanceAt(x, y) ?? NaN,
    }
  }
  /** Share of the field (0..1) that meets the needs: min lit, max dark hours, min comm, min hours alive. */
  passShare(needs: [number, number, number, number], slot = 0, maxPsrM = 0): number {
    if (!this.slotSteps[slot]) return 0
    const a = this.readState(0, slot), b = this.readState(1, slot), n = this.slotSteps[slot], px = a.length / 4
    const d = maxPsrM > 0 ? this.psrDist : null
    if (maxPsrM > 0 && !d) return 0
    let ok = 0
    for (let i = 0; i < px; i++) {
      if (a[i * 4] / n >= needs[0] && a[i * 4 + 2] <= needs[1] && a[i * 4 + 3] / n >= needs[2] && b[i * 4 + 3] >= needs[3]
        && (!d || d[i] <= maxPsrM)) ok++
    }
    return ok / px
  }
  /** Whole metric layer as floats (row 0 at the bottom of the field). */
  readState(i: number, slot = 0): Float32Array {
    const gl = this.gl, [w, h] = this.fieldPx, out = new Float32Array(w * h * 4)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.state[slot][this.disp[slot]][i], 0)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, out)
    return out
  }

  // ---- picture ----------------------------------------------------------
  draw(opts: {
    mode: 'now' | 'metric' | 'needs'; hours: number; metric?: Metric; range?: [number, number]; hue?: [number, number, number]
    needs?: [number, number, number, number]; earthTint?: boolean
    slot?: number      // which evaluation to colour by: 0 the stay, 2 the long-run climate
    maxPsrM?: number   // need: permanent shadow within this many metres (0: no such need)
  }) {
    const gl = this.gl, v = this.view
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    const se = this.sunEarth(opts.hours)
    const slot = opts.slot ?? 0
    const nr = this.nowRect, mr = this.slotRect[slot]
    this.srcState = this.state[slot]?.[this.disp[slot]]
    this.use('view', {
      uView: [v.x, v.y, v.w, v.h], uViewPx: [this.canvas.width, this.canvas.height], uPx: this.mpp,
      uNowRect: nr ? [nr.x, nr.y, nr.w, nr.h] : [0, 0, 0, 0], uMRect: mr ? [mr.x, mr.y, mr.w, mr.h] : [0, 0, 0, 0],
      uSunDir: se.sun.slice(0, 3), uMode: opts.mode === 'now' ? 0 : opts.mode === 'metric' ? 1 : 2,
      uMetric: METRICS.indexOf(opts.metric ?? 'lit'), uRange: opts.range ?? [0, 1], uHue: opts.hue ?? [1, 1, 1],
      uSteps: Math.max(1, this.slotSteps[slot]), uNeeds: opts.needs ?? [0, 1e6, 0, 0], uEarthTint: opts.earthTint ?? true,
      uNeedPsr: this.psrDist ? (opts.maxPsrM ?? 0) : 0, uPsrOn: !!this.psrDist,
    })
    this.tri()
  }

  // ---- verification -----------------------------------------------------
  /** Horizon profiles (degrees) at given map points; result[i * naz + j] for point i, azimuth j. */
  probe(points: { x: number; y: number; mast: number }[], naz = 720): Promise<{ el: Float32Array; ground: Float32Array }> {
    // probes share textures, so they run one at a time
    const run = this.probeQueue.then(() => this.probeNow(points, naz))
    this.probeQueue = run.catch(() => undefined)
    return run
  }
  private probeQueue: Promise<unknown> = Promise.resolve()
  private async probeNow(points: { x: number; y: number; mast: number }[], naz: number): Promise<{ el: Float32Array; ground: Float32Array }> {
    const gl = this.gl, n = points.length
    // finest tiles around the points (they should lie within a few km of each other)
    const cx = points.reduce((a, p) => a + p.x, 0) / n, cy = points.reduce((a, p) => a + p.y, 0) / n
    const { fine, ring } = this.pickLevels(0, cx, cy)
    if (fine && Math.hypot(cx, cy) < 320000) {
      const [a, b] = await Promise.all([this.assemble(fine, cx, cy), ring ? this.assemble(ring, cx, cy) : null])
      const key = a.key + (b ? '+' + b.key : '')
      if (key !== this.pfocusKey) {
        gl.bindTexture(gl.TEXTURE_2D, this.tex.pfocus)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FOCUS_N, FOCUS_N, gl.RED, gl.FLOAT, a.grid)
        if (b) {
          gl.bindTexture(gl.TEXTURE_2D, this.tex.pring)
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FOCUS_N, FOCUS_N, gl.RED, gl.FLOAT, b.grid)
        }
        this.pfocusKey = key
      }
      this.pfocus = a.focus
      this.pring = b ? b.focus : null
    } else { this.pfocus = null; this.pring = null }
    const pts = new Float32Array(n * 4)
    points.forEach((p, i) => pts.set([p.x, p.y, p.mast, 0], i * 4))
    if (this.tex.points) gl.deleteTexture(this.tex.points)
    this.tex.points = this.floatTex(n, 1, gl.RGBA32F, gl.NEAREST)
    gl.bindTexture(gl.TEXTURE_2D, this.tex.points)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, 1, gl.RGBA, gl.FLOAT, pts)
    const target = this.floatTex(n, naz, gl.RGBA32F, gl.NEAREST)
    // a probe neither cancels a running bake nor is cancelled by one
    await this.tiled(n, naz, () => true, 1, () => {
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
