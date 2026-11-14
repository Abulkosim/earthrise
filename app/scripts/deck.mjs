// Written with AI assistance (Claude); see the README.
// Builds the pitch deck: drives the live app in headless Chrome (GPU on) to capture the screenshots the
// slides need, then prints docs/submission/deck/index.html to a 7-page PDF at 1920x1080 px per page and
// saves a PNG preview of every slide.
//
//   node scripts/deck.mjs [--url http://localhost:5199/] [--skip-shots]
//
// --skip-shots reuses the screenshots already in docs/submission/deck/shots/ (for layout work).
// The numbers the slides quote from the screen (status line, map notes) are written to shots/readings.json
// and filled into the page at print time, so the slides always say what the captured screens say.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt }
const URL0 = arg('--url', 'http://localhost:5199/')
const SKIP_SHOTS = process.argv.includes('--skip-shots')
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
const LANDING_B = hrs(2027, 11, 17) // two weeks later

const MAP_ONLY = `
  .top, .left, .bottom, .sheet, .map-note, .map-readout { display: none !important; }
  .app { grid-template-columns: minmax(0, 1fr) !important; grid-template-rows: minmax(0, 1fr) !important;
         grid-template-areas: 'map' !important; }`

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
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
  await page.waitForFunction(() => /Horizons for/.test(document.querySelector('.status')?.textContent ?? ''), { timeout: 120000 })
  if (calendar) await page.waitForFunction(() => /Best day|No landing date/.test(document.querySelector('.calendar-name')?.textContent ?? ''), { timeout: 120000 })
  // should the intro still be up, close it (its last button)
  await page.evaluate(() => [...document.querySelectorAll('.intro button')].at(-1)?.click())
  await sleep(1200)
  if (await page.$('section.intro')) throw new Error('the intro box is still open')
}

/** Hide everything but the map; the canvas resizes, so wait for the horizons to be traced again. */
async function mapOnly() {
  const before = await status()
  await page.addStyleTag({ content: MAP_ONLY })
  await page.waitForFunction((p) => { const s = document.querySelector('.status')?.textContent ?? ''; return /Horizons for/.test(s) && s !== p }, { timeout: 60000 }, before)
    .catch(() => console.log('  (status did not change after resize; continuing)'))
  await sleep(2000)
}

const layer = (re) => page.evaluate((src) => {
  const l = [...document.querySelectorAll('.layer')].find((x) => new RegExp(src).test(x.textContent))
  l.querySelector('input').click()
}, re.source)

async function save(name, opts = {}) {
  const path = join(SHOTS, name)
  await page.screenshot({ path, type: name.endsWith('.png') ? 'png' : 'jpeg', ...(name.endsWith('.png') ? {} : { quality: 92 }), ...opts })
  console.log(`  saved shots/${name}`)
}
const box = (sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })

const readingsPath = join(SHOTS, 'readings.json')
const readings = existsSync(readingsPath) ? JSON.parse(readFileSync(readingsPath, 'utf8')) : {}

