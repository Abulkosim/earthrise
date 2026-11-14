// Written with AI assistance (Claude); see the README.
// The public validation page, "How we know it is right". Plain DOM, no framework.
// Layout: a slim sticky header, a hero over a lit lunar horizon with the Earth rising, then one
// card per check in a readable column. On wide screens a rail on the left lists the sections.
import './index.css'
import './validation.css'
import { barkerCheck, explain, goddardCheck, horizonCheck, type BarkerRow, type GoddardResult, type PointRow } from './checks'
import report from './data/validation.json'
import { DataStore } from './engine/data'
import { Engine } from './engine/engine'

type Child = Node | string | null | undefined | false
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(c)
  return e
}
const p = (...kids: Child[]) => h('p', {}, ...kids)
const cls = (c: string, ...kids: Child[]) => h('span', { class: c }, ...kids)
const sun = (s = 'Sun') => cls('sun', s)
const earth = (s = 'Earth') => cls('earth', s)
type Tone = 'sun' | 'earth' | ''
/** A table in a scrolling frame. `tones` colours the values of a column labelled Sun or Earth. */
function table(head: Child[][], rows: Child[][], o: { caption?: string; tones?: Tone[] } = {}) {
  const td = (c: Child, i: number) => h('td', o.tones?.[i] ? { class: `tone-${o.tones[i]}` } : {}, c)
  const t = h('table', {},
    h('thead', {}, ...head.map((r) => h('tr', {}, ...r.map((c) => (c instanceof HTMLElement && c.tagName === 'TH' ? c : h('th', {}, c)))))),
    h('tbody', {}, ...rows.map((r) => h('tr', {}, ...r.map(td)))))
  const wrap = h('div', { class: 'vtable' }, h('div', { class: 'vtable-scroll' }, t))
  if (o.caption) wrap.append(h('p', { class: 'vcaption' }, o.caption))
  return wrap
}
const deg = (v: number, d = 6) => `${v.toFixed(d)}°`
const pct = (v: number, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : '')
const signed = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`
const hm = (iso: string) => iso.slice(11, 16)
const minutes = (a: string, b: string) => Math.round((Date.parse(b + 'Z') - Date.parse(a + 'Z')) / 60000)

// ---- icons (paths from Lucide, ISC licence) ---------------------------------------
const ICONS = {
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
  spin: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  done: '<circle cx="12" cy="12" r="10"/><path d="m16 9-5.5 5.5L8 12"/>',
  alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  orbit: '<path d="M20.341 6.484A10 10 0 0 1 10.266 21.85"/><path d="M3.659 17.516A10 10 0 0 1 13.74 2.152"/><circle cx="12" cy="12" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/>',
  horizon: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/><path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  pin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  limits: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/><path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
  terminal: '<path d="M12 19h8"/><path d="m4 17 6-6-6-6"/>',
  table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>',
} as const
type IconName = keyof typeof ICONS
function icon(name: IconName, c = '') {
  const s = h('span', { class: `vicon ${c}`, 'aria-hidden': 'true' })
  // constant markup from the table above, never user input
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  return s
}

// ---- shared engine for the two live checks ------------------------------------
let enginePromise: Promise<Engine> | null = null
let contextLost = false
function engine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const data = new DataStore()
      await data.init()
      const c = document.createElement('canvas') // never shown; the checks read numbers back from the GPU
      c.width = 768; c.height = 768
      c.addEventListener('webglcontextlost', () => { contextLost = true })
      return new Engine(c, data)
    })()
    enginePromise.catch(() => { enginePromise = null })
  }
  return enginePromise
}

/** A live check: what the button does, the button, a progress line and a status line. */
const buttons: HTMLButtonElement[] = []
function liveCheck(about: string, run: (setStatus: (s: string, frac?: number) => void) => Promise<void>) {
  const label = h('span', {}, 'Run this check in your browser')
  const lead = icon('play', 'vbtn-icon')
  const btn = h('button', { type: 'button', class: 'vbtn vbtn-primary' }, lead, label)
  const share = h('span', { class: 'vrun-pct', 'aria-hidden': 'true' })
  const fill = h('div', { class: 'vprogress-fill' })
  const bar = h('div', { class: 'vprogress', hidden: '' }, fill)
  const statusIcon = h('span', { class: 'vstatus-icon' })
  const statusText = h('span', {})
  const status = h('div', { class: 'vstatus', role: 'status', hidden: '' }, statusIcon, statusText)
  const box = h('div', { class: 'vrun' },
    h('p', { class: 'vrun-about' }, about),
    h('div', { class: 'vrun-row' }, btn, share), bar, status)
  buttons.push(btn)
  const setIcon = (name: IconName | null) => statusIcon.replaceChildren(...(name ? [icon(name)] : []))
  btn.addEventListener('click', async () => {
    for (const b of buttons) b.disabled = true
    btn.setAttribute('aria-busy', 'true')
    lead.replaceWith(icon('spin', 'vbtn-icon vspin'))
    label.textContent = 'Running in your browser'
    box.dataset.state = 'running'
    status.className = 'vstatus'
    status.setAttribute('role', 'status')
    setIcon(null)
    status.hidden = false
    bar.hidden = false
    const t0 = performance.now()
    const set = (s: string, f?: number) => {
      statusText.textContent = s
      if (f !== undefined) {
        const v = Math.round(f * 100)
        fill.style.width = `${v}%`
        share.textContent = `${v}%`
      }
    }
    try {
      set('Loading the terrain overview and the ephemeris table (about 28 MB the first time).', 0)
      contextLost = false
      await run(set)
      set(`Done in ${((performance.now() - t0) / 1000).toFixed(0)} s on this computer.`, 1)
      box.dataset.state = 'done'
      setIcon('done')
    } catch (e) {
      console.error(e)
      box.dataset.state = 'error'
      bar.hidden = true
      share.textContent = ''
      status.className = 'vstatus error'
      status.setAttribute('role', 'alert')
      setIcon('alert')
      statusText.textContent = 'The check stopped. ' + (contextLost ? 'The browser took the GPU away from the page (context lost). Reload and try again with fewer tabs open.' : explain(e))
    } finally {
      btn.querySelector('.vspin')?.replaceWith(lead)
      btn.removeAttribute('aria-busy')
      label.textContent = 'Run this check in your browser'
      for (const b of buttons) b.disabled = false
    }
  })
  return box
}

/** One check as a card: icon, title, then its content. */
function section(id: string, ic: IconName, title: string, ...kids: Child[]) {
  return h('section', { class: 'vsection', id, 'aria-labelledby': `${id}-h` },
    h('div', { class: 'vsection-head' }, icon(ic, 'vsection-icon'), h('h2', { id: `${id}-h` }, title)),
    ...kids)
}

// ---- header and hero ------------------------------------------------------------
const base = import.meta.env.BASE_URL

function header() {
  return h('header', { class: 'vheader' },
    h('div', { class: 'vheader-in' },
      h('a', { class: 'vmark place', href: base, 'aria-label': 'Earthrise, the map' }, 'Earthrise'),
      h('span', { class: 'vheader-title' }, 'How we know it is right'),
      h('a', { class: 'vbtn vbtn-ghost vback', href: base }, icon('back', 'vbtn-icon'), h('span', {}, 'Back to the map'))))
}

/** The lunar horizon under the hero: a limb lit from the left and the Earth half risen over it. */
function horizonArt() {
  const s = h('div', { class: 'vlimb', 'aria-hidden': 'true' })
  s.innerHTML = `<svg viewBox="0 0 1440 240" preserveAspectRatio="xMidYMax slice">
  <defs>
    <linearGradient id="rim" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#f5c96a" stop-opacity="0"/>
      <stop offset="0.14" stop-color="#f5c96a" stop-opacity="0.95"/>
      <stop offset="0.4" stop-color="#f5c96a" stop-opacity="0.5"/>
      <stop offset="0.62" stop-color="#b8b3a9" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#b8b3a9" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="sunwash" cx="0.16" cy="1" r="0.5" gradientTransform="scale(1 0.5) translate(0 1)">
      <stop offset="0" stop-color="#f5c96a" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#f5c96a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="earthlit" cx="0.3" cy="0.35" r="0.75">
      <stop offset="0" stop-color="#cfe6fb"/>
      <stop offset="0.35" stop-color="#7db8f0"/>
      <stop offset="0.72" stop-color="#2c4a68"/>
      <stop offset="1" stop-color="#0d1620"/>
    </radialGradient>
    <radialGradient id="earthglow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.45" stop-color="#7db8f0" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#7db8f0" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>
  <rect x="0" y="0" width="1440" height="240" fill="url(#sunwash)"/>
  <g class="vlimb-earth">
    <circle cx="905" cy="153" r="74" fill="url(#earthglow)"/>
    <circle cx="905" cy="153" r="28" fill="url(#earthlit)"/>
  </g>
  <path d="M-40 236 Q720 64 1480 236 L1480 260 L-40 260 Z" fill="#050506"/>
  <path d="M-40 236 Q720 64 1480 236" fill="none" stroke="url(#rim)" stroke-width="6" opacity="0.35" filter="url(#soft)"/>
  <path d="M-40 236 Q720 64 1480 236" fill="none" stroke="url(#rim)" stroke-width="1.6"/>
