// Written with AI assistance (Claude); see the README.
// One-off probe: element boxes and texts in the default view of the running app (layout check before a capture).
import { launch, open, bbox, text, sleep } from './lib.mjs'

const out = process.argv[2] ?? '.capture-tmp'
const { browser, page } = await launch({ dsf: 1 })
await open(page, '#site=barker-site1-roi4')
const sels = ['header', '.brief', '.map-note', '.status', '.calendar-name', '.sheet', '.ribbon-row', '.layer', '.intro', 'canvas']
const layout = {}
for (const s of sels) layout[s] = await bbox(page, s)
console.log(JSON.stringify(layout))
console.log('status:', await text(page, '.status'))
console.log('calendar:', await text(page, '.calendar-name'))
console.log('note:', await text(page, '.map-note'))
console.log('rows:', JSON.stringify(await page.$$eval('.ribbon-row', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))))
console.log('layers:', JSON.stringify(await page.$$eval('.layer', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')))))
console.log('sheet:', (await page.$eval('.sheet', (e) => e.innerText).catch(() => '')).slice(0, 1500))
console.log('hash:', await page.evaluate(() => location.hash))
await page.screenshot({ path: `${out}/probe-default.png` })
await browser.close()
