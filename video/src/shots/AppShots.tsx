// Written with AI assistance (Claude); see the README.
// Shots on real captures of the running app (S2-S8). Every picture is a screenshot of Earthrise itself.
// Every camera move is derived from element boxes recorded at capture time (src/capture-layout.json).
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { C } from '../tokens';
import { EASE, mix, ramp } from '../lib/Polish';
import { PageCam, seqSrc, CamKey } from '../lib/PageCam';
import { BAND_TOP, CaptionBand } from '../lib/CaptionBand';
import { Box, SAFE, bandSide, clampCam, fit, key, pad, toScreen, union } from '../lib/frame';
import { CAPTIONS, LIGHT_SEQ, RIDGE_SEQ, SHOTS, SLIP_SEQ } from '../timeline';
import layoutJson from '../capture-layout.json';

const L = layoutJson as any;
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
const FULL: Box = { x: 0, y: 0, w: 1920, h: 1080 };
const MAP: Box = L.light?.map ?? FULL;
const MARKER: Box | null = L.light?.marker ?? null;

// ── Light layer: one continuous lunar month of light (layer "Light at this moment", 3 h per frame) under S2-S4.
// Close on the map and dimmed behind the title cards, then a pull-back to the whole app at S4.
// The largest centred zoom that keeps the brief panel's left edge in frame (floating panels sit close to the page edge).
const PANEL_X: number = (L.needs?.brief ?? L.light?.brief)?.x ?? 16;
const EDGE_PUSH = Math.max(1, Math.min(1.02, 960 / (960 - Math.max(0, PANEL_X - 4))));
const MAP_CLOSE = clampCam({ cx: MAP.x + MAP.w / 2, cy: MAP.y + MAP.h / 2, zoom: 1.3 });
export const LightLayer: React.FC = () => {
  const frame = useCurrentFrame() + SHOTS.challenge.from; // this layer's Sequence starts at S2
  const s4 = SHOTS.light.from;
  const keys: CamKey[] = [
    key(SHOTS.challenge.from, MAP_CLOSE),
    key(s4 - 2, clampCam({ cx: MAP_CLOSE.cx + 40, cy: MAP_CLOSE.cy + 10, zoom: 1.22 })),
    key(s4 + 34, { cx: 960, cy: 540, zoom: 1.0 }),
    // then a very slow centred push: the floating panels reach almost to the page edge, so any drift would cut them
    key(SHOTS.needs.from + 8, clampCam({ cx: 960, cy: 540, zoom: EDGE_PUSH })),
  ];
  const lit = ramp(frame, s4, 18, EASE.trust); // 0 behind titles, 1 for S4
  const dim = mix(0.34, 1, lit);
  return (
    <AbsoluteFill>
      <PageCam src={seqSrc(LIGHT_SEQ.dir, frame - LIGHT_SEQ.start, LIGHT_SEQ.n)} pageH={1080} keys={keys} frame={frame} filter={lit < 0.999 ? `brightness(${dim.toFixed(3)})` : undefined} />
      {/* behind the title cards: a falloff to true black so the type sits on shadow, like the app's panels */}
      <AbsoluteFill style={{ opacity: 1 - lit, background: 'linear-gradient(90deg, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.82) 50%, rgba(0,0,0,0.3) 80%, rgba(0,0,0,0.15) 100%)' }} />
    </AbsoluteFill>
  );
};

// S3 needs a darker centre (the lockup is centred): a soft radial pool of shadow.
export const NamePool: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const o = ramp(f, 0, 10, EASE.trust) * (1 - ramp(f, duration - 4, 8, EASE.swift));
  return <AbsoluteFill style={{ opacity: o, background: 'radial-gradient(ellipse 60% 55% at 50% 50%, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.35) 100%)' }} />;
};

// S4 — caption only; the picture is the light layer pulling back to the whole app.
export const LightShot: React.FC<{ duration: number }> = ({ duration }) => {
  const c = CAPTIONS.light;
  return <CaptionBand main={c.main} sub={c.sub} at={c.at} subAt={c.subAt} duration={duration} bandEnd={duration + 8} />;
};