</svg>`
  return s
}

function opening() {
  return h('div', { class: 'vhero' },
    h('h1', {}, 'How we know it is right'),
    h('p', { class: 'lede' },
      'A planner who picks a landing site from Earthrise is betting the mission on its numbers: a site it calls sunlit for 80 percent of a stay must really be, or the lander runs its battery flat in the dark. ',
      'So we checked each part of the model, from where the Sun and the Earth are to what the terrain hides, against sources outside the project: JPL Horizons, the Apollo records, NASA Goddard\'s illumination maps, a published table of the lighting on the connecting ridge and our own slower reference code.'),
    p(cls('note', 'Unless a table says otherwise, the numbers are from our own runs; the GPU checks ran on an Apple M2 Pro in Chrome. Three of the checks have a button that recomputes them on your GPU, in this page, and puts your numbers next to ours.')))
}

// ---- sections ------------------------------------------------------------------
function ephemerisSection() {
  const r = report
  const worstH = Math.max(...r.horizons.flatMap((x) => [x.max_az_diff_deg, x.max_el_diff_deg]))
  const worstA = Math.max(...r.apollo.map((x) => Math.abs(x.diff_deg)))
  const e = r.eclipse
  const total = e.total_start_utc && e.total_end_utc ? minutes(e.total_start_utc, e.total_end_utc) : 0
  const siteName = (s: string) => (s === 'near the pole' ? 'Near the pole' : s)
  return section('ephemeris', 'orbit', 'Where the Sun and the Earth are',
    p('Positions come from NASA\'s SPICE toolkit with JPL\'s DE440 planetary ephemeris, in the MOON_ME frame that the LOLA terrain maps use. They are corrected for light time and for stellar aberration, so they give where the Sun and the Earth appear, not where they are.'),
    h('h3', {}, 'Against JPL Horizons'),
    p(`We asked the JPL Horizons service for the azimuth and elevation of the Sun and the Earth from three lunar sites, every ${r.horizons_window.step.replace(' h', ' hours')} from 1 to 29 March 2027, and computed the same with our code. The table gives the largest difference over the ${r.horizons[0].samples} samples of each series. Azimuth differences are measured on the sky.`),
    table([['Site', 'Body', 'Samples', 'Largest azimuth difference', 'Largest elevation difference']],
      r.horizons.map((x) => [siteName(x.site), x.body === 'Sun' ? sun() : earth(), String(x.samples), deg(x.max_az_diff_deg), deg(x.max_el_diff_deg)])),
    p(`The largest difference is ${worstH.toFixed(5)} degrees. The Sun's disc is about half a degree across, so this is far below anything a lander would notice. The automated test fails if any difference reaches 0.001 degrees.`),
    h('h3', {}, 'Against the Apollo landings'),
    p('The Apollo Lunar Surface Journal lists the Sun\'s elevation at each touchdown, from a table by J. Scotti. We computed it for the same place and time.'),
    table([['Mission', 'Touchdown (UTC)', sun('Recorded'), sun('Ours'), 'Difference']],
      r.apollo.map((x) => [x.mission, x.utc.replace('T', ' '), deg(x.recorded_deg, 2), deg(x.ours_deg, 3), signed(x.diff_deg, 3) + '°']),
      { tones: ['', '', 'sun', 'sun', ''] }),
    p(`The largest difference is ${worstA.toFixed(3)} degrees. The journal gives its values to a hundredth of a degree. The test allows 0.15 degrees.`),
    h('h3', {}, 'The eclipse Blue Ghost saw'),
    p('On 14 March 2025 the Earth passed in front of the Sun as seen from the Moon, and the Blue Ghost lander photographed it. Our model reproduces it from the ephemeris alone. ',
      `Seen from the Moon's centre, the Earth starts to cover the Sun at ${hm(e.partial_start_utc)} UTC, hides it completely from ${e.total_start_utc ? hm(e.total_start_utc) : ''} to ${e.total_end_utc ? hm(e.total_end_utc) : ''} (${Math.floor(total / 60)} hours ${total % 60} minutes), and lets it go at ${hm(e.partial_end_utc)}. `,
      `The covered fraction reaches ${e.max_fraction.toFixed(2)}, the centres are closest at ${hm(e.max_utc)} UTC. The app takes eclipses into account when it counts sunlight.`),
    p(cls('muted', `Computed in ${e.step_s} second steps. Generated ${r.generated} by pipeline/scripts/validation_report.py.`)),
  )
}

