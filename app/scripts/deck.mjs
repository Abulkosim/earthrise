// Written with AI assistance (Claude); see the README.
// Builds the pitch deck: drives the live app in headless Chrome (GPU on) to capture the screenshots the
// slides need, then prints docs/submission/deck/index.html to a 7-page PDF at 1920x1080 px per page and
// saves a PNG preview of every slide.
//
//   node scripts/deck.mjs [--url http://localhost:5199/] [--skip-shots] [--only 1,4]
//
// --skip-shots reuses the screenshots already in docs/submission/deck/shots/ (for layout work).
// --only retakes the shots of the listed slides and keeps the rest (and their readings).
// The numbers the slides quote from the screen (status line, map notes, checks) are written to
// shots/readings.json and filled into the page at print time, so the slides always say what the
// captured screens say.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt }
const URL0 = arg('--url', 'http://localhost:5199/').replace(/\/?$/, '/')
const SKIP_SHOTS = process.argv.includes('--skip-shots')
const ONLY = arg('--only', '1,2,3,4,5,6,7').split(',').map(Number)
const want = (...n) => n.some((x) => ONLY.includes(x))
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const HERE = dirname(fileURLToPath(import.meta.url))
const DECK = resolve(HERE, '../../docs/submission/deck')
const SHOTS = join(DECK, 'shots')
const PREVIEW = join(DECK, 'preview')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(PREVIEW, { recursive: true })

const EPOCH = Date.UTC(2023, 0, 1)
/** hours since 2023-01-01T00:00Z, as the app's links count them */
const hrs = (y, m, d, h = 0) => Math.round((Date.UTC(y, m - 1, d, h) - EPOCH) / 3600e3)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const LANDING_A = hrs(2027, 11, 3)  // the default brief
const LANDING_B = hrs(2027, 11, 17) // two weeks later, a low point of the landing calendar

// The panels float over a full-screen map, so hiding them leaves the map as it is (no new trace).
const MAP_ONLY = `
  .top, .left, .right, .bottom, .stage, .sheet, .map-note, .map-readout, .status-pill,
  .toward-mark, .map-scale, .site-pulse { display: none !important; }`

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  args: ['--use-angle=metal', '--enable-gpu', '--hide-scrollbars', '--window-size=1920,1080'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
// the first-visit intro box must not appear in any slide
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('earthrise-intro', 'seen') } catch { /* about:blank */ } })

const status = () => page.$eval('.status', (e) => e.textContent).catch(() => '')

/** Open a view by link and wait until horizons are traced (and the landing calendar is filled). */
async function open(hash = '', { calendar = true, w = 1920, h = 1080, dsf = 1 } = {}) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf })
  await page.goto('about:blank')
  await page.goto(URL0 + hash, { waitUntil: 'load' })
  await page.waitForFunction(() => /Horizons for/.test(document.querySelector('.status')?.textContent ?? ''), { timeout: 240000 })
  if (calendar) await page.waitForFunction(() => /Best day|No landing date/.test(document.querySelector('.calendar-name')?.textContent ?? ''), { timeout: 240000 })
  // should the intro still be up, close it (its last button)
  await page.evaluate(() => [...document.querySelectorAll('.intro button')].at(-1)?.click())
  await sleep(2500)
  if (await page.$('.intro[data-state="open"], section.intro')) throw new Error('the intro box is still open')
}

/** Hide everything but the map. If that changes the size of the canvas, wait for the horizons to be traced again. */
async function mapOnly(extra = '') {
  const before = await status()
  const size = () => page.$eval('.app > .map', (e) => `${e.clientWidth}x${e.clientHeight}`)
  const was = await size()
  await page.addStyleTag({ content: MAP_ONLY + extra })
  await sleep(600)
  if ((await size()) !== was) {
    await page.waitForFunction((p) => { const s = document.querySelector('.status')?.textContent ?? ''; return /Horizons for/.test(s) && s !== p }, { timeout: 60000 }, before)
      .catch(() => console.log('  (status did not change after resize; continuing)'))
  }
  await sleep(2500)
}

async function save(name, opts = {}) {
  const path = join(SHOTS, name)
  await page.screenshot({ path, type: name.endsWith('.png') ? 'png' : 'jpeg', ...(name.endsWith('.png') ? {} : { quality: 92 }), ...opts })
  console.log(`  saved shots/${name}`)
}
const box = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })
const note = async () => {
  await page.waitForFunction(() => /meets the brief/.test(document.querySelector('.map-note')?.textContent ?? ''), { timeout: 60000 })
  await sleep(1500)
  return page.$eval('.map-note', (e) => e.textContent.replace(/\s+/g, ' ').trim())
}

const readingsPath = join(SHOTS, 'readings.json')
const readings = existsSync(readingsPath) ? JSON.parse(readFileSync(readingsPath, 'utf8')) : {}
// written after every slide, so a crash part way keeps what was read (rerun the rest with --only)
const persist = () => writeFileSync(readingsPath, JSON.stringify(readings, null, 2))

