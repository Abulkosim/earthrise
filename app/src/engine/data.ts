// Loading of the data built by pipeline/scripts/build_web_data.py.
// Written with AI assistance (Claude); see the README.

export const R_MOON = 1737400.0
export const TILE = 512
// Far below anything real, so that a bilinear blend with a valid neighbour still reads as no data.
export const NODATA_M = -1e9

export interface LevelInfo { n: number; res: number; source: string }
export interface Manifest {
  dem: {
    far: LevelInfo & { file: string }
    mid: LevelInfo & { file: string }
    tiles: { size: number; nodata: number; t80: LevelInfo; t40: LevelInfo; t20: LevelInfo & { max_radius_m: number } }
  }
  ephem: { file: string; epoch_utc: string; step_s: number; rows: number; dsn: { stations: string[]; mask_deg: number } }
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  const buf = await r.arrayBuffer()
  const b = new Uint8Array(buf, 0, 2)
  // Some hosts unzip .gz on the way; only gunzip when the bytes still are gzip.
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Response(s).arrayBuffer()
}

/** A height grid in metres. Rows run north to south on the map (+y first). */
export async function loadGrid(url: string, n: number): Promise<Float32Array> {
  const d = new Int16Array(await fetchBytes(url))
  if (d.length !== n * n) throw new Error(`${url}: expected ${n * n} samples, got ${d.length}`)
  const out = new Float32Array(n * n)
  for (let r = 0; r < n; r++) {
    let acc = 0
    const o = r * n
    for (let c = 0; c < n; c++) {
      acc = ((acc + d[o + c]) << 16) >> 16 // int16 wrap, as written by the pipeline
      out[o + c] = acc === -32768 ? NODATA_M : acc * 0.5
    }
  }
  return out
}

export type TileLevel = 't20' | 't40' | 't80'

export class DataStore {
  manifest!: Manifest
  far!: Float32Array
  mid!: Float32Array
  ephem!: Float32Array
  epochMs = 0
  private tiles = new Map<string, Promise<Float32Array | null>>()
  base: string
  constructor(base: string = import.meta.env.VITE_DATA_BASE ?? `${import.meta.env.BASE_URL}data/`) { this.base = base }

  async init() {
    this.manifest = await (await fetch(this.base + 'manifest.json')).json()
    const d = this.manifest.dem
    const [far, mid, eph] = await Promise.all([
      loadGrid(this.base + d.far.file, d.far.n),
      loadGrid(this.base + d.mid.file, d.mid.n),
      fetch(this.base + this.manifest.ephem.file).then((r) => r.arrayBuffer()),
    ])
    this.far = far
    this.mid = mid
    this.ephem = new Float32Array(eph)
    this.epochMs = Date.parse(this.manifest.ephem.epoch_utc + 'Z')
  }

  level(l: TileLevel) { return this.manifest.dem.tiles[l] }

  hasTile(l: TileLevel, r: number, c: number): boolean {
    const { n, res } = this.level(l)
    const nt = Math.ceil(n / TILE)
    if (r < 0 || c < 0 || r >= nt || c >= nt) return false
    if (l !== 't20') return true
    const x0 = (c * TILE - n / 2) * res, x1 = ((c + 1) * TILE - n / 2) * res
    const y1 = (n / 2 - r * TILE) * res, y0 = (n / 2 - (r + 1) * TILE) * res
    const nx = Math.min(Math.max(0, x0), x1), ny = Math.min(Math.max(0, y0), y1)
    return Math.hypot(nx, ny) <= this.manifest.dem.tiles.t20.max_radius_m
  }

  tile(l: TileLevel, r: number, c: number): Promise<Float32Array | null> {
    const key = `${l}/${r}_${c}`
    let p = this.tiles.get(key)
    if (!p) {
      p = this.hasTile(l, r, c) ? loadGrid(`${this.base}dem/${key}.bin.gz`, TILE).catch(() => null) : Promise.resolve(null)
      this.tiles.set(key, p)
    }
    return p
  }

  /** Hours since the table epoch for a JS timestamp. */
  hours(ms: number) { return (ms - this.epochMs) / 3600e3 }
  ms(hours: number) { return this.epochMs + hours * 3600e3 }
  get maxHours() { return this.manifest.ephem.rows - 1 }

  /**
   * Sun and Earth at a time, linear between hourly rows.
   * out: [sun unit xyz, sun distance km, earth xyz km, dsn bits, eclipse fraction]
   */
  sample(h: number, out: Float64Array | number[] = new Float64Array(9)) {
    const rows = this.manifest.ephem.rows
    const hc = Math.min(Math.max(h, 0), rows - 1.000001)
    const i = Math.floor(hc), f = hc - i
    const e = this.ephem, a = i * 8, b = a + 8
    let sx = e[a] + (e[b] - e[a]) * f, sy = e[a + 1] + (e[b + 1] - e[a + 1]) * f, sz = e[a + 2] + (e[b + 2] - e[a + 2]) * f
    const sn = Math.hypot(sx, sy, sz)
    sx /= sn; sy /= sn; sz /= sn
    out[0] = sx; out[1] = sy; out[2] = sz
    out[3] = e[a + 3] + (e[b + 3] - e[a + 3]) * f
    out[4] = e[a + 4] + (e[b + 4] - e[a + 4]) * f
    out[5] = e[a + 5] + (e[b + 5] - e[a + 5]) * f
    out[6] = e[a + 6] + (e[b + 6] - e[a + 6]) * f
    const pa = e[a + 7], pb = e[b + 7]
    out[7] = Math.floor(f < 0.5 ? pa : pb)
    out[8] = ((pa - Math.floor(pa)) * (1 - f) + (pb - Math.floor(pb)) * f) / 0.999
    return out
  }
}