function horizonSection() {
  const thead = [
    [h('th', { rowspan: '2', class: 'left' }, 'Point'), h('th', { colspan: '2' }, 'Horizon difference'), h('th', { colspan: '2' }, sun('Sunlit share')), h('th', { colspan: '2' }, earth('Contact share'))],
    ['mean', 'largest', 'reference', 'engine', 'reference', 'engine'],
  ]
  const tableWrap = h('div', { class: 'vreveal', hidden: '' })
  const summary = h('p', { class: 'vsummary', hidden: '' })
  const tbody = () => tableWrap.querySelector('tbody')!
  const addRow = (r: PointRow) => tbody().append(h('tr', { class: 'vfresh' },
    h('td', {}, cls('place', r.name)), h('td', {}, deg(r.mean, 3)), h('td', {}, deg(r.max, 2)),
    h('td', { class: 'tone-sun' }, pct(r.litRef)), h('td', { class: 'tone-sun' }, pct(r.lit)),
    h('td', { class: 'tone-earth' }, pct(r.earthRef)), h('td', { class: 'tone-earth' }, pct(r.earth))))
  const run = liveCheck('The button runs the same comparison on your GPU. It downloads the terrain around each point, a few tens of megabytes in all, and can take a minute or two. To finish sooner it computes a smaller patch of map around each point than our run did; the point itself is computed the same way.',
    async (set) => {
      const eng = await engine()
      tableWrap.replaceChildren(table(thead, []))
      tableWrap.hidden = false
      summary.hidden = true
      const r = await horizonCheck(eng, (d, t, name) => { if (name) set(`Point ${d + 1} of ${t}: ${name}.`, d / t) }, { fieldW: 128, onRow: addRow })
      summary.textContent = `On this computer: the horizon differs from the reference by ${r.mean.toFixed(3)} degrees on average over all ${r.rows.length} points and 720 directions (95th percentile ${r.p95.toFixed(3)}). ` +
        `The sunlit share agrees within ${(r.worstLit * 100).toFixed(2)} percentage points at every point, the contact share within ${(r.worstEarth * 100).toFixed(2)}.`
      summary.hidden = false
    })
  return section('horizon', 'horizon', 'The terrain horizon',
    p('Knowing where the Sun is helps only if you also know what blocks it. At the pole the Sun never climbs more than about a degree and a half above the horizon, so a ridge 10 km away decides whether a site is lit.'),
    h('h3', {}, 'Which terrain map'),
    p('Earthrise uses NASA Goddard\'s track-adjusted LOLA maps: 5 m per pixel from 87° S to the pole (Barker et al. 2021), 20 m to 80° S and 240 m to 60° S (Barker et al. 2023).'),
    p('Earlier versions used the older LOLA mosaics from the PDS. Those carry errors along the laser tracks: ridges a few metres high that are not on the ground. With the Sun almost on the horizon, such a ridge casts a long shadow. On the connecting ridge next to Shackleton crater, the older 5 m mosaic gave a longest lit period of about 25 days; the adjusted map gives about 220, close to the published value. The adjusted maps remove those track errors, so we switched.'),
    h('h3', {}, 'How the engine finds the horizon'),
    p(`The GPU engine walks the terrain outward from every pixel of the view in 360 directions and keeps the highest angle it meets: the horizon. It nests four grids: the finest one that covers the view (5 m to 80 m), a 20 or 40 m ring around a 5 or 10 m focus, then 160 m and 960 m further out, up to 400 km away. It allows for the curve of the Moon. In the Goddard run below it traced 262,144 horizons in ${report.goddard.horizons_s.toFixed(1)} seconds. Then it runs the mission hour by hour against those horizons.`),
    p('It also runs 18.6 years in 12-hour steps against the same horizons, marks the ground that never sees any part of the Sun as permanent shadow, and measures how far every point is from it.'),
    p('Fast code is easy to get wrong, so we also wrote a slow reference model in Python that does the same walk one point at a time, in 720 directions, on the full-resolution maps. We picked 24 hard points near the pole: ridges, crater rims and crater floors that never see the Sun. For each we compare the horizon in all 720 directions, and then the share of time the Sun is up and the Earth is in view over two lunar days (59 days from 1 January 2027, hourly, with a 2 m mast).'),
    p('The engine views each point at 5 m per pixel, so it reads the same 5 m terrain as the reference wherever that terrain exists.'),
    h('p', { class: 'vresult' }, h('strong', {}, 'Our run: '), 'on the adjusted maps the horizon differed by 0.008 degrees on average and 0.16 degrees at most, and the sunlit and Earth-contact shares agreed within 0.2 percentage points at every one of the 24 points. Safari 26.6 gave the same numbers as Chrome.'),
    run, tableWrap, summary,
  )
}

