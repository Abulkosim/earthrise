// Written with AI assistance (Claude); see the README.
// Final capture for the Earthrise demo video (pipeline stage 4). ONE re-runnable script for all footage.
// Every picture comes from the running app at http://localhost:5199/ (or --url / EARTHRISE_URL), headless Chrome on
// the GPU.
//
//   node scripts/capture.mjs                          # all sets (about 15 minutes)
//   node scripts/capture.mjs light slip               # only some sets
//   node scripts/capture.mjs --url http://host:port/  # another address
//
// It relies only on the automation hooks the app keeps stable across redesigns:
//   window.__earthrise.ui setters, window.__earthrise.engine, the URL fragment (c, t, l, d, layer, site, cmp),
//   localStorage 'earthrise-intro' = 'seen',
//   and the selectors/texts .status ("Horizons for"), .calendar-name ("Best day"), .map-note, .layer (label + radio),
//   .ribbon-row, .sheet, .replays button, .intro.
// The map is full-screen under floating panels; the panels are part of the picture. Everything the video frames on
// (brief, map note, calendar, site panel, ridge marker, validation maps) is located at capture time from those hooks or from visible text, and written to src/capture-layout.json. The Remotion shots
// derive every camera move from that file, so a new UI layout needs no code change: re-capture, then re-render.
//
// Output: public/captures/<set>/NNNN.jpg (frame sequences), public/captures/*.png (stills), src/capture-layout.json.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, newPage, open, settle, text, sleep, BASE } from './lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/captures')
const LAYOUT = join(ROOT, 'src/capture-layout.json')
const only = process.argv.slice(2).filter((a, i, all) => a !== '--url' && all[i - 1] !== '--url')
const want = (k) => only.length === 0 || only.includes(k)
const layout = existsSync(LAYOUT) ? JSON.parse(readFileSync(LAYOUT, 'utf8')) : {}

// Default brief: landing 3 Nov 2027 00:00 UTC = 42408 h after 2023-01-01T00:00Z, 14-day stay. Default view.
const LANDING = 42408
const VIEW = '#c=-6000,-9000,42&d=14&l=' + LANDING
// The 5 m close-up of the connecting ridge (1.5 to 5 m per pixel loads the 5 m terrain): the ridge shot is shot here.
const CLOSE = '#c=-11000,-12100,2.2&d=14&l=' + LANDING
const SEQ = { light: { n: 300, stepH: 3 }, slip: { n: 110, stepH: 6 }, ridge: { n: 110, stepH: 2 } }

const { browser, page: firstPage } = await launch({ dsf: 2 })
let page = firstPage

// ── locating things on screen (CSS px, 1920x1080 viewport) ────────────────────────────────────────────────────
const rectOf = (sel) => page.evaluate((sel) => {
  const e = document.querySelector(sel)
  if (!e) return null
  const r = e.getBoundingClientRect()
  return r.width > 0 ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
}, sel)

/** Box of the mission brief: the container that holds the "Mission brief" heading and the landing date input. */
const briefRect = () => page.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  // interface version 2 labels the brief itself; older layouts are found from the heading text and the date input
  const own = document.querySelector('[aria-label="Mission brief"], .brief')
  if (own && own.getBoundingClientRect().width > 0) return box(own)
  const date = document.querySelector('input[type=date]')
  let e = date
  while (e && e.parentElement && !/Mission brief/.test(e.textContent ?? '')) e = e.parentElement
  // stop before the container also swallows the layer list
  while (e && e.querySelector('.layer') && e.firstElementChild) {
    const kids = [...e.children].filter((k) => k.contains(date) || /Mission brief/.test(k.textContent ?? ''))
    if (kids.length !== 1) break
    e = kids[0]
  }
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
})

/** Box of the landing calendar: .calendar-name and the bar plot next to it (its closest wide ancestor). The bars
 * end level with the bottom of .calendar-name, recorded separately as `calendarName`. */
