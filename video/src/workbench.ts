// Written with AI assistance (Claude); see the README.
// Workbench manifest (video-shotcraft references/workbench.md §2-3): how this film decomposes into editable clips.
// Every table is imported from timeline.ts / Main.tsx, so there is no second copy of the timing.
// Editable per unit: the title copy and the live-address line (text fields). Motion timing is not exposed.
import { createElement, type FC } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { C } from './tokens';
import { BGM, DEFAULT_PROPS, Main, SFX } from './Main';
import { CHALLENGE, CLOSE, NAME, SHOTS, TEAM, TOTAL, XFADE, FPS } from './timeline';
import { ChallengeShot, CloseShot, NameShot, TeamShot } from './shots/Titles';
import { LightLayer, LightShot, NamePool, NeedsShot, RidgeShot, SlipShot, ValidationShot } from './shots/AppShots';

type Field = { type: string; key: string; label: string; default: unknown };
const text = (key: string, label: string, def: string): Field => ({ type: 'text', key, label, default: def });

const FadeIn: FC<{ on: boolean; children?: React.ReactNode }> = ({ on, children }) => {
  const f = useCurrentFrame();
  return createElement(AbsoluteFill, { style: { opacity: on ? interpolate(f, [0, XFADE], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1 } }, children);
};
const unit = (C2: FC<any>, fade: boolean, name: string): FC<any> => {
  const U: FC<any> = (p) => createElement(FadeIn, { on: fade }, createElement(C2, p));
  U.displayName = name;
  return U;
};
const NameUnit: FC<any> = (p) => createElement(AbsoluteFill, null, createElement(NamePool, { duration: p.duration }), createElement(NameShot, p));

const shot = (id: keyof typeof SHOTS, component: FC<any>, props: Record<string, unknown>, schema: Field[] = [], tail = XFADE) => ({
  id, label: SHOTS[id].label, from: SHOTS[id].from, duration: SHOTS[id].duration + tail, component, props: { duration: SHOTS[id].duration, ...props }, schema,
});

export const WORKBENCH = {
  name: 'Earthrise · NASA Space Apps 2026 demo',
  fps: FPS, width: 1920, height: 1080, total: TOTAL, background: C.shadow,
  shots: [
    shot('team', unit(TeamShot, false, 'TeamShot'), { ...TEAM }, [text('title', 'Team', TEAM.title), text('members', 'Members', TEAM.members)]),
    { id: 'light-layer', label: 'Light layer (S2-S4)', from: SHOTS.challenge.from, duration: SHOTS.needs.from + XFADE - SHOTS.challenge.from, component: unit(LightLayer, true, 'LightLayer'), props: {}, schema: [] },
    shot('challenge', unit(ChallengeShot, true, 'ChallengeShot'), { ...CHALLENGE }, [text('kicker', 'Kicker', CHALLENGE.kicker), text('title', 'Challenge', CHALLENGE.title)]),
    shot('name', unit(NameUnit, false, 'NameShot'), { ...NAME }, [text('wordmark', 'Name', NAME.wordmark), text('tagline', 'Tagline', NAME.tagline)], 0),
    shot('light', unit(LightShot, false, 'LightShot'), {}),
    shot('needs', unit(NeedsShot, true, 'NeedsShot'), {}),
    shot('slip', unit(SlipShot, true, 'SlipShot'), {}),
    shot('ridge', unit(RidgeShot, true, 'RidgeShot'), {}),
    shot('validation', unit(ValidationShot, true, 'ValidationShot'), {}),
    shot('close', unit(CloseShot, true, 'CloseShot'), { wordmark: NAME.wordmark, line: CLOSE.line, liveLink: DEFAULT_PROPS.liveLink, credit: CLOSE.credit },
      [text('line', 'Where to try it', CLOSE.line), text('liveLink', 'Live address', DEFAULT_PROPS.liveLink), text('credit', 'Credit', CLOSE.credit)], 0),
  ],
  transitions: [],
  captions: [],
  overlays: [],
  sfx: SFX.map((s) => ({ from: s.from, duration: s.durationInFrames, src: `audio/sfx/${s.src}`, volume: s.volume })),
  bgm: [{ from: 0, duration: TOTAL, src: `audio/${BGM.src}`, volume: BGM.volume, startFrom: Math.round(BGM.startFromS * FPS) }],
  original: Main,
};