// Black for never, gold for always, on a straight ramp. NaN: outside the published map.
function paint(cv: HTMLCanvasElement, v: Float32Array, w: number, h: number) {
  cv.width = w; cv.height = h
  const css = getComputedStyle(document.documentElement)
  const hex = (name: string) => { const s = css.getPropertyValue(name).trim().replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) }
  const gold = hex('--sun'), none = hex('--ground-1')
  const ctx = cv.getContext('2d')!
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const a = v[i], c = Number.isNaN(a) ? none : gold.map((g) => g * Math.min(1, Math.max(0, a)))
    img.data.set([c[0], c[1], c[2], 255], i * 4)
  }
  ctx.putImageData(img, 0, 0)
}

function goddardSection() {
  // our run on the adjusted maps, stored in validation.json (how it was measured is written there)
  const ours = report.goddard
  const head = [['', 'Points', 'Correlation', 'Mean absolute difference', 'Bias']]
  const rows: Child[][] = []
  for (const body of ['sun', 'earth'] as const) {
    const o = ours[body]
    rows.push([h('span', {}, body === 'sun' ? sun() : earth(), ', our run'), o.points.toLocaleString('en-US'), o.corr.toFixed(3), `${o.mae_pts.toFixed(2)} points`, `${signed(o.bias_pts)} points`])
    rows.push([h('span', {}, body === 'sun' ? sun() : earth(), ', your browser'), '', '', '', ''])
  }
  const t = table(head, rows, { caption: 'Shares of time in percentage points. Bias is ours minus theirs: positive means we see the body slightly more often.' })
  // the "your browser" rows: first cell holds the label, the rest fill in after a run
  const yourRows = Array.from(t.querySelectorAll('tbody tr')).filter((_, i) => i % 2 === 1)
  for (const [i, r] of yourRows.entries()) r.className = `vyours tone-row-${i === 0 ? 'sun' : 'earth'}`
  // permanent shadow: our run (same as above), then the live one
  const psrOurs = ours.psr
  const psrResult = p(h('strong', {}, 'Your browser: '), cls('muted', 'press the button below to compute it.'))
  psrResult.className = 'vresult'
  const fill = (res: GoddardResult) => {
    ;(['sun', 'earth'] as const).forEach((b, i) => {
      const s = res[b], tds = yourRows[i].children
      tds[1].textContent = s.n.toLocaleString('en-US')
      tds[2].textContent = s.corr.toFixed(3)
      tds[3].textContent = `${(s.mae * 100).toFixed(2)} points`
      tds[4].textContent = `${signed(s.bias * 100)} points`
      yourRows[i].classList.add('vfresh')
    })
    const ps = res.psr, n = (v: number) => v.toLocaleString('en-US')
    psrResult.replaceChildren(h('strong', {}, 'Your browser: '),
      ps.theirs ? `of the ${n(ps.theirs)} points Goddard's map calls permanently shadowed, ${pct(ps.oursOfTheirs)} are permanently shadowed in ours. ` : 'Goddard\'s map calls none of the compared points permanently shadowed. ',
      ps.ours ? `Of the ${n(ps.ours)} points permanently shadowed in ours, ${pct(ps.theirsOfOurs)} are permanently shadowed in theirs.` : 'None of the compared points is permanently shadowed in ours.')
    psrResult.classList.add('vfresh')
  }
  const cvOurs = h('canvas', { width: '512', height: '512', 'aria-label': 'Average sunlight computed in this browser' })
  const cvTheirs = h('canvas', { width: '512', height: '512', 'aria-label': 'Average sunlight from the NASA Goddard map' })
  const ramp = () => h('div', { class: 'vramp', 'aria-hidden': 'true' })
  const maps = h('div', { class: 'vmaps vreveal', hidden: '' },
    h('div', { class: 'vmaps-grid' },
      h('figure', {}, h('div', { class: 'vframe' }, cvOurs), h('figcaption', {}, 'Ours, computed in your browser')),
      h('figure', {}, h('div', { class: 'vframe' }, cvTheirs), h('figcaption', {}, 'NASA Goddard, published'))),
    h('div', { class: 'vramp-row', 'aria-hidden': 'true' }, h('span', {}, '0%'), ramp(), h('span', {}, '100%')),
    p(cls('note', 'Average share of time in sunlight over 18.6 years, 41 km square centred on the south pole, 0° longitude at the top. Black is never lit, gold is always lit.')))
  const run = liveCheck('The button runs the same comparison on your GPU. It downloads a 61 km crop of each published map, about 2.4 MB, and the terrain around the pole.',
    async (set) => {
      const eng = await engine()
      const res = await goddardCheck(eng, (d, t, label) => { if (label) set(label + '.', d / t) })
      fill(res)
      paint(cvOurs, res.ours.sun, res.w, res.h)
      paint(cvTheirs, res.theirs.sun, res.w, res.h)
      maps.hidden = false
    })
  return section('goddard', 'map', 'Long-term averages against NASA Goddard',
    p('The LOLA team at NASA Goddard published maps of the south pole that give, for every 60 m pixel, the share of time the Sun and the Earth are above the terrain horizon, averaged over 18.6 years. That is one full turn of the Moon\'s orbital plane, so every combination of seasons and Earth positions is in it. The maps are AVGVISIB_85S_060M_201608, made with the method of Mazarico et al. 2011. They answer the same question as Earthrise with different people, different code and an older terrain model, which makes them a good outside check.'),
    p('We run our engine over the same 18.6 years in 12-hour steps for 262,144 points in a 41 km square centred on the pole, with the observer on the surface, and compare point by point. For the Earth we count any part of its disc, as their map does.'),
    t,
    h('h3', {}, 'Permanent shadow'),
    p('Ground that never sees any part of the Sun can hold ice, and the app lets a brief ask for it near the landing point. Among the compared points, we count those that are never lit in Goddard\'s map (a stored value of 0) and those that are never lit in ours (no 12-hour step with any part of the Sun over the 18.6 years), and how many are both.'),
    h('p', { class: 'vresult' }, h('strong', {}, 'Our run: '),
      `of the ${psrOurs.theirs.toLocaleString('en-US')} points Goddard's map calls permanently shadowed, ${pct(psrOurs.ours_of_theirs)} are permanently shadowed in ours. `,
      `Of the ${psrOurs.ours.toLocaleString('en-US')} points permanently shadowed in ours, ${pct(psrOurs.theirs_of_ours)} are permanently shadowed in theirs.`),
    psrResult,
    p('Their map uses a 60 m elevation model from 2016; ours uses the newer track-adjusted maps. So some difference is expected even if both are right.'),
    run, maps,
  )
}