// S5 — the mission brief (sentences with numbers), read top to bottom, then the "Where the mission works" layer.
const BRIEF: Box = L.needs?.brief ?? L.light?.brief ?? { x: 16, y: 62, w: 285, h: 539 };
const NOTE: Box | null = L.needs?.note ?? null;
const briefCams = (() => {
  const zoom = Math.max(1.2, Math.min(1.8, 1100 / BRIEF.w));
  const visH = SAFE.bottom.h / zoom;
  const cx = BRIEF.x + BRIEF.w / 2;
  if (BRIEF.h <= visH) { const c = clampCam({ cx, cy: BRIEF.y + BRIEF.h / 2 - (SAFE.bottom.y + SAFE.bottom.h / 2 - 540) / zoom, zoom }); return [c, c] }
  // tilt down the brief: its top edge at the top of the safe area, then its bottom edge at the bottom of it
  const top = clampCam({ cx, cy: BRIEF.y - 10 - (SAFE.bottom.y - 540) / zoom, zoom });
  const bottom = clampCam({ cx, cy: BRIEF.y + BRIEF.h + 10 - (SAFE.bottom.y + SAFE.bottom.h - 540) / zoom, zoom });
  return [top, bottom];
})();
// The map with the app's own note about it. Where the map has its own column (MAP.x > 0) the note and the first
// site marker are framed inside it. Where the map is full-screen under floating panels, the picture starts just right
// of the brief panel (so the panel is out of frame, not cut in half), with the note near the top and the map under it.
const NEEDS_ZOOM = 1.35;
const needsSubject = pad(union(NOTE, MARKER ?? NOTE), 140, 120);
const needsSide = MAP.x > 0 ? bandSide([toScreen(needsSubject, fit(needsSubject, SAFE.bottom, NEEDS_ZOOM))]) : 'bottom';
const needsCam0 = fit(needsSubject, SAFE[needsSide], NEEDS_ZOOM);
const needsCam = MAP.x > 0 || !NOTE
  ? clampCam({ ...needsCam0, cx: Math.max(needsCam0.cx, MAP.x + 960 / needsCam0.zoom) })
  : clampCam({
    zoom: NEEDS_ZOOM,
    cx: Math.max(NOTE.x + NOTE.w / 2, BRIEF.x + BRIEF.w + 12 + 960 / NEEDS_ZOOM),
    cy: Math.max(0, NOTE.y - 110) + 540 / NEEDS_ZOOM,
  });

export const NeedsShot: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const keys: CamKey[] = [
    key(0, briefCams[0]),
    key(58, briefCams[1]),
    key(88, needsCam),
    key(duration + 8, clampCam({ ...needsCam, zoom: needsCam.zoom * 1.03 })),
  ];
  const toNeeds = ramp(f, 60, 18, EASE.smooth); // the layer switch, seen while the camera travels to the map
  const a = CAPTIONS.needsA, b = CAPTIONS.needsB;
  return (
    <AbsoluteFill>
      <PageCam src="captures/light-first.png" src2="captures/needs.png" mix2={toNeeds} pageH={1080} keys={keys} />
      {/* B underneath, A on top: A's band hands over to B's band while A's line fades out */}
      <CaptionBand main={b.main} sub={b.sub} at={b.at} subAt={b.subAt} bandIn={0} duration={duration} bandEnd={duration + 8} side={needsSide} />
      <CaptionBand main={a.main} at={a.at} until={a.until} duration={a.until! + 7} />
    </AbsoluteFill>
  );
};

// S6 — the landing date slips 6 h per frame; the map and the landing calendar follow (app frames as captured).
// The whole app stays in frame (map note at the top, calendar bars in the timeline dock); the caption band sits at
// the bottom, pushed below the calendar's bars (they end level with .calendar-name) so it covers only the site rows.
const CAL_NAME: Box | null = L.slip?.calendarName ?? null;
const slipTextTop = CAL_NAME ? Math.min(900, Math.max(BAND_TOP, CAL_NAME.y + CAL_NAME.h + 76)) : BAND_TOP;
export const SlipShot: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const keys: CamKey[] = [key(0, { cx: 960, cy: 540, zoom: 1.0 }), key(duration + 8, clampCam({ cx: 960, cy: 540, zoom: EDGE_PUSH }))];
  const c = CAPTIONS.slip;
  return (
    <AbsoluteFill>
      <PageCam src={seqSrc(SLIP_SEQ.dir, f, SLIP_SEQ.n)} pageH={1080} keys={keys} />
      <CaptionBand main={c.main} sub={c.sub} at={c.at} subAt={c.subAt} duration={duration} bandEnd={duration + 8} textTop={slipTextTop} />
    </AbsoluteFill>
  );
};

