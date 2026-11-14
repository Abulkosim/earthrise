// Written with AI assistance (Claude); see the README.
// Title shots: S1 team, S2 challenge, S3 name + tagline (brand-ink-open), S9 close.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { C, FONT, T } from '../tokens';
import { EASE, ramp } from '../lib/Polish';
import { Words, parseWords } from '../lib/Words';

const LEFT = 160;
const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

/** A hairline like the app's --rule, drawn left to right (blur-slide demo's masthead rule). */
const Rule: React.FC<{ top: number; start: number; width?: number; left?: number }> = ({ top, start, width = 1600, left = LEFT }) => {
  const f = useCurrentFrame();
  const p = ramp(f, start, 24, EASE.snappy);
  return <div style={{ position: 'absolute', left, top, width, height: 1, background: C.ground3, transform: `scaleX(${p.toFixed(4)})`, transformOrigin: '0 50%' }} />;
};

const fadeOut = (f: number, duration: number) => 1 - ramp(f, duration - 7, 7, EASE.swift);

// S1 — team name and members, on true black. Everything is readable before 1.2 s.
export const TeamShot: React.FC<{ duration: number; title: string; members: string }> = ({ duration, title, members }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.shadow, opacity: fadeOut(f, duration + 8) }}>
      <Rule top={392} start={0} />
      <Words
        words={parseWords(title)} start={2} stagger={4} dur={20} dy={28} blur={14}
        style={{ position: 'absolute', left: LEFT - 4, top: 436, fontFamily: FONT.ui, fontSize: T.title, fontWeight: 560, letterSpacing: '-0.02em', lineHeight: 1, color: C.dust1 }}
      />
      <Words
        words={parseWords(members)} start={6} stagger={2} dur={18} dy={16} blur={8} gap="0.3em"
        style={{ position: 'absolute', left: LEFT, top: 556, fontFamily: FONT.ui, fontSize: 48, fontWeight: 400, lineHeight: 1.1, color: C.dust2 }}
      />
    </AbsoluteFill>
  );
};

// S2 — the challenge, over the real map (dimmed; the light layer is drawn underneath by Main).
export const ChallengeShot: React.FC<{ duration: number; kicker: string; title: string }> = ({ duration, kicker, title }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: fadeOut(f, duration + 8) }}>
      <Words
        words={parseWords(kicker)} start={4} stagger={3} dur={18} dy={16} blur={8}
        style={{ position: 'absolute', left: LEFT, top: 400, fontFamily: FONT.ui, fontSize: T.kicker, fontWeight: 450, color: C.dust2, lineHeight: 1 }}
      />
      <Words
        words={parseWords(title)} start={9} stagger={4} dur={20} dy={28} blur={14}
        style={{ position: 'absolute', left: LEFT - 4, top: 476, fontFamily: FONT.ui, fontSize: T.title, fontWeight: 560, letterSpacing: '-0.02em', color: C.dust1, lineHeight: 1 }}
      />
    </AbsoluteFill>
  );
};