// Our run of barkerCheck, stored in validation.json: the 14 rows of the table, each with the paper's bound.
const BARKER_OURS: BarkerRow[] = report.barker.rows

/** How many of a row's three values sit on the right side of the paper's bound. */
const barkerPasses = (r: BarkerRow) => Number(r.avg >= r.paperAvgP1) + Number(r.lcipDays >= r.paperLcipP1) + Number(r.lcspDays <= r.paperLcspP99)

function barkerTable(rows: BarkerRow[], caption?: string) {
  const head = [['Region', sun('Average illumination'), sun('Longest lit period'), 'Longest shadow', 'Right side']]
  // ours on top, the paper's bound under it
  const cell = (ours: string, bound: string) => h('span', {}, ours, h('span', { class: 'vbound' }, bound))
  const body = rows.map((r) => {
    const n = barkerPasses(r)
    return [h('span', {}, `${r.roi}, at ${r.mast} m`, h('span', { class: 'vbound' }, `${r.pixels} pixels`)),
      cell(`${r.avg.toFixed(1)}%`, `paper at least ${r.paperAvgP1.toFixed(1)}%`),
      cell(`${r.lcipDays.toFixed(1)} d`, `paper at least ${r.paperLcipP1.toFixed(1)} d`),
      cell(`${r.lcspDays.toFixed(1)} d`, `paper at most ${r.paperLcspP99.toFixed(1)} d`),
      n === 3 ? 'all 3' : cls('vfail', `${n} of 3`)]
  })
  const t = table(head, body, { caption, tones: ['', 'sun', 'sun', '', ''] })
  t.classList.add('vbarker')
  return t
}