const calendarRect = () => page.evaluate(() => {
  const n = document.querySelector('.calendar-name')
  if (!n) return null
  let e = n
  while (e.parentElement && e.getBoundingClientRect().width < 900) e = e.parentElement
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
})

/** A map marker: the leaf element labelled with the site name, outside the site panel and timeline. */
const markerRect = (name = 'Shackleton connecting ridge') => page.evaluate((name) => {
  const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0
    && e.textContent?.trim() === name
    && !e.closest('.sheet') && !e.closest('.ribbon-row') && e.getBoundingClientRect().width > 0)
  const r = el?.getBoundingClientRect()
  return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
}, name)
/** The first compared site's name (the default view's marker that sits on the connecting ridge). */
const firstRowName = () => page.$eval('.ribbon-row', (e) => e.innerText.split('\n')[0].trim()).catch(() => '')

/** The map canvas (the engine's own canvas). */
const mapRect = () => page.evaluate(() => {
  const c = window.__earthrise?.engine?.canvas
  const r = c?.getBoundingClientRect()
  return r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null
})

/** The lander's-eye panorama inside the site panel: the largest canvas in .sheet. */
const panoramaRect = () => page.evaluate(() => {
  const s = document.querySelector('.sheet')
  if (!s) return null
  const c = [...s.querySelectorAll('canvas, svg')].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]
  return c ? { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) } : null
})

// ── waiting ───────────────────────────────────────────────────────────────────────────────────────────────────
/** Wait until the status line has stopped changing. */
async function quiet(ms = 2500) {
  let last = '', since = Date.now()
  for (;;) {
    const s = await text(page, '.status')
    if (s !== last) { last = s; since = Date.now() }
    if (Date.now() - since > ms) return s
    await sleep(250)
  }
}
const pts = (s) => Number((s.match(/Horizons for ([\d,]+) points/)?.[1] ?? '0').replace(/,/g, ''))

/**
 * The app picks how many horizon points to trace from how fast this machine is (up to 262,144), and adjusts it on
 * every bake. Give it a few re-bakes (one-metre nudges of the view, at 42 m per pixel) so the captured map uses as
 * many points as this machine allows; the status line in every frame then states the real count and time.
 */
async function fullDetail() {
  let s = await quiet()
  let dx = 0
  for (let k = 0; k < 6 && pts(s) < 200000; k++) {
    await sleep(6000) // let the background landing-calendar sweep finish first
    const d = dx === 0 ? 1 : -1 // alternate +1 m / -1 m: the view stays within 1 m (0.02 px) of the default centre
    dx += d
    await page.evaluate((d) => window.__earthrise.ui.setView((v) => ({ ...v, cx: v.cx + d })), d)
    s = await quiet(3000)
    console.log('  detail:', s)
  }
  await page.waitForFunction(() => /Best day|No landing date/.test(document.querySelector('.calendar-name')?.textContent ?? ''), { timeout: 180000 })
  await closeIntro()
  await sleep(1000)
  return s
}
async function closeIntro() {
  await page.evaluate(() => { const i = document.querySelector('.intro'); i?.querySelector('button')?.click() })
}

// every frame of a sequence must come from the loaded app (guards against a hot reload mid-sequence)
const jpg = async (p) => {
  // the status line reads "Horizons for ..." only when the map is idle (not loading, tracing or running the stay)
  await page.waitForFunction(() => !!window.__earthrise?.ui && /Horizons for/.test(document.querySelector('.status')?.textContent ?? ''), { timeout: 15000 })
  await page.screenshot({ path: p, type: 'jpeg', quality: 90 })
}
const png = (p) => page.screenshot({ path: p, type: 'png' })
const fresh = (dir) => { rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); return dir }
mkdirSync(OUT, { recursive: true })

// written after every set, so a set that fails later never costs the sets already captured
const saveLayout = () => writeFileSync(LAYOUT, JSON.stringify(layout, null, 1))

