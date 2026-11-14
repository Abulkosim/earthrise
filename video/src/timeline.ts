// Written with AI assistance (Claude); see the README.
// The one source of truth for timing (30 fps). Shots, captions and sound cues are all derived from SHOTS.
// Numbers in captions are read from the running app at capture time (src/capture-layout.json), never typed here.
import layoutJson from './capture-layout.json';

export const FPS = 30;
const L = layoutJson as any;
/** "Stay evaluated at every point in 0.02 s" from the slip capture's status line. */
const EVAL_S: string | null = String(L.slip?.status ?? '').match(/every point in ([\d.]+) s/)?.[1] ?? null;
/** Live correlation with NASA Goddard's maps, as the validation page printed it: [Sun, Earth]. */
const CORR: string[] = L.validation?.corr ?? [];

export const SHOTS = {
  team: { from: 0, duration: 66, label: 'S1 Team' },
  challenge: { from: 66, duration: 70, label: 'S2 Challenge' },
  name: { from: 136, duration: 106, label: 'S3 Name and tagline' },
  light: { from: 242, duration: 104, label: 'S4 Every point at once' },
  needs: { from: 346, duration: 125, label: 'S5 Brief to map' },
  slip: { from: 471, duration: 98, label: 'S6 Landing date slips' },
  ridge: { from: 569, duration: 110, label: 'S7 Lander view' },
  validation: { from: 679, duration: 92, label: 'S8 Validation' },
  close: { from: 771, duration: 69, label: 'S9 Close' },
} as const;
export type ShotId = keyof typeof SHOTS;

export const TOTAL = SHOTS.close.from + SHOTS.close.duration; // 840 f = 28.0 s

// Crossfade between consecutive app shots (frames the next shot overlaps the previous one).
export const XFADE = 8;

// Capture sequences: one captured picture per video frame unless noted.
export const LIGHT_SEQ = { dir: 'captures/light', n: 300, start: SHOTS.challenge.from, stepH: 3 };
export const SLIP_SEQ = { dir: 'captures/slip', n: 110, stepH: 6 };
export const RIDGE_SEQ = { dir: 'captures/ridge', n: 110, stepH: 2 };

/**
 * Burned-in captions (English). `text` uses a tiny markup: words written sun:Word or earth:Word are set in the
 * product's Sun gold or Earth blue, as the app itself does. `at` is relative to the shot start.
 */
export const CAPTIONS: Record<'light' | 'needsA' | 'needsB' | 'slip' | 'ridge' | 'validation', { main: string; sub?: string; sub2?: string; at: number; subAt?: number; sub2At?: number; until?: number }> = {
  light: {
    main: 'sun:Sunlight and earth:Earth contact for every point at once',
    sub: 'Terrain horizons in 360 directions for every point in view, on the GPU',
    at: 16, subAt: 30,
  },
  needsA: { main: 'Write the mission brief in sentences', at: 6, until: 66 },
  needsB: {
    main: 'The map shows where the mission works',
    sub: "From NASA Goddard's adjusted LOLA terrain and the JPL DE440 ephemeris",
    at: 70, subAt: 82,
  },
  slip: {
    main: 'The landing date slips: map and calendar follow',
    sub: EVAL_S ? `A 14-day stay, re-run at every point in ${EVAL_S} s` : 'A 14-day stay, re-run at every point',
    at: 8, subAt: 22,
  },
  ridge: {
    main: 'Click a point: what the lander sees',
    sub: 'On 5 m terrain: sun:Sun and earth:Earth over the real horizon, with time to sunset',
    at: 8, subAt: 28,
  },
  validation: {
    main: 'Checked against JPL Horizons, Apollo and NASA Goddard',
    sub: 'Reproduces Barker et al. 2021 at 5 m',
    sub2: CORR.length === 2 ? `Goddard maps: correlation ${CORR[0]} sun:Sun, ${CORR[1]} earth:Earth` : undefined,
    at: 8, subAt: 20, sub2At: 32,
  },
};

// Title cards (S1 to S3, S9).
export const TEAM = { title: 'Team Earthrise, Tashkent', members: 'Maria Dorofeeva, Abulkosim, Vladislav Kasev' };
export const CHALLENGE = { kicker: 'NASA Space Apps Challenge 2026', title: 'Lunar Landing Site Navigator' };
export const NAME = { wordmark: 'Earthrise', tagline: "Every landing site at the Moon's south pole, every hour, on one map." };
export const CLOSE = { line: 'Runs in a desktop browser. No install.', credit: 'Team Earthrise, NASA Space Apps Challenge 2026' };

/** Default text for the live address line on the closing shot. Change it with --props (see README). */
export const DEFAULT_LIVE_LINK = 'abulkosim.github.io/earthrise';