function barkerSection() {
  const passed = BARKER_OURS.reduce((a, r) => a + barkerPasses(r), 0)
  const at5 = BARKER_OURS.filter((r) => r.mast === 5)
  const above = at5.map((r) => r.avg - r.paperAvgP1)
  const range = (a: number[], d = 1) => `${Math.min(...a).toFixed(d)} to ${Math.max(...a).toFixed(d)}`
  const yours = h('div', { class: 'vreveal', hidden: '' })
  const summary = h('p', { class: 'vsummary', hidden: '' })
  const run = liveCheck('The button runs the same comparison on your GPU. It downloads the 5 m terrain of the ridge, a few megabytes, traces the horizon at each of the 2,114 pixels and runs the two years hour by hour. It took about half a minute on our computer the first time, and a few seconds once the terrain was in the browser\'s cache.',
    async (set) => {
      const eng = await engine()
      yours.hidden = true
      summary.hidden = true
      const r = await barkerCheck(eng, (d, t, label) => { if (d < t) set(`${label[0].toUpperCase()}${label.slice(1)}.`, d / t) })
      yours.replaceChildren(h('h3', {}, 'Your browser'), barkerTable(r.rows))
      yours.hidden = false
      const ok = r.rows.reduce((a, x) => a + barkerPasses(x), 0)
      summary.textContent = `On this computer: ${ok} of the ${r.rows.length * 3} values are on the right side of the paper's bound.`
      summary.hidden = false
    })
  return section('barker', 'table', 'Against a published table',
    p('Barker et al. 2021 (Planetary and Space Science 203:105119) made the 5 m terrain map that Earthrise now uses. Their Table 2 gives the lighting of seven small regions on the connecting ridge next to Shackleton crater, from 1 January 2024 to 1 January 2026, hourly, for an observer 1 m and 5 m above the ground: the average share of the Sun that is visible, the longest stretch with any of the Sun in view and the longest stretch with none of it.'),
    p('Their numbers are not single values. They made 100 copies of the terrain, each with random errors of the size the map is expected to have, and give a percentile over those copies: the 1st percentile for the average illumination and the longest lit period, the 99th for the longest shadow. Ours is one run on the terrain as published. So we cannot expect to match their numbers, only to fall on the right side of each bound: at least their 1st percentile for the first two, at most their 99th for the shadow.'),
    p('We trace the horizon at every 5 m pixel inside each region, 2,114 in all, and average over the region as they do.'),
    h('h3', {}, 'Our run'),
    barkerTable(BARKER_OURS, 'Ours: one run on the published terrain, the region average, a uniform Sun disc. Paper: percentiles over 100 terrain copies, with a limb-darkened Sun.'),
    h('p', { class: 'vresult' }, h('strong', {}, 'Our run: '),
      `${passed} of the ${BARKER_OURS.length * 3} values are on the right side of the paper's bound. `,
      `At 5 m height our average illumination is ${range(above)} points above their 1st percentile, `,
      `our longest lit period is ${range(at5.map((r) => r.lcipDays), 0)} days against their ${range(at5.map((r) => r.paperLcipP1), 0)}, `,
      `and our longest shadow ${range(at5.map((r) => r.lcspDays))} days against their ${range(at5.map((r) => r.paperLcspP99))}.`),
    p('At 1 m height the paper\'s bounds are looser and our values sit further inside them.'),
    run, yours, summary,
  )
}

// Measured with pipeline/scripts/make_test_fixtures.py at the catalogue's connecting-ridge point, first step 5 m against 1.25 m.
const SITE_STEP_NOTE = 'The reference walks outward from the point in steps that start at 1.25 m. An earlier run started at 5 m and skipped terrain on the 5 m map: on the connecting ridge its horizon was off by up to 0.37 degrees and its longest dark by 2 hours. The GPU engine agreed with the finer walk, so this comparison corrected the reference, not the app.'