/** Run one capture set; if the page reloads under us (e.g. the dev server hot-reloads), start the set again. */
async function runSet(name, fn) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { await fn(); saveLayout(); return } catch (e) {
      console.log(`  ${name}: attempt ${attempt} failed (${String(e).split('\n')[0]}); retrying in a fresh tab`)
      try { await page.close() } catch { /* already gone */ }
      await sleep(5000)
      page = await newPage(browser)
    }
  }
  throw new Error(`capture set ${name} failed 4 times`)
}

// (a) Where the mission works (runs first: it also warms the GPU shaders so later sets trace more points), default date: the layer's radio in .layer, the map note states the share
if (want('needs')) await runSet('needs', async () => {
  await open(page, `${VIEW}&t=${LANDING}&layer=now`)
  const s = await fullDetail()
  await page.evaluate(() => [...document.querySelectorAll('.layer')].find((l) => /mission works/i.test(l.textContent))?.querySelector('input')?.click())
  await page.waitForFunction(() => /meets the brief/.test(document.querySelector('.map-note')?.textContent ?? ''), { timeout: 60000 })
  await sleep(1200)
  layout.needs = { status: await text(page, '.status'), noteText: await text(page, '.map-note'), note: await rectOf('.map-note'), brief: await briefRect(), map: await mapRect() }
  await png(join(OUT, 'needs.png'))
  console.log('needs:', layout.needs.noteText)
})

// (b) a lunar month of light: layer "Light at this moment", playhead stepped 3 h per frame from the landing
if (want('light')) await runSet('light', async () => {
  await open(page, `${VIEW}&t=${LANDING}&layer=now`)
  const s = await fullDetail()
  layout.light = {
    status: s, map: await mapRect(), brief: await briefRect(), calendar: await calendarRect(),
    note: await rectOf('.map-note'), marker: await markerRect(await firstRowName()), status_box: await rectOf('.status'),
  }
  const dir = fresh(join(OUT, 'light'))
  await png(join(OUT, 'light-first.png'))
  for (let i = 0; i < SEQ.light.n; i++) {
    await page.evaluate((h) => window.__earthrise.ui.setNow(h), LANDING + i * SEQ.light.stepH)
    await settle(page, 170)
    await jpg(join(dir, String(i).padStart(4, '0') + '.jpg'))
    if (i % 50 === 0) console.log('light', i)
  }
})

// (c) the landing date slips day by day: brief.landing stepped 6 h per frame, map and calendar follow
if (want('slip')) await runSet('slip', async () => {
  await open(page, `${VIEW}&t=${LANDING + 6}&layer=needs`)
  const s = await fullDetail()
  layout.slip = { status: s, calendar: await calendarRect(), calendarName: await rectOf('.calendar-name'), note: await rectOf('.map-note'), map: await mapRect(), notes: [] }
  const dir = fresh(join(OUT, 'slip'))
  for (let i = 0; i < SEQ.slip.n; i++) {
    const h = LANDING + i * SEQ.slip.stepH
    await page.evaluate((h) => { const ui = window.__earthrise.ui; ui.setBrief((b) => ({ ...b, landing: h })); ui.setNow(h + 6) }, h)
    await settle(page, 260)
    await jpg(join(dir, String(i).padStart(4, '0') + '.jpg'))
    if (i % 10 === 0) layout.slip.notes.push(await text(page, '.map-note'))
  }
  layout.slip.statusEnd = await text(page, '.status')
  console.log('slip notes:', layout.slip.notes.join(' | '))
})