if (!SKIP_SHOTS) {
  // 1. Title: the pole lit by the Sun, map only (full slide); the shadowed plain west of the ridge
  //    leaves room for the title
  if (want(1)) {
  console.log('slide 1')
  await open('#layer=now&c=-12920,-16180,25', { calendar: false, dsf: 2 })
  await mapOnly()
  await save('s1-light.jpg')
  }

  // 2. IM-2 Athena at its landing hour (the view its replay opens), closer in on the marker
  if (want(2)) {
  console.log('slide 2')
  const im2 = `c=77108,137993,16&t=${hrs(2025, 3, 6, 18)}&l=${hrs(2025, 3, 6, 18)}&d=3&layer=now&site=im-2-athena`
  readings.im2 = { hash: im2 }
  // (a narrow window switches the app to its phone layout, so take the middle of a wide one)
  await open('#' + im2, { calendar: false, dsf: 2 })
  await mapOnly()
  await save('s2-im2.jpg', { clip: { x: 430, y: 0, width: 1060, height: 1080 } })
  persist()
  }

  // 3. Where the mission works, default brief, close in on the connecting ridge at 5 m terrain;
  //    the status line is quoted on the slide
  if (want(3)) {
  console.log('slide 3')
  await open('#c=-11000,-12100,2.2&layer=needs', { calendar: false, w: 1920, h: 760, dsf: 2 })
  readings.note3 = await note()
  readings.status = await status()
  console.log('  ' + readings.status)
  await mapOnly()
  await save('s3-works.jpg')
  persist()
  }

  // 5. The landing calendar close up, and the whole view for two landing dates
  if (want(5)) {
  console.log('slide 5')
  readings.dates = []
  for (const [i, l] of [LANDING_A, LANDING_B].entries()) {
    await open(`#layer=needs&l=${l}&t=${l + 30}`)
    const n = await note()
    readings.dates.push({ landing: l, note: n })
    console.log('  ' + n)
    await mapOnly()
    await save(`s5-map-${i + 1}.jpg`, { clip: { x: 300, y: 60, width: 1320, height: 700 } })
  }

  // the landing calendar strip: the bars alone, sharp; the slide sets the dates in large type at the
  // positions read here from the timeline axis under it
  await open(`#layer=needs&l=${LANDING_A}&t=${LANDING_A + 30}`, { dsf: 2 })
  readings.calendarNow = await page.$eval('.calendar-name', (e) => e.textContent)
  await (await page.$('.calendar-plot canvas')).screenshot({ path: join(SHOTS, 's5-calendar.png') })
  console.log('  saved shots/s5-calendar.png')
  readings.axis = await page.evaluate(() => {
    const c = document.querySelector('.calendar-plot canvas').getBoundingClientRect()
    const rel = (x) => (x - c.left) / c.width
    const months = [...document.querySelectorAll('.ribbon-label.is-month')].map((e) => ({ text: e.textContent.trim(), x: rel(e.getBoundingClientRect().left) }))
    const cap = document.querySelector('.ribbon-stay-cap.is-start')?.getBoundingClientRect()
    return { months, landing: cap ? rel(cap.left + cap.width / 2) : null }
  })
  persist()
  }

  // 4 and 7. The whole app with the site sheet open on the ridge region that meets the brief; Sun and Earth both up
  if (want(4, 7)) {
  console.log('slides 4 and 7')
  const tView = hrs(2027, 11, 9, 12)
  readings.tView = tView
  await open(`#layer=needs&site=barker-site1-roi4&t=${tView}`, { dsf: 2 })
  await page.waitForFunction(() => /If the landing misses/.test(document.querySelector('.sheet')?.innerText ?? ''), { timeout: 60000 })
  await sleep(2500)
  // turn the panorama so the Sun and the Earth are both in it
  const aria = await page.$eval('.panorama-canvas', (e) => e.getAttribute('aria-label'))
  const az = (b) => Number(aria.match(new RegExp(`${b} [^,]*, azimuth (\\d+)`))?.[1])
  const sAz = az('Sun'), eAz = az('Earth')
  if (Number.isFinite(sAz) && Number.isFinite(eAz)) {
    const d = ((eAz - sAz + 540) % 360) - 180
    const mid = sAz + d / 2
    const cur = Number(aria.match(/facing \w+, azimuth (\d+)/)?.[1] ?? sAz)
    const span = Number(aria.match(/(\d+)° wide/)?.[1] ?? 150)
    await page.$eval('.panorama-canvas', (c, [mid, cur, span, need]) => {
      const w = c.getBoundingClientRect().width - 40
      const dx = (((mid - cur + 540) % 360) - 180) * w / span
      c.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: 0, bubbles: true, cancelable: true }))
      if (need > span) c.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.log(need / span) / 0.0015, clientX: c.getBoundingClientRect().left + c.getBoundingClientRect().width / 2, bubbles: true, cancelable: true }))
    }, [mid, cur, span, Math.abs(d) + 50])
    await sleep(1200)
  }
  readings.pano = await page.$eval('.panorama-canvas', (e) => e.getAttribute('aria-label'))
  readings.sheet = await page.$eval('.sheet', (e) => e.innerText.replace(/\s+/g, ' ').slice(0, 600))
  // the timeline row of the selected site: "100% sunlit", "77% contact" and so on, quoted on slide 4
  readings.row = await page.$$eval('.ribbon-row', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ').trim()).find((t) => /region 4/.test(t)) ?? '')
  readings.odds = await page.$eval('.sheet', (e) => e.innerText.match(/If the landing misses\s*(\d+%)/)?.[1] ?? '')
  await save('s4-app.jpg')
  // a close crop of the panorama for slide 7, sharper
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 3 })
  await sleep(3000)
  await save('s7-panorama.png', { clip: await box('.panorama-canvas') })
  persist()
  }

  // 6. The checks: the Goddard comparison on the verify page (as the brief asks: fine=0.25), and the
  //    validation page's live run for the two maps and the permanent-shadow line
  if (want(6)) {
  console.log('slide 6')
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 })
  await page.goto('about:blank')
  await page.goto(URL0 + 'verify.html?mode=goddard&fine=0.25', { waitUntil: 'load' })
  await page.waitForFunction(() => /DONE|rror/.test(document.getElementById('out')?.textContent ?? ''), { timeout: 600000, polling: 2000 })
  const out = await page.$eval('#out', (e) => e.textContent)
  const corr = (b) => out.match(new RegExp(`${b}\\s*: [^\\n]*correlation ([\\d.]+)`))?.[1]
  readings.goddard = { verify: out.split('\n').filter((l) => /^(sun|earth)/.test(l)), sun: corr('sun'), earth: corr('earth') }
  console.log('  ' + readings.goddard.verify.join('\n  '))

  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 })
  await page.goto('about:blank')
  await page.goto(URL0 + 'validation.html', { waitUntil: 'load' })
  await page.evaluate(() => [...document.querySelectorAll('#goddard button')].find((x) => /Run this check/.test(x.textContent)).click())
  await page.waitForFunction(() => /Your browser: of the/.test(document.body.innerText), { timeout: 600000, polling: 2000 })
  await sleep(1500)
  readings.goddard.psr = await page.evaluate(() => document.body.innerText.match(/Your browser: of the[^\n]*/)?.[0])
  const pcts = readings.goddard.psr?.match(/([\d.]+)%/g) ?? []
  readings.goddard.psrA = pcts[0]; readings.goddard.psrB = pcts[1]
  console.log('  ' + readings.goddard.psr)
  await page.addStyleTag({ content: '.vmaps figcaption { display: none !important; }' })
  for (const [i, c] of (await page.$$('.vmaps canvas')).entries()) {
    await c.scrollIntoView()
    await sleep(500)
    await c.screenshot({ path: join(SHOTS, `s6-${i ? 'goddard' : 'ours'}.png`) })
    console.log(`  saved shots/s6-${i ? 'goddard' : 'ours'}.png`)
  }
  persist()
  }

  console.log(readings)
}

