// Written with AI assistance (Claude); see the README.
// origin: video-shotcraft assets/lib/PageCam.tsx (Apache 2.0). Flat 2.5D camera over a 2x page capture.
// Changes for Earthrise: true-black backdrop (the product's --shadow), the texture may change every frame
// (frame sequences captured from the running app), and an optional cross-faded second texture.
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { C } from '../tokens';

export type CamKey = { frame: number; cx: number; cy: number; zoom: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const camAt = (keys: CamKey[], frame: number, ease = Easing.bezier(0.33, 0, 0.15, 1)) => {
  let a = keys[0], b = keys[keys.length - 1];
  if (frame <= keys[0].frame) b = a;
  for (let i = 0; i < keys.length - 1; i++) {
    if (frame >= keys[i].frame && frame <= keys[i + 1].frame) { a = keys[i]; b = keys[i + 1]; break; }
  }
  const t = a.frame === b.frame ? 1 : interpolate(frame, [a.frame, b.frame], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  return { cx: lerp(a.cx, b.cx, t), cy: lerp(a.cy, b.cy, t), zoom: lerp(a.zoom, b.zoom, t) };
};

export const PageCam: React.FC<{
  src: string; // staticFile path
  src2?: string; // optional second texture cross-faded over the first
  mix2?: number; // 0..1 opacity of src2
  pageW?: number;
  pageH: number; // CSS page height
  keys: CamKey[];
  filter?: string;
  children?: React.ReactNode; // overlays in page CSS px
  frame?: number;
}> = ({ src, src2, mix2 = 0, pageW = 1920, pageH, keys, filter, children, frame: frameProp }) => {
  const own = useCurrentFrame();
  const { cx, cy, zoom } = camAt(keys, frameProp ?? own);
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: C.shadow }}>
      <div
        style={{
          position: 'absolute', width: pageW, height: pageH,
          transform: `translate(${960 - cx * zoom}px, ${540 - cy * zoom}px) scale(${zoom})`,
          transformOrigin: '0 0', filter,
        }}
      >
        <Img src={staticFile(src)} style={{ position: 'absolute', width: pageW, height: pageH }} />
        {src2 && mix2 > 0 ? <Img src={staticFile(src2)} style={{ position: 'absolute', width: pageW, height: pageH, opacity: mix2 }} /> : null}
        {children}
      </div>
    </AbsoluteFill>
  );
};

export const seqSrc = (dir: string, i: number, n: number) => `${dir}/${String(Math.max(0, Math.min(n - 1, Math.round(i)))).padStart(4, '0')}.jpg`;