if (!SKIP_SHOTS) {
  // 1. Title: the pole lit by the Sun, default view, map only (full slide)
  console.log('slide 1')
  // the default time, framed so the shadowed plain west of the ridge leaves room for the title
  await open('#layer=now&c=-12920,-16180,25', { dsf: 2 })
  await mapOnly()
  await save('s1-light.jpg')

  // 2. IM-2 Athena: run the replay, then reopen its view by link and zoom in on the marker
  console.log('slide 2')
  await open()
  await page.evaluate(() => [...document.querySelectorAll('.replays button')].find((b) => /IM-2/.test(b.textContent)).click())
  await page.waitForFunction(() => /IM-2/.test(document.querySelector('.sheet')?.textContent ?? ''), { timeout: 30000 })
  await sleep(7000)
  const q = new URLSearchParams((await page.evaluate(() => location.hash)).slice(1))
  const [cx, cy, mpp] = q.get('c').split(',').map(Number)
  q.set('layer', 'now')
  q.set('c', `${cx},${cy},${+(mpp * 0.62).toFixed(2)}`)
  readings.im2 = { hash: q.toString(), playhead: await page.$eval('.bottom', (e) => e.innerText.match(/\d+ \w{3} 2025 \d\d:\d\d UTC/)?.[0] ?? '') }
  await open('#' + q.toString(), { calendar: false, w: 1120, h: 1080, dsf: 2 })
  await mapOnly()
  await save('s2-im2.jpg')

  // 3. Where the mission works, default brief; the status line is quoted on the slide
  console.log('slide 3')
  await open('#layer=needs&cmp=connecting-ridge')
  await page.waitForFunction(() => /of the ground in view/.test(document.querySelector('.map-note')?.textContent ?? ''), { timeout: 60000 })
  await sleep(800)
  readings.status = await status()
  readings.note3 = await page.$eval('.map-note', (e) => e.textContent)
  await page.addStyleTag({ content: '.map-note { display: none !important; }' })
  await save('s3-works.jpg', { clip: await box('.app > .map') })

  // 5. The landing calendar close up, and the map for two landing dates
  console.log('slide 5')
  readings.dates = []
  for (const [i, l] of [LANDING_A, LANDING_B].entries()) {
    await open(`#layer=needs&cmp=connecting-ridge&l=${l}&t=${l + 30}`)
    await page.waitForFunction(() => /meets the brief/.test(document.querySelector('.map-note')?.textContent ?? ''), { timeout: 60000 })
    await sleep(800)
    const note = await page.$eval('.map-note', (e) => e.textContent.trim())
    readings.dates.push({ landing: l, note })
    console.log('  ' + note)
    await page.addStyleTag({ content: '.map-note { display: none !important; }' })
    await save(`s5-map-${i + 1}.jpg`, { clip: await box('.app > .map') })
  }

  // the landing calendar strip: the bars alone, sharp; the slide sets the dates in large type at the
  // positions read here from the timeline axis under it
  await open(`#layer=needs&cmp=connecting-ridge&l=${LANDING_A}&t=${LANDING_A + 30}`, { dsf: 2 })
  readings.calendarNow = await page.$eval('.calendar-name span', (e) => e.textContent)
  await (await page.$('.calendar-plot canvas')).screenshot({ path: join(SHOTS, 's5-calendar.png') })
  console.log('  saved shots/s5-calendar.png')
  readings.axis = await page.evaluate(() => {
    const c = document.querySelector('.calendar-plot canvas').getBoundingClientRect()
    const rel = (x) => (x - c.left) / c.width
    const months = [...document.querySelectorAll('.ribbon-label.is-month')].map((e) => ({ text: e.textContent.trim(), x: rel(e.getBoundingClientRect().left) }))
    const cap = document.querySelector('.ribbon-stay-cap.is-start')?.getBoundingClientRect()
    return { months, landing: cap ? rel(cap.left + cap.width / 2) : null }
  })

  // 4 and 7. The whole app on the connecting ridge with the panorama; Sun and Earth both up
  console.log('slides 4 and 7')
  const tView = hrs(2027, 11, 9, 12)
  readings.tView = tView
  await open(`#layer=needs&site=connecting-ridge&cmp=connecting-ridge;a3-malapert-massif;a3-mons-mouton-plateau&t=${tView}`, { w: 1440, h: 1215, dsf: 2 })
  await page.waitForFunction(() => /From the lander/.test(document.querySelector('.sheet')?.innerText ?? ''), { timeout: 30000 })
  // the map note quotes a share for this smaller view; hide it so it is not confused with slide 5
  await page.addStyleTag({ content: '.map-note { display: none !important; }' })
  await sleep(1500)
  // turn the panorama so the Sun and the Earth are both in it
  const aria = await page.$eval('.panorama-canvas', (e) => e.getAttribute('aria-label'))
  const az = (b) => Number(aria.match(new RegExp(`${b} [^,]*, azimuth (\\d+)`))?.[1])
  const sAz = az('Sun'), eAz = az('Earth')
  readings.pano = aria
  if (Number.isFinite(sAz) && Number.isFinite(eAz)) {
    let d = ((eAz - sAz + 540) % 360) - 180
    const mid = sAz + d / 2
    await page.$eval('.panorama-canvas', (c, args) => {
      const [mid, sAz, need] = args
      const w = c.getBoundingClientRect().width - 40
      // centre between the two, then widen the span so both fit
      let cur = sAz, s = 150
      const dx = (((mid - cur + 540) % 360) - 180) * w / s
      c.dispatchEvent(new WheelEvent('wheel', { deltaX: dx, deltaY: 0, bubbles: true, cancelable: true }))
      if (need > s) c.dispatchEvent(new WheelEvent('wheel', { deltaY: Math.log(need / s) / 0.0015, bubbles: true, cancelable: true }))
    }, [mid, sAz, Math.abs(d) + 50])
    await sleep(800)
  }
  await save('s4-app.jpg')
  // a close crop of the panorama for slide 7, sharper
  await page.setViewport({ width: 1440, height: 1215, deviceScaleFactor: 3 })
  await sleep(2500)
  await save('s7-panorama.png', { clip: await box('.panorama-canvas') })

  // 6. Validation page: run the Goddard check in this browser, crop to the two maps
  console.log('slide 6')
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 })
  await page.goto('about:blank')
  await page.goto(URL0 + 'validation.html', { waitUntil: 'load' })
  await page.evaluate(() => [...document.querySelectorAll('button')].filter((x) => /Run this check/.test(x.textContent)).at(-1).click())
  await page.waitForFunction(() => /Sun, your browser\s+[\d,]+\s+0\.\d+/.test(document.body.innerText), { timeout: 180000 })
  await sleep(1000)
  readings.goddard = await page.evaluate(() => {
    const t = document.body.innerText
    const corr = (b) => t.match(new RegExp(`${b}, your browser\\s+[\\d,]+\\s+([\\d.]+)`))?.[1]
    return { sun: corr('Sun'), earth: corr('Earth'), psr: t.match(/Your browser:[^\n]*/)?.[0] }
  })
  await page.addStyleTag({ content: '.vmaps figcaption { display: none !important; }' })
  for (const [i, c] of (await page.$$('.vmaps canvas')).entries()) {
    await c.scrollIntoView()
    await sleep(500)
    await c.screenshot({ path: join(SHOTS, `s6-${i ? 'goddard' : 'ours'}.png`) })
    console.log(`  saved shots/s6-${i ? 'goddard' : 'ours'}.png`)
  }

  writeFileSync(readingsPath, JSON.stringify(readings, null, 2))
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
await page.pdf({ path: join(DECK, 'earthrise-deck.pdf'), width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true })
console.log('  saved earthrise-deck.pdf')
const slides = await page.$$('section.slide')
for (const [i, s] of slides.entries()) await s.screenshot({ path: join(PREVIEW, `slide-${i + 1}.png`) })
console.log(`  saved ${slides.length} previews`)

if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '))
await browser.close()
