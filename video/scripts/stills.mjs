// Written with AI assistance (Claude); see the README.
// QA stills (pipeline stage 5): two check frames per shot, rendered with `remotion still` into out/qa/.
// Usage: node scripts/stills.mjs [frame ...]   (default: the check frames below)
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const CHECK = {
  team: [20, 50], challenge: [100, 120], name: [150, 210], light: [262, 330], needs: [380, 450],
  slip: [500, 560], ridge: [601, 660], validation: [700, 755], close: [800, 830],
}
const frames = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : Object.values(CHECK).flat()
mkdirSync('out/qa', { recursive: true })
for (const f of frames) {
  execFileSync('npx', ['remotion', 'still', 'src/index.ts', 'EarthriseDemo', `out/qa/f${String(f).padStart(4, '0')}.png`, `--frame=${f}`, '--log=error'], { stdio: 'inherit' })
  console.log('still', f)
}
