// Written with AI assistance (Claude); see the README.
// End-to-end check: opens the built or served app in headless Chrome with the GPU on, waits for the
// map engine, and compares what the screen says with the Python reference. With --shots <dir> it
// also saves screenshots (used for the slides).
//
//   node scripts/e2e.mjs [--url http://localhost:5199/] [--shots out/]
//
// Needs Google Chrome installed and a GPU. Not run in CI (the hosted runners have no GPU).
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt }
const URL0 = arg('--url', 'http://localhost:5199/')
const SHOTS = arg('--shots', '')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  // ANGLE=swiftshader runs on the CPU: very slow, but it shows what a machine without a real GPU gets
  args: [`--use-angle=${process.env.ANGLE ?? 'metal'}`, '--enable-gpu', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--window-size=1920,1080'],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
// the first-visit introduction would cover the map note the checks read
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('earthrise-intro', 'seen') } catch { /* about:blank has no storage */ } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

/** Open a view and wait until the horizons are traced, the stay is run and the calendar is filled. */
async function open(hash = '', { calendar = true } = {}) {
  await page.goto('about:blank')
  await page.goto(URL0 + hash, { waitUntil: 'load' })
  await page.waitForFunction(() => /Horizons for/.test(document.querySelector('.status')?.textContent ?? ''), { timeout: 120000 })
  if (calendar) await page.waitForFunction(() => /Best day|No landing date/.test(document.querySelector('.calendar-name')?.textContent ?? ''), { timeout: 120000 })
  await new Promise((r) => setTimeout(r, 1200))
}
const shot = async (name) => {
  if (!SHOTS) return
  mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: join(SHOTS, `${name}.png`) })
  console.log(`  saved ${name}.png`)
}
const rows = () => page.$$eval('.ribbon-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))

let failed = 0
const expect = (what, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `  (${detail})` : ''}`); if (!ok) failed++ }

// 1. The default view: the three compared sites must show the reference stay summaries
//    (14-day stay from 3 Nov 2027, 2 m mast), read from the unit-test fixture that
//    pipeline/scripts/make_test_fixtures.py writes, so no number here is typed by hand.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const ref = JSON.parse(readFileSync(join(SRC, 'model', '__fixtures__', 'reference.json'), 'utf8'))
const catalogue = JSON.parse(readFileSync(join(SRC, 'data', 'sites.json'), 'utf8'))
const DEFAULT_IDS = ['barker-site1-roi4', 'a3-malapert-massif', 'a3-mons-mouton-plateau'] // App.tsx, in its order
// formatted the way the site rows do (fmtPct, fmtDuration in src/ui/Ribbon.tsx)
const fmtPct = (f) => `${Math.round(f * 100)}%`
const fmtDur = (h) => { const r = Math.round(h); if (r < 48) return `${r} h`; const d = Math.floor(r / 24); return r % 24 ? `${d} d ${r % 24} h` : `${d} d` }
const parseDur = (s) => { const m = s.match(/(?:(\d+) d)?\s*(?:(\d+) h)?/); return Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0) }
/** One site row on the screen against the fixture's reference summary for that catalogue id. */
function expectRow(id, screenRows) {
  const fx = ref.sites.find((s) => s.id === id)
  const name = catalogue.find((s) => s.id === id)?.name.replace(/\s*\([^)]*\)$/, '')
  if (!fx || !name) return expect(`${id}: in the fixture and the catalogue`, false)
  const sm = fx.summary
  const want = [`${fmtPct(sm.lit)} sunlit`, `${fmtDur(sm.longestDarkH)} longest dark`, `${fmtPct(sm.comm)} contact`]
  const row = screenRows.find((x) => x.includes(name)) ?? ''
  // the screen runs the engine's float32 horizon; a value on a rounding edge may land one step over,
  // and then the line says so: "screen: ..." instead of the row
  const m = row.match(/(\d+)% sunlit (.+?) longest dark (\d+)% contact/)
  const close = !!m && Math.abs(Number(m[1]) - sm.lit * 100) < 1 && Math.abs(parseDur(m[2]) - sm.longestDarkH) <= 1 &&
    Math.abs(Number(m[3]) - sm.comm * 100) < 1
  const exact = want.every((w) => row.includes(w))
  expect(`${name}: ${want.join(', ')}`, exact || close, exact ? 'same on screen' : `screen: ${row.slice(0, 110)}`)
}
await open()
const r = await rows()
for (const id of DEFAULT_IDS) expectRow(id, r)
const status = await page.$eval('.status', (e) => e.textContent)
console.log('  ' + status)
await shot('01-light-now')

// 2. Where the mission works: some ground must pass on the default date
await page.evaluate(() => [...document.querySelectorAll('.layer')].find((l) => /mission works/.test(l.textContent)).querySelector('input').click())
await page.waitForFunction(() => /of the ground in view meets the brief/.test(document.querySelector('.map-note')?.textContent ?? ''), { timeout: 60000 })
const note = await page.$eval('.map-note', (e) => e.textContent)
const pct = Number(note.match(/([\d.]+)%/)?.[1] ?? 0)
expect('default date: between 5% and 25% of the ground in view meets the brief', pct > 5 && pct < 25, note)
await new Promise((r2) => setTimeout(r2, 500))
await shot('02-where-it-works')

// 3. The engine agrees with itself: the field value at the ridge marker against the site row is checked on the
//    validation page; here we only make sure the long-run layers come up.
await page.evaluate(() => [...document.querySelectorAll('.layer')].find((l) => /18.6 years/.test(l.textContent)).querySelector('input').click())
await new Promise((r2) => setTimeout(r2, 1500))
await shot('03-sunlight-18-years')
await page.evaluate(() => [...document.querySelectorAll('.layer')].find((l) => /permanent shadow/.test(l.textContent)).querySelector('input').click())
await new Promise((r2) => setTimeout(r2, 800))
const psr = await page.evaluate(() => { const e = window.__earthrise.engine; return e.psrDist ? Array.from(e.psrDist).filter((d) => d === 0).length / e.psrDist.length : -1 })
expect('permanent shadow covers between 5% and 60% of the default view', psr > 0.05 && psr < 0.6, `${(psr * 100).toFixed(1)}%`)
await shot('04-permanent-shadow')

// 4. A site panel with the panorama
await open('#c=-6000,-9000,42&layer=now&site=connecting-ridge&cmp=connecting-ridge;a3-malapert-massif;a3-mons-mouton-plateau')
const sheet = await page.$eval('.sheet', (e) => e.innerText).catch(() => '')
expect('site panel opens for the connecting ridge from a link', /connecting ridge/i.test(sheet) && /From the lander/.test(sheet))
expectRow('connecting-ridge', await rows())
await shot('05-site-panel')

// 5. A replay
await open()
await page.evaluate(() => [...document.querySelectorAll('.replays button')].find((b) => /IM-2/.test(b.textContent)).click())
await page.waitForFunction(() => /IM-2/.test(document.querySelector('.sheet')?.textContent ?? ''), { timeout: 30000 })
await new Promise((r2) => setTimeout(r2, 7000))
await shot('06-replay-im2')

// 6. The validation page and its Goddard check
await page.goto(URL0 + 'validation.html', { waitUntil: 'load' })
// the Goddard check is the "Run this check" button in the section whose title names Goddard
const ran = await page.evaluate(() => {
  const sec = [...document.querySelectorAll('section')].find((x) => /Goddard/.test(x.querySelector('h2')?.textContent ?? ''))
  const b = [...(sec?.querySelectorAll('button') ?? [])].find((x) => /Run this check/.test(x.textContent))
  b?.click()
  return !!b
})
expect('validation page has its live check buttons', ran)
if (ran) {
  await page.waitForFunction(() => /Sun, your browser\s+[\d,]+\s+0\.\d+/.test(document.body.innerText), { timeout: 120000 }).catch(() => {})
  const txt = await page.evaluate(() => document.body.innerText)
  const m = txt.match(/Sun, your browser\s+[\d,]+\s+([\d.]+)/)
  expect('validation page: Sun correlation with Goddard above 0.9 in this browser', !!m && Number(m[1]) > 0.9, m ? m[1] : 'not found')
  await page.evaluate(() => [...document.querySelectorAll('h2')].find((h) => /Goddard/.test(h.textContent))?.scrollIntoView())
  await new Promise((r2) => setTimeout(r2, 500))
  await shot('07-validation-goddard')
}

expect('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
console.log(failed ? `\n${failed} check(s) failed` : '\nall end-to-end checks passed')
process.exit(failed ? 1 : 0)
