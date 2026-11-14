// Written with AI assistance (Claude); see the README.
// Burned-in caption over real app footage: a true-black band (the app's own --shadow colour) so the app's small text
// underneath never competes with the caption, then a main line and an optional secondary line set with blur-slide.
// Left-aligned on the caption grid, like the app's panels. The band sits at the bottom, or at the top when the
// shot's subject is low on screen (decided per shot from the capture layout, see lib/frame.ts bandSide).
import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, FONT, SAFE_X, T } from '../tokens';
import { EASE, ramp } from './Polish';
import { Words, parseWords } from './Words';

export const BAND_TOP = 846; // bottom band: first text line starts here

export const CaptionBand: React.FC<{
  main: string;
  sub?: string;
  sub2?: string; // an optional second secondary line
  at: number;
  subAt?: number;
  sub2At?: number;
  until?: number; // main line fades out here (for a two-caption shot)
  bandIn?: number; // frame the band itself appears (default: at - 6)
  duration: number; // the words are gone by this frame (so they never cross-fade over the next shot's picture)
  bandEnd?: number; // the black band itself stays until here (default: duration)
  side?: 'bottom' | 'top';
  textTop?: number; // bottom band only: first text line starts here (default BAND_TOP); lower it to clear app content
}> = ({ main, sub, sub2, at, subAt, sub2At, until, bandIn, duration, bandEnd, side = 'bottom', textTop = BAND_TOP }) => {
  const frame = useCurrentFrame();
  const b0 = bandIn ?? Math.max(0, at - 6);
  const end = 1 - ramp(frame, duration - 6, 6, EASE.swift);
  const be = bandEnd ?? duration;
  const band = ramp(frame, b0, 10, EASE.trust) * (1 - ramp(frame, be - 6, 6, EASE.swift));
  const top = side === 'top';
  const bandStyle: React.CSSProperties = top
    ? { top: 0, height: 290, background: `linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0.86) 56px, ${C.shadow} 84px, ${C.shadow} 100%)` }
    : { top: textTop - 70, bottom: 0, background: `linear-gradient(180deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0.86) 56px, ${C.shadow} 84px, ${C.shadow} 100%)` };
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, opacity: band, ...bandStyle }} />
      <div style={{ position: 'absolute', left: SAFE_X, right: SAFE_X, top: top ? 64 : textTop + 4, opacity: end }}>
        <Words
          words={parseWords(main)} start={at} stagger={3} dur={20} dy={22} blur={10} out={until}
          style={{ fontFamily: FONT.ui, fontSize: T.caption, fontWeight: 520, letterSpacing: '-0.012em', lineHeight: 1.12, color: C.dust1 }}
        />
        {sub && (
          <Words
            words={parseWords(sub)} start={subAt ?? at + 14} stagger={2.2} dur={18} dy={14} blur={7} gap="0.24em"
            style={{ marginTop: 18, fontFamily: FONT.ui, fontSize: T.sub, fontWeight: 400, lineHeight: 1.15, color: C.dust2 }}
          />
        )}
        {sub2 && (
          <Words
            words={parseWords(sub2)} start={sub2At ?? (subAt ?? at + 14) + 12} stagger={2.2} dur={18} dy={14} blur={7} gap="0.24em"
            style={{ marginTop: 6, fontFamily: FONT.ui, fontSize: T.sub, fontWeight: 400, lineHeight: 1.15, color: C.dust2 }}
          />
        )}
      </div>
    </div>
  );
};
