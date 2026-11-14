// Written with AI assistance (Claude); see the README.
// Shared helpers for driving the running Earthrise app in headless Chrome with the GPU.
// Recipe follows app/scripts/e2e.mjs (ANGLE on Metal, intro box marked as seen before load).
import puppeteer from 'puppeteer-core'

// The app's address: --url <address> on the command line, or EARTHRISE_URL, default the local dev server.
const argUrl = (() => { const i = process.argv.indexOf('--url'); return i > 0 ? process.argv[i + 1] : undefined })()
export const BASE = (argUrl ?? process.env.EARTHRISE_URL ?? 'http://localhost:5199/').replace(/\/?$/, '/')
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function launch({ dsf = 1 } = {}) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-angle=metal', '--enable-gpu', '--hide-scrollbars', '--window-size=1920,1080', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'],
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: dsf },
    protocolTimeout: 600000,
  })
  return { browser, page: await newPage(browser) }
}

export async function newPage(browser) {
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('earthrise-intro', 'seen') } catch { /* about:blank */ }
  })
  page.on('pageerror', (e) => console.error('  page error:', String(e)))
  return page
}

/** Open a view by URL fragment and wait until horizons are traced and the landing calendar is filled. */
export async function open(page, hash = '', { calendar = true } = {}) {
  await page.goto('about:blank')
  await page.goto(BASE + hash, { waitUntil: 'load' })
  await page.waitForFunction(() => /Horizons for/.test(document.querySelector('.status')?.textContent ?? ''), { timeout: 180000 })
  if (calendar) {
    await page.waitForFunction(() => /Best day|No landing date/.test(document.querySelector('.calendar-name')?.textContent ?? ''), { timeout: 180000 })
  }
  await page.evaluate(() => document.fonts.ready)
  await sleep(1500)
}

/** Two animation frames, then a pause for the map's sharper second pass. */
export async function settle(page, ms = 150) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  await sleep(ms)
}

export async function bbox(page, selector) {
  return page.evaluate((sel) => {
    const e = document.querySelector(sel)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  }, selector)
}

export const text = (page, selector) => page.$eval(selector, (e) => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '')
