// Written with AI assistance (Claude); see the README.
// The CPU site model against the Python reference (pipeline/scripts/make_test_fixtures.py).
import { describe, expect, it } from 'vitest'
import { DataStore, R_MOON, type Manifest } from '../engine/data'
import { DEFAULT_MISSION, type Mission } from '../engine/engine'
import { computeSeries, diskFraction, horizonAt, landingWindows, panelGain, ll2xy, sphereHorizon, summarize, xy2ll } from './sitecalc'
import type { Horizon, SiteSeries } from './types'
import raw from './__fixtures__/reference.json?raw'

interface RefSite {
  id: string; name: string; lat: number; lon: number; terrain: boolean; ground: number; horizon: number[]
  sunAz: number[]; sunEl: number[]; sunFrac: number[]; earthClear: number[]; dsn: number[]
  summary: { lit: number; longestDarkH: number; comm: number; longestSilenceH: number }
}
interface Ref {
  epoch_utc: string; hours0: number; row0: number; steps: number; dt_hours: number; naz: number
  mission: Pick<Mission, 'mast' | 'litMin' | 'earthMargin' | 'needDsn'>
  rows: number[]; sites: RefSite[]
}
const ref: Ref = JSON.parse(raw)

// A real DataStore holding only the table rows that cover the window; row 0 here is row0 of the full table.
function store(): DataStore {
  const d = new DataStore('')
  d.ephem = new Float32Array(ref.rows)
  d.manifest = { ephem: { rows: ref.rows.length / 8 } } as Manifest
  d.epochMs = Date.parse(ref.epoch_utc + 'Z') + ref.row0 * 3600e3
  return d
}

/** Largest absolute difference and where it is, with an optional wrap for angles. */
function worst(a: ArrayLike<number>, b: ArrayLike<number>, wrap = 0) {
  let max = 0, at = -1
  for (let k = 0; k < b.length; k++) {
    let d = a[k] - b[k]
    if (wrap) d = ((d % wrap) + 1.5 * wrap) % wrap - wrap / 2
    if (Math.abs(d) > max) { max = Math.abs(d); at = k }
  }
  return { max, at }
}

const mission: Mission = { ...DEFAULT_MISSION, ...ref.mission }
const data = store()

describe.each(ref.sites)('$name against the reference', (site) => {
  const hz: Horizon = { naz: ref.naz, el: new Float32Array(site.horizon), ground: site.ground, terrain: site.terrain }
  const s = computeSeries(data, site.lat, site.lon, hz, mission, ref.hours0 - ref.row0, ref.steps, ref.dt_hours)

  it('Sun azimuth and elevation within 0.01 deg', () => {
    expect(worst(s.sunAz, site.sunAz, 360).max).toBeLessThan(0.01)
    expect(worst(s.sunEl, site.sunEl).max).toBeLessThan(0.01)
  })
  it('visible Sun fraction within 0.01', () => {
    expect(worst(s.sunFrac, site.sunFrac).max).toBeLessThan(0.01)
  })
  it('Earth clearance over the horizon within 0.01 deg', () => {
    expect(worst(s.earthClear, site.earthClear).max).toBeLessThan(0.01)
  })
  it('DSN bits match', () => {
    expect(Array.from(s.dsn)).toEqual(site.dsn)
  })
  it('stay summary within 0.5 points and 1 h', () => {
    const r = summarize(s, mission)
    expect(Math.abs(r.lit - site.summary.lit)).toBeLessThan(0.005)
    expect(Math.abs(r.comm - site.summary.comm)).toBeLessThan(0.005)
    expect(Math.abs(r.longestDarkH - site.summary.longestDarkH)).toBeLessThanOrEqual(1)
    expect(Math.abs(r.longestSilenceH - site.summary.longestSilenceH)).toBeLessThanOrEqual(1)
  })
})

describe('diskFraction', () => {
  it('is half when the centre sits on the horizon', () => {
    expect(diskFraction(0, 0, 0.27)).toBeCloseTo(0.5, 12)
  })
  it('is 0.8045 with the centre half a radius up', () => {
    expect(diskFraction(0.135, 0, 0.27)).toBeCloseTo(0.8045, 4)
    expect(diskFraction(-0.135, 0, 0.27)).toBeCloseTo(1 - 0.8045, 4)
  })
  it('is 1 fully above and 0 fully below', () => {
    expect(diskFraction(1, 0, 0.27)).toBe(1)
    expect(diskFraction(-1, 0, 0.27)).toBe(0)
  })
})