// ---- print ---------------------------------------------------------------
console.log('print')
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(join(DECK, 'index.html')).href, { waitUntil: 'load' })
await page.evaluate((r) => window.fill?.(r), readings)
await page.evaluateHandle('document.fonts.ready')
await sleep(500)
const n = await page.$$eval('section.slide', (s) => s.length)
if (n !== 7) throw new Error(`the deck has ${n} slides; the limit is 7`)
// anything that spills out of its slide is a layout bug
const spill = await page.$$eval('section.slide', (ss) => ss.flatMap((s, i) => {
  const r = s.getBoundingClientRect()
  return [...s.querySelectorAll('h1, h2, p, td, figcaption, .axis span')].filter((e) => {
    const b = e.getBoundingClientRect()
    return b.right > r.right + 1 || b.bottom > r.bottom + 1 || e.scrollWidth > e.clientWidth + 1
  }).map((e) => `slide ${i + 1}: ${e.tagName} "${e.textContent.slice(0, 40)}"`)
}))
if (spill.length) console.log('overflow:', spill.join(' | '))
await page.pdf({ path: join(DECK, 'earthrise-deck.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true })
console.log('  saved earthrise-deck.pdf')
const slides = await page.$$('section.slide')
for (const [i, s] of slides.entries()) await s.screenshot({ path: join(PREVIEW, `slide-${i + 1}.png`) })
console.log(`  saved ${slides.length} previews`)

if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '))
await browser.close()
