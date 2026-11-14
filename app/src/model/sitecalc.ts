// Sun, Earth and power at one site over time, on the CPU in double precision.
// Same model as the GPU evaluation (engine/glsl.ts FS_EVAL) and the Python reference.
// Written with AI assistance (Claude); see the README.
import { R_MOON, type DataStore } from '../engine/data'
import type { Mission } from '../engine/engine'
import type { Horizon, SiteSeries, SiteSummary } from './types'

const D2R = Math.PI / 180, R2D = 180 / Math.PI

export function ll2xy(latDeg: number, lonDeg: number): [number, number] {
  const r = 2 * R_MOON * Math.tan(Math.PI / 4 + (latDeg * D2R) / 2)
  return [r * Math.sin(lonDeg * D2R), r * Math.cos(lonDeg * D2R)]
}
export function xy2ll(x: number, y: number): [number, number] {
  const lat = 2 * Math.atan(Math.hypot(x, y) / (2 * R_MOON)) - Math.PI / 2
  return [lat * R2D, ((Math.atan2(x, y) * R2D) + 360) % 360]
}

export function frame(latDeg: number, lonDeg: number) {
  const la = latDeg * D2R, lo = lonDeg * D2R
  const up = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
  const east = [-Math.sin(lo), Math.cos(lo), 0]
  const north = [up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]]
  return { up, east, north }
}

/** Horizon of a smooth sphere seen from `mast` metres up: a constant dip below level. */
export function sphereHorizon(mast: number, naz = 720): Horizon {
  const dip = -Math.acos(R_MOON / (R_MOON + Math.max(mast, 0))) * R2D
  return { naz, el: new Float32Array(naz).fill(dip), ground: 0, terrain: false }
}

export function horizonAt(h: Horizon, azDeg: number): number {
  const a = (((azDeg % 360) + 360) % 360) * (h.naz / 360)
  const i = Math.floor(a), f = a - i
  return h.el[i % h.naz] * (1 - f) + h.el[(i + 1) % h.naz] * f
}

/** Visible fraction of a disk cut by a level horizon (the cut of Barker et al. 2021). */
export function diskFraction(elCentre: number, elHorizon: number, radius: number): number {
  const z = Math.min(1, Math.max(-1, (elHorizon - elCentre) / radius))
  return (Math.acos(z) - z * Math.sqrt(1 - z * z)) / Math.PI
}

export function computeSeries(
  data: DataStore, lat: number, lon: number, hz: Horizon, m: Mission, t0: number, n: number, dt: number, kStart = 0,
): SiteSeries {
  const { up, east, north } = frame(lat, lon)
  const rs = (R_MOON + hz.ground + m.mast) / 1000
  const s: SiteSeries = {
    t0, dt, n,
    sunAz: new Float32Array(n), sunEl: new Float32Array(n), sunRadius: new Float32Array(n), sunFrac: new Float32Array(n),
    earthAz: new Float32Array(n), earthEl: new Float32Array(n), earthClear: new Float32Array(n),
    dsn: new Uint8Array(n), comm: new Uint8Array(n), battery: new Float32Array(n),
  }
  const e = new Float64Array(9)
  let wh = m.startWh, dead = false
  for (let k = 0; k < n; k++) {
    data.sample(t0 + k * dt, e)
    // Sun (parallax over the Moon's radius is 0.0007 deg, kept anyway)
    let vx = e[0] * e[3] - up[0] * rs, vy = e[1] * e[3] - up[1] * rs, vz = e[2] * e[3] - up[2] * rs
    let d = Math.hypot(vx, vy, vz)
    vx /= d; vy /= d; vz /= d
    const sEl = Math.asin(vx * up[0] + vy * up[1] + vz * up[2]) * R2D
    const sAz = (Math.atan2(vx * east[0] + vy * east[1] + vz * east[2], vx * north[0] + vy * north[1] + vz * north[2]) * R2D + 360) % 360
    const sRad = Math.asin(695700 / d) * R2D
    const fs = diskFraction(sEl, horizonAt(hz, sAz), sRad) * (1 - Math.min(1, e[8]))
    // Earth
    vx = e[4] - up[0] * rs; vy = e[5] - up[1] * rs; vz = e[6] - up[2] * rs
    d = Math.hypot(vx, vy, vz)
    vx /= d; vy /= d; vz /= d
    const eEl = Math.asin(vx * up[0] + vy * up[1] + vz * up[2]) * R2D
    const eAz = (Math.atan2(vx * east[0] + vy * east[1] + vz * east[2], vx * north[0] + vy * north[1] + vz * north[2]) * R2D + 360) % 360
    const clear = eEl - horizonAt(hz, eAz)
    const comm = clear >= m.earthMargin && (e[7] > 0.5 || !m.needDsn)
    s.sunAz[k] = sAz; s.sunEl[k] = sEl; s.sunRadius[k] = sRad; s.sunFrac[k] = fs
    s.earthAz[k] = eAz; s.earthEl[k] = eEl; s.earthClear[k] = clear
    s.dsn[k] = e[7]; s.comm[k] = comm ? 1 : 0
    // the battery run starts at landing (step kStart); before that there is no lander
    if (k >= kStart && !dead) {
      const load = fs >= m.litMin ? m.loadLitW : m.loadDarkW
      wh = Math.min(m.batteryWh, wh + (m.arrayW * fs - load) * dt)
      if (wh <= 0) { wh = 0; dead = true }
    }
    s.battery[k] = k >= kStart ? wh : NaN
  }
  return s
}