// (d) the 5 m close-up of the connecting ridge, first without and then with the site panel (opened by URL), the
// lander's-eye panorama while time runs (2 h per frame)
if (want('ridge')) await runSet('ridge', async () => {
  await open(page, `${CLOSE}&t=${LANDING}&layer=now`, { calendar: false })
  const s0 = await quiet(3000)
  await sleep(1000)
  const first = { status: s0, marker: await markerRect(), scale: await page.evaluate(() => [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && /^\s*\d+\s*(m|km)\s*$/.test(e.textContent ?? '') && e.getBoundingClientRect().width > 0)?.textContent?.trim() ?? '') }
  await png(join(OUT, 'ridge-first.png'))
  await open(page, `${CLOSE}&t=${LANDING}&layer=now&site=connecting-ridge`, { calendar: false })
  await page.waitForFunction(() => /From the lander/.test(document.querySelector('.sheet')?.innerText ?? ''), { timeout: 60000 })
  const s = await quiet(3000)
  await sleep(1500)
  layout.ridge = { status: s, first, sheet: await rectOf('.sheet'), panorama: await panoramaRect(), marker: await markerRect(), map: await mapRect(), texts: [] }
  const dir = fresh(join(OUT, 'ridge'))
  for (let i = 0; i < SEQ.ridge.n; i++) {
    await page.evaluate((h) => window.__earthrise.ui.setNow(h), LANDING + i * SEQ.ridge.stepH)
    await settle(page, 200)
    await jpg(join(dir, String(i).padStart(4, '0') + '.jpg'))
    if (i % 20 === 0) layout.ridge.texts.push(await page.$eval('.sheet', (e) => e.innerText.slice(0, 1400)).catch(() => ''))
  }
  console.log('ridge done')
})

// (e) the validation page: the Goddard check run live in this browser (its own "Run this check" button), then a 2x crop
// around its two side-by-side maps, located from the page's own canvases
if (want('validation')) await runSet('validation', async () => {
  await page.goto('about:blank')
  await page.goto(BASE + 'validation.html', { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await sleep(1500)
  // The Goddard comparison: the section with the two side-by-side maps (hidden until its check has run). It is found
  // from the maps' own labels, then its "Run this check" button is pressed (other sections have such buttons too).
  const ran = await page.evaluate(() => {
    const run = (e) => [...e.querySelectorAll('button')].filter((x) => /Run this check/.test(x.textContent))
    let sec = [...document.querySelectorAll('canvas')].find((c) => /Goddard/i.test(c.getAttribute('aria-label') ?? ''))
    while (sec && run(sec).length === 0) sec = sec.parentElement
    const b = sec ? run(sec)[0] : run(document).at(-1)
    sec?.setAttribute('data-capture', 'goddard')
    b?.click()
    return !!b
  })
  if (!ran) throw new Error('the validation page has no "Run this check" button (did it fail to load?)')
  await page.waitForFunction(() => document.querySelectorAll('tr.vyours.vfresh').length >= 2 || /Sun, your browser\s+[\d,]+\s+0\.\d+/.test(document.body.innerText), { timeout: 180000 })
  await sleep(2500)
  const maps = await page.evaluate(() => {
    const root = document.querySelector('[data-capture=goddard]') ?? document
    return [...root.querySelectorAll('canvas, img')].map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) } }).filter((r) => r.w > 150 && r.h > 150)
  })
  const pair = maps.slice(-2) // ours and Goddard's
  if (pair.length < 2) throw new Error('the validation page shows no maps (did it fail to load?)')
  const top = Math.max(0, Math.min(...pair.map((m) => m.y)) - 700)
  const H = 1500
  await page.evaluate((y) => window.scrollTo(0, y), top)
  await sleep(600)
  // screenshot with clip in page coordinates (Puppeteer scrolls as needed); output is 2x
  await page.screenshot({ path: join(OUT, 'validation-goddard.png'), type: 'png', clip: { x: 0, y: top, width: 1920, height: H }, captureBeyondViewport: true })
  layout.validation = {
    cropTop: top, cropH: H, maps: pair.map((m) => ({ ...m, y: m.y - top })),
    text: (await page.evaluate(() => document.body.innerText)).match(/Your browser:[^\n]+/)?.[0] ?? '',
    // the live correlation with Goddard's maps, as the page prints it (Sun row, then Earth row)
    corr: await page.$$eval('tr.vyours', (rows) => rows.map((r) => r.children[2]?.textContent?.trim() ?? '')),
  }
  console.log('validation corr', layout.validation.corr.join(', '))
  console.log('validation maps', JSON.stringify(layout.validation.maps))
})

saveLayout()
await browser.close()
