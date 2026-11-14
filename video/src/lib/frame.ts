// Written with AI assistance (Claude); see the README.
// Camera framing derived from element boxes recorded at capture time (src/capture-layout.json), so a new app layout
// only needs a re-capture: nothing here depends on today's panel positions.
import type { CamKey } from './PageCam';

export type Box = { x: number; y: number; w: number; h: number };
export type Cam = { cx: number; cy: number; zoom: number };

export const union = (...bs: (Box | null | undefined)[]): Box => {
  const v = bs.filter((b): b is Box => !!b)
  const x0 = Math.min(...v.map((b) => b.x)), y0 = Math.min(...v.map((b) => b.y))
  const x1 = Math.max(...v.map((b) => b.x + b.w)), y1 = Math.max(...v.map((b) => b.y + b.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
};
export const pad = (b: Box, px: number, py = px): Box => ({ x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py });

/** Keep the camera inside the page so no black void shows at the frame edges. */
export const clampCam = (c: Cam, pageW = 1920, pageH = 1080): Cam => {
  const hw = 960 / c.zoom, hh = 540 / c.zoom
  return {
    zoom: c.zoom,
    cx: pageW <= 2 * hw ? pageW / 2 : Math.min(pageW - hw, Math.max(hw, c.cx)),
    cy: pageH <= 2 * hh ? pageH / 2 : Math.min(pageH - hh, Math.max(hh, c.cy)),
  }
};

/** Camera that puts `box` (page px) inside the screen rect `target`, zoom in [minZoom, maxZoom]. */
export const fit = (box: Box, target: Box, maxZoom: number, minZoom = 1, pageW = 1920, pageH = 1080): Cam => {
  const zoom = Math.max(minZoom, Math.min(maxZoom, target.w / box.w, target.h / box.h))
  const tx = target.x + target.w / 2, ty = target.y + target.h / 2
  return clampCam({ zoom, cx: box.x + box.w / 2 - (tx - 960) / zoom, cy: box.y + box.h / 2 - (ty - 540) / zoom }, pageW, pageH)
};

export const toScreen = (b: Box, c: Cam): Box => ({ x: 960 + (b.x - c.cx) * c.zoom, y: 540 + (b.y - c.cy) * c.zoom, w: b.w * c.zoom, h: b.h * c.zoom });

// Caption band zones on screen (see CaptionBand): bottom band covers y >= 790, top band covers y <= 290.
const overlapY = (b: Box, y0: number, y1: number) => Math.max(0, Math.min(b.y + b.h, y1) - Math.max(b.y, y0)) * Math.max(0, b.w);
/** Put the caption where it hides the least of what the shot is about. */
export const bandSide = (important: Box[]): 'bottom' | 'top' => {
  const bottom = important.reduce((s, b) => s + overlapY(b, 790, 1080), 0)
  const top = important.reduce((s, b) => s + overlapY(b, 0, 290), 0)
  return top < bottom ? 'top' : 'bottom'
};

export const key = (frame: number, c: Cam): CamKey => ({ frame, ...c });

/** Safe screen rect for content when the caption sits at the bottom / top. */
export const SAFE = {
  bottom: { x: 60, y: 50, w: 1800, h: 730 },
  top: { x: 60, y: 300, w: 1800, h: 730 },
} as const;