/** Mission numbers for the steps [k0, k1) of a series. Battery is re-run from a full start at k0. */
export function summarize(s: SiteSeries, m: Mission, k0 = 0, k1 = s.n): SiteSummary {
  let lit = 0, dark = 0, longestDark = 0, comm = 0, gap = 0, longestGap = 0
  let wh = m.startWh, minWh = m.startWh, alive = 0, dead = false
  for (let k = k0; k < k1; k++) {
    const fs = s.sunFrac[k], isLit = fs >= m.litMin
    lit += fs
    dark = isLit ? 0 : dark + s.dt
    longestDark = Math.max(longestDark, dark)
    comm += s.comm[k]
    gap = s.comm[k] ? 0 : gap + s.dt
    longestGap = Math.max(longestGap, gap)
    if (!dead) {
      wh = Math.min(m.batteryWh, wh + (m.arrayW * fs - (isLit ? m.loadLitW : m.loadDarkW)) * s.dt)
      minWh = Math.min(minWh, wh)
      if (wh <= 0) dead = true
      else alive += s.dt
    }
  }
  const n = Math.max(1, k1 - k0)
  return { lit: lit / n, longestDarkH: longestDark, comm: comm / n, longestSilenceH: longestGap, hoursAlive: alive, survives: !dead, minBatteryWh: Math.max(0, minWh) }
}

/** Hours from step k until the next change of a 0/1 state, or null if none within the series. */
export function hoursToChange(flag: (k: number) => boolean, k: number, n: number, dt: number): { hours: number; to: boolean } | null {
  const now = flag(k)
  for (let j = k + 1; j < n; j++) if (flag(j) !== now) return { hours: (j - k) * dt, to: !now }
  return null
}

/** For every step taken as the landing time: would a stay of `stay` steps meet the needs? 1 yes, 0 no. */
export function landingWindows(
  s: SiteSeries, m: Mission, stay: number,
  needs: { minLit: number; maxDarkH: number; minComm: number; powerLasts: boolean }, every = 3,
): Uint8Array {
  const out = new Uint8Array(s.n)
  for (let k = 0; k + stay <= s.n; k += every) {
    const r = summarize(s, m, k, k + stay)
    const ok = r.lit >= needs.minLit && r.longestDarkH <= needs.maxDarkH && r.comm >= needs.minComm && (r.survives || !needs.powerLasts)
    if (ok) out.fill(1, k, Math.min(s.n, k + every))
  }
  return out
}