function siteSection() {
  // reference: the stay summaries of the unit-test fixture; app: the same sites computed in the app page.
  // Both are stored in validation.json.
  const sp = report.site_panel
  const app = new Map(report.site_panel_app.sites.map((x) => [x.id, x]))
  const land = new Date(sp.start_utc + 'Z')
  const date = `${land.getUTCDate()} ${land.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${land.getUTCFullYear()}`
  const where = (lat: number, lon: number) => ` (${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}, ${lon.toFixed(2)}° E)`
  const thead = [
    [h('th', { rowspan: '2', class: 'left' }, 'Site'), h('th', { colspan: '2' }, sun('Sunlit')), h('th', { colspan: '2' }, sun('Longest dark')), h('th', { colspan: '2' }, earth('Earth contact'))],
    ['reference', 'app', 'reference', 'app', 'reference', 'app'],
  ]
  const rows = sp.sites.map((x) => {
    const a = app.get(x.id)
    return [h('span', {}, cls('place', x.name), where(x.lat, x.lon)),
      pct(x.lit), a ? pct(a.lit) : '', `${x.longest_dark_h} h`, a ? `${a.longest_dark_h} h` : '', pct(x.comm), a ? pct(a.comm) : '']
  })
  // the worst differences, computed from the stored rows so the sentence cannot drift from the table
  const pairs = sp.sites.flatMap((x) => { const a = app.get(x.id); return a ? [{ x, a }] : [] })
  const worst = (f: (q: (typeof pairs)[number]) => number) => pairs.reduce((m, q) => (Math.abs(f(q)) > Math.abs(f(m)) ? q : m), pairs[0])
  const wl = worst((q) => q.a.lit - q.x.lit), wd = worst((q) => q.a.longest_dark_h - q.x.longest_dark_h), wc = worst((q) => q.a.comm - q.x.comm)
  const same = pairs.filter((q) => Math.abs(q.a.lit - q.x.lit) < 0.005 && q.a.longest_dark_h === q.x.longest_dark_h && Math.abs(q.a.comm - q.x.comm) < 0.005)
  return section('site', 'pin', 'The site panel against the reference',
    p(`When you click a point, the app's site panel computes the stay for that one point: it traces the horizon on the GPU and runs the stay hour by hour. We compared it with the Python reference at ${sp.sites.length} sites: a ${sp.days}-day stay landing on ${date}, with the solar array and antenna on a ${sp.mast_m} m mast.`),
    table(thead, rows, { tones: ['', 'sun', 'sun', 'sun', 'sun', 'earth', 'earth'], caption: 'Longest dark is the longest stretch with less than half of the Sun in view.' }),
    h('p', { class: 'vresult' }, h('strong', {}, 'Our run: '),
      `at ${same.length} of the ${pairs.length} sites the app and the reference agree within half a percentage point and to the hour. `,
      `The largest differences are ${Math.abs((wl.a.lit - wl.x.lit) * 100).toFixed(1)} points of sunlight, ${Math.abs(wd.a.longest_dark_h - wd.x.longest_dark_h)} hours of longest dark and ${Math.abs((wc.a.comm - wc.x.comm) * 100).toFixed(1)} points of contact.`),
    p(`What differs between the two is only the horizon: the unit tests feed the reference horizon to the app's site model and get the reference numbers back. At these sites the horizon the GPU traces differs from the reference's by no more than ${Math.max(...pairs.map((q) => q.a.horizon_mean_diff_deg)).toFixed(3)} degrees on average, and by ${Math.max(...pairs.map((q) => q.a.horizon_max_diff_deg)).toFixed(2)} degrees in any one direction.`),
    p(cls('note', SITE_STEP_NOTE)),
  )
}

function limitsSection() {
  const items = [
    'The finest terrain is 5 m per pixel, and only from 87° S to the pole; further out it is 20 m to 80° S and 240 m to 60° S. No map sees boulders or craters smaller than a few pixels. A boulder next to the lander can still shade it.',
    'The terrain is one map with its own errors. Barker et al. 2021 give their numbers over 100 copies of the terrain with random errors; we use the map as published, so our numbers carry no error bars.',
    'There is no thermal model. The battery model is a simple energy balance: array output in, loads out.',
    'The solar array either tracks the Sun or is fixed at an azimuth and tilt you give in the brief. The antenna has no pointing limits. Light reflected from the terrain is ignored, and the Sun is a disc of even brightness, without the darker edge of the real one.',
    'DSN visibility uses the IAU model of the Earth\'s rotation and a 10 degree elevation mask at the three complexes.',
    'The map\'s horizon cache stores each angle in 10 bits: steps of 0.02 degrees near the pole, coarser where the Sun and Earth can stand higher. While time plays, the map lights the ground from that cache. The site panel uses full precision.',
    'Sites north of 60° S have no terrain in the app and use a smooth-sphere horizon. The app says so.',
    'Permanent shadow is found in 12-hour steps on the map\'s own grid of points, so a shadow smaller than one of its cells can be missed. The distance to it counts only shadow inside the view.',
    'The ephemeris table runs from 2023 to 2044.',
  ]
  return section('limits', 'limits', 'What the model leaves out', h('ul', { class: 'vlist' }, ...items.map((s) => h('li', {}, s))))
}

