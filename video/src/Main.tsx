// Written with AI assistance (Claude); see the README.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C } from './tokens';
import { CHALLENGE, CLOSE, DEFAULT_LIVE_LINK, NAME, SHOTS, TEAM, TOTAL, XFADE, FPS } from './timeline';
import { ChallengeShot, CloseShot, NameShot, TeamShot } from './shots/Titles';
import { LightLayer, LightShot, NamePool, NeedsShot, RidgeShot, SlipShot, ValidationShot } from './shots/AppShots';

export type DemoProps = { bgm: boolean; liveLink: string };
export const DEFAULT_PROPS: DemoProps = { bgm: true, liveLink: DEFAULT_LIVE_LINK };

// ── Sound (sound-design.md): SFX pinned relative to SHOTS, with the source peak and the output offset subtracted.
// Output offset: AAC priming measured on this pipeline (see README, "Audio sync").
export const OUTPUT_AUDIO_OFFSET_F = 1.28;
const PEAK_F: Record<string, number> = {
  'fs-701104.mp3': 0.505 * FPS, // whoosh, energy peak 0.505 s (manifest analysis)
  'fs-815493.mp3': 0.165 * FPS, // latch click, 0.165 s
  'fs-728515.mp3': 0.025 * FPS, // soft impact, 0.025 s
};
const sfxFrom = (targetPeakF: number, src: string) => Math.max(0, Math.round(targetPeakF - (PEAK_F[src] ?? 0) - OUTPUT_AUDIO_OFFSET_F));
export const SFX: { from: number; src: string; volume: number; durationInFrames: number; note: string }[] = [
  { from: sfxFrom(SHOTS.name.from + 46, 'fs-728515.mp3'), src: 'fs-728515.mp3', volume: 0.48, durationInFrames: 40, note: 'S3 wordmark: last glyph pressed' },
  { from: sfxFrom(SHOTS.light.from + 14, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.7, durationInFrames: 40, note: 'S4 camera pulls back to the whole app' },
  { from: sfxFrom(SHOTS.needs.from + 72, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.75, durationInFrames: 40, note: 'S5 camera travels from the brief to the map' },
  { from: sfxFrom(SHOTS.ridge.from + 36, 'fs-815493.mp3'), src: 'fs-815493.mp3', volume: 0.65, durationInFrames: 18, note: 'S7 reticle locks on the ridge marker (the click)' },
];
// BGM: "Cat Walk" by Arulo (Mixkit). Its quiet intro sits under the title cards; the bass enters at 14.75 s of
// the track, which is placed on the cut to the app (S4).
export const BGM = { src: 'bgm-cat-walk.mp3', startFromS: 14.75 - SHOTS.light.from / FPS, volume: 0.4 };

const Bgm: React.FC = () => {
  const f = useCurrentFrame();
  const v = interpolate(f, [0, 20, TOTAL - 45, TOTAL - 2], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <Audio src={staticFile(`audio/${BGM.src}`)} startFrom={Math.round(BGM.startFromS * FPS)} volume={BGM.volume * v} />;
};

/** A shot that fades in over the previous one (crossfade), except the first. */
const Fade: React.FC<{ children: React.ReactNode; on: boolean }> = ({ children, on }) => {
  const f = useCurrentFrame();
  const o = on ? interpolate(f, [0, XFADE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};
const Shot: React.FC<{ id: keyof typeof SHOTS; fade?: boolean; tail?: number; children: React.ReactNode }> = ({ id, fade = true, tail = XFADE, children }) => (
  <Sequence from={SHOTS[id].from} durationInFrames={SHOTS[id].duration + tail} name={SHOTS[id].label}>
    <Fade on={fade}>{children}</Fade>
  </Sequence>
);

export const Main: React.FC<DemoProps> = ({ bgm, liveLink }) => (
  <AbsoluteFill style={{ backgroundColor: C.shadow }}>
    <Shot id="team" fade={false}><TeamShot duration={SHOTS.team.duration} title={TEAM.title} members={TEAM.members} /></Shot>
    {/* the lunar month of light runs continuously under S2-S4 */}
    <Sequence from={SHOTS.challenge.from} durationInFrames={SHOTS.needs.from + XFADE - SHOTS.challenge.from} name="Light layer">
      <Fade on>
        <LightLayer />
      </Fade>
    </Sequence>
    <Shot id="challenge"><ChallengeShot duration={SHOTS.challenge.duration} kicker={CHALLENGE.kicker} title={CHALLENGE.title} /></Shot>
    <Shot id="name" fade={false} tail={0}>
      <NamePool duration={SHOTS.name.duration} />
      <NameShot duration={SHOTS.name.duration} wordmark={NAME.wordmark} tagline={NAME.tagline} />
    </Shot>
    <Shot id="light" fade={false}><LightShot duration={SHOTS.light.duration} /></Shot>
    <Shot id="needs"><NeedsShot duration={SHOTS.needs.duration} /></Shot>
    <Shot id="slip"><SlipShot duration={SHOTS.slip.duration} /></Shot>
    <Shot id="ridge"><RidgeShot duration={SHOTS.ridge.duration} /></Shot>
    <Shot id="validation"><ValidationShot duration={SHOTS.validation.duration} /></Shot>
    <Shot id="close" tail={0}><CloseShot duration={SHOTS.close.duration} wordmark={NAME.wordmark} line={CLOSE.line} liveLink={liveLink} credit={CLOSE.credit} /></Shot>

    {bgm && <Bgm />}
    {SFX.map((s, i) => (
      <Sequence key={i} from={s.from} durationInFrames={s.durationInFrames} name={`SFX ${s.note}`}>
        <Audio src={staticFile(`audio/sfx/${s.src}`)} volume={s.volume} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