// ── S7: fui-hud-moves · reticle-lock-on (demos/effects/fui-hud-moves/ReticleLockOn.tsx), re-skinned in dust white:
// four L corners fly in from off screen (10f out-cubic), shrink 2.2x -> 0.94x -> 1 (the card's overshoot is its
// "bite"; kept), lock on the connecting-ridge marker in the 5 m close-up; then the site panel opens (as by a click)
// and the camera travels to the lander's-eye panorama while time runs (2 h per frame).
const RMARK: Box | null = L.ridge?.first?.marker ?? L.ridge?.marker ?? null;
const TCX = RMARK ? RMARK.x - RMARK.h / 2 : 820; // the marker ring sits half a label height left of its label pill
const TCY = RMARK ? RMARK.y + RMARK.h / 2 : 611;
const HALF = 34;
const FLY_IN = 6, FLY_END = 16, SHRINK0 = 12, UNDER = 30, LOCK = 36;
const OPEN = 46;
const ARM = 18, THICK = 4;
const PANO: Box = L.ridge?.panorama ?? (L.ridge?.sheet ? { ...L.ridge.sheet, h: Math.min(L.ridge.sheet.h, 300) } : { x: 1565, y: 233, w: 339, h: 211 });
const panoSubject: Box = { ...PANO, h: PANO.h + 100 }; // and the sunset / Earthset lines under it
const ridgeSide = bandSide([toScreen(panoSubject, fit(panoSubject, SAFE.bottom, 2.2))]);
const panoCam = fit(panoSubject, SAFE[ridgeSide], 2.2);
// Close on the marker. With a full-screen map the brief panel floats over the left of it: the picture then starts just
// right of that panel (out of frame, not cut in half) and goes in a little closer.
const FLOATING = MAP.x === 0 && BRIEF.x + BRIEF.w < TCX - 100;
const MARK_ZOOM = FLOATING ? 1.5 : 1.25;
const markLeft = (zoom: number) => (FLOATING ? BRIEF.x + BRIEF.w + 12 + 960 / zoom : 0);
const markerCam = clampCam({ cx: Math.max(TCX + 60, markLeft(MARK_ZOOM)), cy: TCY - 40, zoom: MARK_ZOOM });