describe('ll2xy and xy2ll', () => {
  it('put the pole at the origin', () => {
    const [x, y] = ll2xy(-90, 0)
    expect(Math.hypot(x, y)).toBeLessThan(1e-6)
  })
  it('round trip', () => {
    for (const [lat, lon] of [[-89.45, 222.69], [-86, 359.76], [-84.79, 29.2], [-60, 90], [0.67416, 23.47314]]) {
      const [la, lo] = xy2ll(...ll2xy(lat, lon))
      expect(la).toBeCloseTo(lat, 9)
      expect(lo).toBeCloseTo(lon, 9)
    }
  })
})

describe('sphereHorizon', () => {
  it('dips by acos(R / (R + mast))', () => {
    const h = sphereHorizon(2)
    const dip = -Math.acos(R_MOON / (R_MOON + 2)) * 180 / Math.PI
    expect(h.el[0]).toBeCloseTo(dip, 6)
    expect(h.el[719]).toBe(h.el[0])
    expect(dip).toBeCloseTo(-Math.sqrt(4 / R_MOON) * 180 / Math.PI, 5) // about 0.087 deg
    expect(h.terrain).toBe(false)
    expect(sphereHorizon(0).el[0]).toBe(-0)
  })
})

describe('horizonAt', () => {
  const h: Horizon = { naz: 4, el: new Float32Array([0, 10, 20, 30]), ground: 0, terrain: true }
  it('interpolates between samples', () => {
    expect(horizonAt(h, 45)).toBeCloseTo(5, 6)
    expect(horizonAt(h, 180)).toBeCloseTo(20, 6)
  })
  it('wraps past north in both directions', () => {
    expect(horizonAt(h, 315)).toBeCloseTo(15, 6)
    expect(horizonAt(h, -45)).toBeCloseTo(15, 6)
    expect(horizonAt(h, 360)).toBeCloseTo(0, 6)
    expect(horizonAt(h, 405)).toBeCloseTo(5, 6)
  })
})

describe('landingWindows', () => {
  // 24 hourly steps: Sun for the first 12, then night; contact all the time
  function series(): SiteSeries {
    const n = 24
    const f = () => new Float32Array(n)
    const s: SiteSeries = {
      t0: 0, dt: 1, n, sunAz: f(), sunEl: f(), sunRadius: f(), sunFrac: f(), power: f(), earthAz: f(), earthEl: f(), earthClear: f(),
      dsn: new Uint8Array(n).fill(1), comm: new Uint8Array(n).fill(1), battery: f(),
    }
    s.sunFrac.fill(1, 0, 12)
    s.power.fill(1, 0, 12)
    return s
  }
  const needs = { minLit: 0.75, maxDarkH: 1, minComm: 0.5, powerLasts: false }
  it('marks the landing times whose stay meets the needs', () => {
    // stay of 4 h: landing at 9 gives 3 lit hours and 1 dark, landing at 10 gives 2 and 2
    const out = landingWindows(series(), DEFAULT_MISSION, 4, needs, 1)
    expect(Array.from(out)).toEqual([...Array(10).fill(1), ...Array(14).fill(0)])
  })
  it('fills every tested step forward to the next one', () => {
    const out = landingWindows(series(), DEFAULT_MISSION, 4, needs, 3)
    expect(Array.from(out)).toEqual([...Array(12).fill(1), ...Array(12).fill(0)])
  })
  it('honours the power need', () => {
    const tiny: Mission = { ...DEFAULT_MISSION, arrayW: 0, batteryWh: 100, startWh: 100 }
    const out = landingWindows(series(), tiny, 4, { ...needs, powerLasts: true }, 1)
    expect(out.every((v) => v === 0)).toBe(true)
  })
})

describe('panelGain', () => {
  const fixed = (az: number, tilt: number) => ({ ...DEFAULT_MISSION, panelFixed: true, panelAz: az, panelTilt: tilt })
  it('is 1 for an array that tracks the Sun', () => {
    expect(panelGain(DEFAULT_MISSION, 123, 4)).toBe(1)
  })
  it('is 1 for an upright array facing a Sun on the horizon, 0 for one facing away', () => {
    expect(panelGain(fixed(270, 90), 270, 0)).toBeCloseTo(1, 12)
    expect(panelGain(fixed(270, 90), 90, 0)).toBe(0)
  })
  it('is the sine of the elevation for a flat array', () => {
    expect(panelGain(fixed(0, 0), 200, 30)).toBeCloseTo(0.5, 12)
  })
  it('is the cosine of the azimuth offset for an upright array and a low Sun', () => {
    expect(panelGain(fixed(180, 90), 240, 0)).toBeCloseTo(0.5, 12)
  })
})
