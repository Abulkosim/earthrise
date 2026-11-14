// Shared types for sites and their time series.
// Written with AI assistance (Claude); see the README.

export type SiteKind = 'apollo' | 'landed' | 'planned' | 'candidate' | 'custom'

export interface Site {
  id: string
  name: string
  lat: number  // degrees, north positive
  lon: number  // degrees east, 0..360 or -180..180
  kind: SiteKind
  agency?: string
  date?: string   // ISO date of landing, if it happened or is planned
  note?: string   // one plain sentence
  source?: string // URL for the coordinates
}

/** Terrain horizon around a site. */
export interface Horizon {
  naz: number
  el: Float32Array   // degrees, index i is azimuth i * 360 / naz, clockwise from north
  ground: number     // metres above the 1737.4 km sphere
  terrain: boolean   // false when no elevation data covers the site (smooth-sphere horizon)
}

/** What a lander at a site sees and has, step by step. Times are hours since the ephemeris epoch. */
export interface SiteSeries {
  t0: number
  dt: number
  n: number
  sunAz: Float32Array      // degrees
  sunEl: Float32Array      // degrees, centre of the disk
  sunRadius: Float32Array  // degrees
  sunFrac: Float32Array    // visible fraction of the Sun's disk, 0..1 (terrain and eclipses)
  earthAz: Float32Array
  earthEl: Float32Array
  earthClear: Float32Array // degrees the Earth's centre stands above the terrain horizon (negative: hidden)
  dsn: Uint8Array          // bit 0 Goldstone, 1 Madrid, 2 Canberra: complex has the Moon above its mask
  comm: Uint8Array         // 1 when direct-to-Earth contact is possible
  battery: Float32Array    // Wh
}

export interface SiteSummary {
  lit: number             // mean visible Sun fraction over the stay, 0..1
  longestDarkH: number
  comm: number            // fraction of the stay with contact
  longestSilenceH: number
  hoursAlive: number      // hours until the battery is empty, capped at the stay
  survives: boolean
  minBatteryWh: number
}