export const RidgeShot: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const keys: CamKey[] = [
    key(0, markerCam),
    key(OPEN, clampCam({ cx: Math.max(markerCam.cx - 20, markLeft(MARK_ZOOM * 1.055)), cy: markerCam.cy - 10, zoom: MARK_ZOOM * 1.055 })),
    key(OPEN + 30, panoCam),
    key(duration + 8, clampCam({ ...panoCam, zoom: panoCam.zoom * 1.025 })),
  ];
  const open = ramp(f, OPEN, 8, EASE.trust);
  const idx = Math.max(0, f - OPEN);
  const flyT = interpolate(f, [FLY_IN, FLY_END], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const fx = (1 - flyT) * 1100, fy = (1 - flyT) * 620;
  const shrink = f < UNDER ? mix(2.2, 0.94, ramp(f, SHRINK0, UNDER - SHRINK0, EASE.swift)) : mix(0.94, 1, ramp(f, UNDER, LOCK - UNDER, EASE.out));
  const bite = interpolate(f, [LOCK, LOCK + 1, LOCK + 5], [0, 1, 0], clamp);
  const h = HALF * shrink - 3 * bite;
  const reticleOp = interpolate(f, [FLY_IN, FLY_IN + 3], [0, 1], clamp) * (1 - open);
  const glow = interpolate(f, [LOCK, LOCK + 3, LOCK + 10], [0, 0.5, 0.22], clamp) * (1 - open);
  const corners = [
    { x: TCX - h, y: TCY - h, sx: 1, sy: 1 },
    { x: TCX + h, y: TCY - h, sx: -1, sy: 1 },
    { x: TCX - h, y: TCY + h, sx: 1, sy: -1 },
    { x: TCX + h, y: TCY + h, sx: -1, sy: -1 },
  ];
  const bar = (w: number, hh: number): React.CSSProperties => ({ position: 'absolute', left: 0, top: 0, width: w, height: hh, borderRadius: 2, background: C.dust1, boxShadow: '0 0 0 1px rgba(0,0,0,0.6)' });
  const c = CAPTIONS.ridge;
  return (
    <AbsoluteFill>
      <PageCam src="captures/ridge-first.png" src2={seqSrc(RIDGE_SEQ.dir, idx, RIDGE_SEQ.n)} mix2={open} pageH={1080} keys={keys}>
        {glow > 0 && <div style={{ position: 'absolute', left: TCX - HALF, top: TCY - HALF, width: HALF * 2, height: HALF * 2, borderRadius: 2, background: `rgba(240,236,228,${(glow * 0.35).toFixed(3)})` }} />}
        {f >= FLY_IN && reticleOp > 0.001 && (
          <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${fx}px, ${fy}px)`, opacity: reticleOp }}>
            {corners.map((k, i) => (
              <div key={i} style={{ position: 'absolute', left: k.x, top: k.y, transform: `scale(${k.sx}, ${k.sy})`, transformOrigin: '0 0' }}>
                <div style={bar(ARM, THICK)} />
                <div style={bar(THICK, ARM)} />
              </div>
            ))}
          </div>
        )}
      </PageCam>
      <CaptionBand main={c.main} sub={c.sub} at={c.at} subAt={c.subAt} duration={duration} bandEnd={duration + 8} side={ridgeSide} />
    </AbsoluteFill>
  );
};

// ── S8: scan-bracket-sweep (demos/effects/scan-bracket-sweep/ScanBracketSweep.tsx), re-skinned: the validation page
// stays still (the card's rule); four L brackets settle around the two maps (ours, computed live in this browser,
// and NASA Goddard's published one), then one scan line reads both maps in step. 3 passes of ~0.8 s each (the card's
// per-pass time; 5 passes do not fit a 3.2 s shot).
const VAL = L.validation ?? { cropH: 1500, maps: [{ x: 667, y: 1083, w: 285, h: 285 }, { x: 968, y: 1083, w: 285, h: 285 }] };
const [M1, M2]: Box[] = VAL.maps;
const VAL_SUBJECT = { ...union(M1, M2), h: M1.h + 34 }; // with the captions under the maps
const valCam = fit(pad(VAL_SUBJECT, 40, 30), SAFE.bottom, 1.75, 1, 1920, VAL.cropH);
const PASSES = 3;
const inOutSin = (x: number) => 0.5 - Math.cos(Math.PI * Math.max(0, Math.min(1, x))) / 2;

export const ValidationShot: React.FC<{ duration: number }> = ({ duration }) => {
  const f = useCurrentFrame();
  const t = f / (duration - 1);
  const keys: CamKey[] = [key(0, valCam), key(duration + 8, valCam)]; // static: the card's rule is that the document does not move
  const bx = VAL_SUBJECT.x - 10, by = VAL_SUBJECT.y - 10, bw = VAL_SUBJECT.w + 20, bh = VAL_SUBJECT.h + 20;
  const CS = 40;
  const corners = [
    { l: bx, t: by, d: `M1 ${CS - 1}V1h${CS - 2}`, dx: 1, dy: 1 },
    { l: bx + bw - CS, t: by, d: `M1 1h${CS - 2}v${CS - 2}`, dx: -1, dy: 1 },
    { l: bx + bw - CS, t: by + bh - CS, d: `M${CS - 1} 1v${CS - 2}H1`, dx: -1, dy: -1 },
    { l: bx, t: by + bh - CS, d: `M${CS - 1} ${CS - 1}H1V1`, dx: 1, dy: -1 },
  ];
  // scan: window t 0.17 -> 0.95, linear across passes, in-out sine inside a pass, last 12% of each pass still
  const scanAt = (tt: number) => {
    const sp = Math.max(0, Math.min(1, (tt - 0.17) / (0.95 - 0.17)));
    const raw = sp * PASSES;
    const pi = Math.min(PASSES - 1, Math.floor(raw));
    const local = Math.max(0, Math.min(1, (raw - pi) / 0.88));
    const dir = pi % 2 === 0 ? 1 : -1;
    const p = inOutSin(local);
    return { y: dir > 0 ? p * M1.h : M1.h - p * M1.h, dir };
  };
  const { y, dir } = scanAt(t);
  const dt = 1 / (duration - 1);
  const speed = Math.abs(scanAt(t + dt / 2).y - scanAt(t - dt / 2).y);
  const tail = 60 * Math.min(1, speed / 14);
  const clipOp = ramp(t, 0.15, 0.05, EASE.linear) * (1 - ramp(t, 0.93, 0.06, EASE.linear));
  const scanBand = (m: Box) => (
    <div style={{ position: 'absolute', left: m.x, top: m.y, width: m.w, height: m.h, overflow: 'hidden', borderRadius: 2, opacity: clipOp, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: dir > 0 ? y - tail : y, height: tail, background: `linear-gradient(${dir > 0 ? '180deg' : '0deg'}, rgba(240,236,228,0) 0%, rgba(240,236,228,0.16) 100%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: y - 0.6, height: 1.2, background: C.dust1, boxShadow: '0 0 6px 1px rgba(240,236,228,0.55)' }} />
    </div>
  );
  const c = CAPTIONS.validation;
  return (
    <AbsoluteFill>
      <PageCam src="captures/validation-goddard.png" pageH={VAL.cropH} keys={keys}>
        {corners.map((k, i) => {
          const p = ramp(t, 0.02 + i * 0.022, 0.055, EASE.out);
          return (
            <svg key={i} width={CS} height={CS} viewBox={`0 0 ${CS} ${CS}`} style={{ position: 'absolute', left: k.l - (1 - p) * 8 * k.dx, top: k.t - (1 - p) * 8 * k.dy, opacity: p, overflow: 'visible' }}>
              <path d={k.d} fill="none" stroke={C.dust1} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          );
        })}
        {scanBand(M1)}
        {scanBand(M2)}
      </PageCam>
      <CaptionBand main={c.main} sub={c.sub} sub2={c.sub2} at={c.at} subAt={c.subAt} sub2At={c.sub2At} duration={duration} bandEnd={duration + 8} />
    </AbsoluteFill>
  );
};