function reproduceSection() {
  const cmds = [
    'cd pipeline',
    'python3 -m venv .venv && source .venv/bin/activate',
    'pip install -e ".[dev]"',
    'python scripts/fetch_data.py kernels adj validation     # NASA source files, about 7.3 GB',
    'python scripts/convert_adj.py                           # decode the adjusted terrain maps',
    'python scripts/build_web_data.py dem ephem validation   # browser data, about 2.4 GB',
    'python scripts/make_fixtures.py                         # reference answers for the 24 points',
    'python scripts/make_test_fixtures.py                    # reference answers for the unit tests',
    'python scripts/make_barker_fixture.py                   # the regions of Barker et al. 2021, Table 2',
    'pytest                                                  # ephemeris, Horizons (needs internet), Apollo, eclipse',
    'python scripts/validation_report.py                     # the numbers in the first section',
    '',
    'cd ../app && pnpm install && pnpm dev',
  ]
  // each comment goes on its own line above its command, in a quieter colour, so the block fits the column
  const lines = cmds.flatMap((line) => {
    const at = line.indexOf('  #')
    return at < 0 ? [line] : [line.slice(at).trim(), line.slice(0, at).trimEnd()]
  })
  const code = h('code', {}, ...lines.flatMap((line, i) => {
    const part: Child = line.startsWith('#') ? cls('vcomment', line) : line
    return i < lines.length - 1 ? [part, '\n'] : [part]
  }))
  const copyLabel = h('span', {}, 'Copy')
  const copyIcon = icon('copy', 'vbtn-icon')
  const copy = h('button', { type: 'button', class: 'vbtn vbtn-ghost vbtn-sm vcopy', 'aria-label': 'Copy the commands' }, copyIcon, copyLabel)
  let timer = 0
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      copyLabel.textContent = 'Copied'
      copy.querySelector('.vicon')?.replaceWith(icon('check', 'vbtn-icon'))
      clearTimeout(timer)
      timer = window.setTimeout(() => { copyLabel.textContent = 'Copy'; copy.querySelector('.vicon')?.replaceWith(copyIcon) }, 1800)
    } catch { copyLabel.textContent = 'Select and copy by hand' }
  })
  return section('reproduce', 'terminal', 'Reproduce it',
    p('Everything on this page comes from code in the repository and NASA data you can download yourself.'),
    h('div', { class: 'vcode' }, copy, h('pre', {}, code)),
    p('Then open ', h('a', { href: `${base}verify.html` }, 'the developer check page'), ' for the 24-point comparison with every error statistic, ',
      h('a', { href: `${base}verify.html?mode=goddard` }, 'the same page in Goddard mode'), ' for the long-term comparison on the full published maps, and ',
      h('a', { href: `${base}verify.html?mode=barker` }, 'in Barker mode'), ' for the published table.'),
    h('h3', {}, 'Sources'),
    h('ul', { class: 'vlist vlist-quiet' },
      h('li', {}, 'NASA Goddard\'s track-adjusted LOLA maps: the 5 m map to 87° S (Barker et al. 2021, PGDA product 81, from the USGS copy) and LDEM_80S_20MPP_ADJ and LDEM_60S_240MPP_ADJ (Barker et al. 2023, PGDA product 90).'),
      h('li', {}, 'SPICE kernels from NASA NAIF: naif0012.tls, pck00011.tpc, de440s.bsp, moon_pa_de440_200625.bpc, moon_de440_250416.tf.'),
      h('li', {}, 'NASA Goddard average visibility maps AVGVISIB_85S_060M_201608 (Sun and Earth), from imbrium.mit.edu.'),
      h('li', {}, 'JPL Horizons API, used only for the check above. Apollo Lunar Surface Journal, Sun elevation table by J. Scotti. IAU/USGS Gazetteer of Planetary Nomenclature for place names.'),
      h('li', {}, 'Mazarico et al. 2011, Icarus 211:1066. Barker et al. 2021, Planetary and Space Science 203:105119. Barker et al. 2023, Planetary Science Journal 4:183. Glaser et al. 2014, Icarus 243:78.')),
    p(cls('muted', 'The exact addresses and file sizes are in pipeline/scripts/fetch_data.py.')),
  )
}

// ---- contents rail (wide screens): follows the section in view -----------------------
function contents(sections: HTMLElement[]) {
  const links = sections.map((s) => {
    const title = s.querySelector('h2')!.textContent ?? ''
    const ic = s.querySelector('.vsection-icon')!.cloneNode(true) as HTMLElement
    ic.className = 'vicon'
    return h('a', { href: `#${s.id}` }, ic, h('span', {}, title))
  })
  const nav = h('nav', { class: 'vtoc', 'aria-label': 'On this page' }, ...links)
  const seen = new Map<Element, boolean>()
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) seen.set(e.target, e.isIntersecting)
    const i = sections.findIndex((s) => seen.get(s))
    links.forEach((a, k) => (k === i ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')))
  }, { rootMargin: '-30% 0px -60% 0px' })
  for (const s of sections) io.observe(s)
  return nav
}

const sections = [ephemerisSection(), horizonSection(), goddardSection(), barkerSection(), siteSection(), limitsSection(), reproduceSection()]
const root = document.getElementById('root')!
root.replaceChildren(
  header(),
  contents(sections),
  h('main', {},
    h('div', { class: 'vtop' }, horizonArt(), opening()),
    h('div', { class: 'vpage' }, ...sections)),
)

// the header names the page, and the rail appears, once the title has scrolled away
const h1 = document.querySelector('.vhero h1')!
new IntersectionObserver(([e]) => document.body.classList.toggle('past-hero', !e.isIntersecting && e.boundingClientRect.top < 0))
  .observe(h1)