// S3 — brand-ink-open (demos/typography/brand-ink-open/BrandInkOpen.tsx), re-skinned with Earthrise tokens:
// crosshair drawn (a landing-site mark), wordmark pressed glyph by glyph (Source Serif 4 italic, the app's name face),
// tagline typed, the complete lockup holds well over 1 s, then lifts, shrinks and fades.
export const NameShot: React.FC<{ duration: number; wordmark: string; tagline: string }> = ({ duration, wordmark, tagline }) => {
  const frame = useCurrentFrame();
  const vDraw = interpolate(frame, [0, 9], [100, 0], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const hDraw = interpolate(frame, [8, 18], [100, 0], { ...clamp, easing: Easing.linear });
  const crossFade = interpolate(frame, [24, 34], [1, 0], clamp);

  // tagline typewriter: 0.55 f/char (the card's 0.7 f/char is for decorative text; this line is typed slightly faster
  // so the complete lockup then holds for more than 1 s before the exit, the card's hard floor).
  const perChar = 0.55;
  const kickStart = 26;
  const chars = Math.floor(Math.max(0, frame - kickStart) / perChar);
  const kickDone = kickStart + tagline.length * perChar;
  const cursorOn = frame >= kickStart && (frame < kickDone || (frame < duration - 12 && Math.floor((frame - kickDone) / 6) % 2 === 0));

  const exitStart = duration - 7;
  const out = interpolate(frame, [exitStart, duration], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.5, 1) });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center', opacity: 1 - out, transform: `translateY(${-out * 40}px) scale(${1 - out * 0.12})` }}>
        <svg width={72} height={72} viewBox="0 0 72 72" style={{ display: 'block', margin: '0 auto 26px', opacity: crossFade }}>
          <line x1={36} y1={2} x2={36} y2={70} stroke={C.dust1} strokeWidth={3} strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={vDraw} />
          <line x1={2} y1={36} x2={70} y2={36} stroke={C.dust1} strokeWidth={3} strokeLinecap="round" pathLength={100} strokeDasharray={100} strokeDashoffset={hDraw} />
          <circle cx={36} cy={36} r={12} fill="none" stroke={C.dust1} strokeWidth={2} pathLength={100} strokeDasharray={100} strokeDashoffset={hDraw} />
        </svg>
        <div style={{ fontFamily: FONT.place, fontStyle: 'italic', fontWeight: 400, fontSize: T.wordmark, color: C.dust1, lineHeight: 1, letterSpacing: '0.005em', display: 'inline-flex', alignItems: 'flex-end', whiteSpace: 'pre' }}>
          {wordmark.split('').map((ch, i) => {
            const delay = 10 + i * 3;
            const t = interpolate(frame, [delay, delay + 12], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.7, 0.25, 1) });
            const glint = interpolate(frame, [delay + 8, delay + 12, delay + 16], [0, 1, 0], clamp);
            return (
              <span key={i} style={{ position: 'relative', display: 'inline-block', opacity: t, transform: `scale(${1.6 - 0.6 * t})`, transformOrigin: 'center bottom', filter: t >= 0.999 ? undefined : `blur(${(1 - t) * 6}px)` }}>
                {ch}
                <span style={{ position: 'absolute', left: '50%', bottom: -10, transform: 'translateX(-50%)', width: `${glint * 100}%`, height: 2, background: C.dust2, opacity: glint * 0.8, borderRadius: 2 }} />
              </span>
            );
          })}
        </div>
        <div style={{ fontFamily: FONT.ui, fontSize: T.kicker, color: C.dust2, marginTop: 40, height: 52, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <span style={{ whiteSpace: 'pre', position: 'relative' }}>
            {/* reserve the full width so the line does not re-centre while typing */}
            <span style={{ visibility: 'hidden' }}>{tagline}</span>
            <span style={{ position: 'absolute', left: 0, top: 0 }}>
              {tagline.slice(0, chars)}
              <span style={{ display: 'inline-block', width: 4, height: 42, marginLeft: 4, verticalAlign: '-6px', background: C.dust1, opacity: cursorOn ? 0.85 : 0 }} />
            </span>
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// S9 — close: the name, where to try it (a single prop), and the team.
export const CloseShot: React.FC<{ duration: number; wordmark: string; line: string; liveLink: string; credit: string }> = ({ duration, wordmark, line, liveLink, credit }) => {
  const f = useCurrentFrame();
  const end = 1; // the address holds to the last frame
  const w = ramp(f, 4, 22, EASE.out);
  return (
    <AbsoluteFill style={{ background: C.shadow, opacity: end }}>
      <div style={{ position: 'absolute', left: LEFT - 6, top: 268, fontFamily: FONT.place, fontStyle: 'italic', fontWeight: 400, fontSize: 150, lineHeight: 1, color: C.dust1, opacity: w, transform: `translateY(${(1 - w) * 30}px)`, filter: w >= 0.999 ? undefined : `blur(${(1 - w) * 12}px)` }}>
        {wordmark}
      </div>
      <Rule top={470} start={8} />
      <Words words={parseWords(line)} start={12} stagger={2.4} dur={18} dy={16} blur={8}
        style={{ position: 'absolute', left: LEFT, top: 508, fontFamily: FONT.ui, fontSize: T.kicker, color: C.dust2, lineHeight: 1.1 }} />
      <Words words={parseWords(liveLink)} start={18} stagger={2.4} dur={18} dy={16} blur={8}
        style={{ position: 'absolute', left: LEFT, top: 590, fontFamily: FONT.ui, fontSize: 56, fontWeight: 520, color: C.dust1, lineHeight: 1.1 }} />
      <Words words={parseWords(credit)} start={24} stagger={2} dur={18} dy={12} blur={6}
        style={{ position: 'absolute', left: LEFT, top: 760, fontFamily: FONT.ui, fontSize: 40, color: C.dust3, lineHeight: 1.1 }} />
    </AbsoluteFill>
  );
};
