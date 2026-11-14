# Earthrise demo video

A 28-second project demo for the NASA Space Apps Challenge 2026 (challenge "Lunar Landing Site Navigator"),
made with the [video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) skill in its autonomous
free-creation mode, rendered with Remotion. English only, captions burned in, no voice-over.

- `out/earthrise-demo.mp4`: 1920x1080, 30 fps, H.264 + AAC, with music and sound effects.
- `out/earthrise-demo-nomusic.mp4`: the same timeline without the music (sound effects kept), as the skill prescribes.

Every picture is a screenshot of the running Earthrise app (no AI-generated images, video or voices, no NASA logo).

## Re-shoot and re-render (two commands)

The app must be running at http://localhost:5199 (or pass `--url <address>`, or set `EARTHRISE_URL`). Chrome at
`/Applications/Google Chrome.app` (or set `CHROME`). Then, in this folder (`npm install` once):

```sh
npm run capture   # 1. re-shoot all footage from the running app (10 to 15 min): node scripts/capture.mjs
npm run build     # 2. render both videos and print their durations
```

`npm run build` = `npm run render && npm run render:nomusic && npm run probe`.
A single set can be re-shot with `node scripts/capture.mjs light|needs|slip|ridge|validation` (several names are
allowed). `src/capture-layout.json` is saved after every set, so a set that fails does not cost the others.

The capture script uses only the hooks the app keeps stable across redesigns: `window.__earthrise.ui` setters
and `window.__earthrise.engine`, the URL fragment (`c`, `t`, `l`, `d`, `layer`, `site`), and the selectors and texts
`.status` ("Horizons for"), `.calendar-name` ("Best day"), `.map-note`, `.layer` (label + radio), `.ribbon-row`,
`.sheet` ("From the lander"), `.intro`, the brief's `aria-label="Mission brief"`, and on the validation page the
Goddard maps' `aria-label`, their "Run this check" button and the `tr.vyours` rows. Everything the camera frames
(mission brief, map note, landing calendar, site panel and panorama, ridge marker, the validation page's two maps)
is located at capture time from those hooks or from visible text and written to `src/capture-layout.json`; the
shots derive every camera move and the caption side (top or bottom) from that file. A new UI layout therefore needs
no code change: run both commands again, then look at the stills (`npm run stills`) to check the framing.

The footage in this folder was shot on 14 Nov 2026 from interface version 2 (a full-screen map under floating
panels, the 5 m terrain close-up of the connecting ridge). Two things to know when re-shooting:

- **Hot reload.** If the app's source changes while a set is being shot, the dev server reloads the page; the script
  notices and starts that set again in a fresh tab (up to 4 times). To shoot while someone is editing the app, start a
  second dev server with hot reload and the file watcher off and pass its address with `--url`
  (in `app/`: `node --input-type=module -e "import {createServer} from 'vite'; const s = await createServer({server:{port:5202,strictPort:true,hmr:false,watch:null}}); await s.listen()"`).
- **GPU load.** The app decides how many points to trace from how fast the machine is at that moment (up to 266,256
  on the capture machine). Another headless browser on the same GPU lowers that number; the status line in the
  footage always states the real count. Shoot when the GPU is otherwise idle.

### The live address

The closing line is the `liveLink` prop (default `"abulkosim.github.io/earthrise"`, constant `DEFAULT_LIVE_LINK` in
`src/timeline.ts`). To render with the real address in one command:

```sh
npx remotion render src/index.ts EarthriseDemo out/earthrise-demo.mp4 --props='{"liveLink":"abulkosim.github.io/earthrise"}'
npx remotion render src/index.ts EarthriseDemo out/earthrise-demo-nomusic.mp4 --props='{"liveLink":"abulkosim.github.io/earthrise","bgm":false}'
```

(On Windows put the JSON in a file and pass `--props=file.json`.)

## Shot list (30 fps, 840 frames = 28.0 s)

App shots cross-fade over 8 frames; each caption's words are gone before the next picture fades in.

| # | Time | Frames | Picture (all real app captures) | Caption text (exact) | Motion (shot card) |
|---|---|---|---|---|---|
| S1 | 0:00.00-0:02.20 | 0-65 | True black | "Team Earthrise, Tashkent" / "Maria Dorofeeva · Abulkosim · Vladislav Kasev" | blur-slide, hairline rule |
| S2 | 0:02.20-0:04.53 | 66-135 | The map, layer "Light at this moment", a lunar month of light starting (dimmed) | "NASA Space Apps Challenge 2026" / "Lunar Landing Site Navigator" | blur-slide |
| S3 | 0:04.53-0:08.07 | 136-241 | Same map, dimmed | "Earthrise" (Source Serif 4 italic) / "Every landing site at the Moon's south pole, every hour, on one map." | brand-ink-open (crosshair, pressed wordmark, typed tagline, hold > 1 s) |
| S4 | 0:08.07-0:11.53 | 242-345 | Pull-back from the map to the whole app (brief panel, layer bar, timeline dock floating over the full-screen map) while the light sweeps round the pole (3 h of lunar time per frame) | "Sunlight and Earth contact for every point at once" / "Terrain horizons in 360 directions for every point in view, on the GPU" | PageCam pull-back |
| S5 | 0:11.53-0:15.70 | 346-470 | Camera reads down the mission brief, then travels to the map as the layer becomes "Mission works"; the app's note reads "15% of the ground in view meets the brief for a landing on 3 Nov 2027." | "Write the mission brief in sentences", then "The map shows where the mission works" / "From NASA Goddard's adjusted LOLA terrain and the JPL DE440 ephemeris" | PageCam tilt and travel |
| S6 | 0:15.70-0:18.97 | 471-568 | The landing date slips 6 h per frame (3 Nov to 30 Nov 2027): the good ground shrinks, vanishes and returns; the calendar's selected bar and the note follow | "The landing date slips: map and calendar follow" / "A 14-day stay, re-run at every point in 0.05 s" (the time is read from the app's status line at capture) | PageCam slow push |
| S7 | 0:18.97-0:22.63 | 569-678 | The 5 m close-up of the connecting ridge: a reticle locks on the Shackleton connecting ridge marker, the site panel opens, the camera travels to the lander's-eye panorama while time runs 2 h per frame (Sun in gold, Earth in blue against the terrain) | "Click a point: what the lander sees" / "On 5 m terrain: Sun and Earth over the real horizon, with time to sunset" | fui-hud-moves · reticle-lock-on, PageCam |
| S8 | 0:22.63-0:25.70 | 679-770 | validation.html after its Goddard check ran live in the browser: "Ours, computed in your browser" beside "NASA Goddard, published" | "Checked against JPL Horizons, Apollo and NASA Goddard" / "Reproduces Barker et al. 2021 at 5 m" / "Goddard maps: correlation 0.942 Sun, 0.976 Earth" (read from the page's live rows at capture) | scan-bracket-sweep (3 passes) |
| S9 | 0:25.70-0:28.00 | 771-839 | True black | "Earthrise" / "Runs in a desktop browser. No install." / `liveLink` (default "abulkosim.github.io/earthrise") / "Team Earthrise · NASA Space Apps Challenge 2026" | blur-slide, hold to the end |

In captions, "Sun" is set in the app's Sun gold and "Earth" in its Earth blue; everything else is regolith grey.
Main captions are 58 px Archivo, secondary lines 42 px; titles 76 px; nothing meant to be read is under 40 px.
Numbers in captions are read from the app at capture time (`src/capture-layout.json`), never typed. The site
panel's "If the landing misses" share is not quoted in any caption: it changes from run to run.

## Design spec (stages 0 to 3, decided autonomously)

**Product brief.** Earthrise computes sunlight, Earth contact and power for every point of the Moon's south pole at
once on the GPU, takes the mission brief as sentences, shows where it works and how that changes when the landing
date slips, shows the lander's view of Sun and Earth, and checks itself against JPL Horizons, the Apollo landing
records and NASA Goddard's 18.6-year maps. Audience: hackathon judges with no context. Purpose: a calm project demo.

**Requirement to execution.**

| Requirement | Execution |
|---|---|
| <= 30.0 s, target 28 s | 840 frames at 30 fps, checked with ffprobe |
| Guide order: team, challenge, name + tagline, how it works on the real app, where to try it | S1, S2, S3, S4-S8, S9 |
| English, captions carry everything, no voice-over | Burned-in captions on a true-black band; one idea per shot |
| No NASA logo, no AI-generated media | Text only for names; every picture captured from the running app |
| Calm, information first, readable | "Professional trust" motion preset (about 21 f, bezier(0,0,0.2,1), no overshoot except the reticle's bite), no flashes, no shake, holds after every key line |
| Licensed audio only | Bundled Mixkit BGM (verified byte-identical to Mixkit's file) + three Freesound CC0 effects |

**Visual direction.** Taken from `app/src/index.css` (interface version 2): true black `#000`, regolith greys
(`#1c1b1a`, `#272624`, `#3a3835`), dust text (`#f2eee6`, `#b8b3a9`, `#7f7a72`), gold `#f5c96a` only for the Sun,
blue `#7db8f0` only for the Earth, Archivo for type, Source Serif 4 italic for the name, hairline rules, 2 px radius. No other hues, no glows
except the single scan line in S8. The HTML styleframe step was skipped on purpose: the product has a strict token
file and every frame is a real capture, so the first Remotion stills (S1, S4) served as the styleframes.

**Feature to shot mapping.** Team, challenge, name: blur-slide and brand-ink-open. Every point at once: the app's own
light sweep with a PageCam pull-back. Brief to map: PageCam tilt and travel. Date slip: the app's own slip, static
camera. Lander's view: fui-hud-moves reticle-lock-on, then PageCam. Validation: scan-bracket-sweep. Not shown (time):
the science sentence / permanent-shadow layer and the timeline lanes for compared sites (visible in S4 and S6 only as
part of the app).

**Independent review (stage 7).** A clean-context reviewer agent checked the render against final-review.md and
aesthetic-rules.md. Fixed after it: holds under 1.2 s (S1 members, S2 title, S3 lockup, S5 first caption, S7 second
line), captions double-exposed over the next shot in cross-fades, the S8 camera push during the scan (now static), a
too-quiet whoosh in S5, gold colouring a comma, half-cut brief text at the left edge in S5, the S2 title touching an
app label. Not changed: the address line stays the placeholder until the live address exists; no "what next" line
(time). The app's status text shows the point count the capture machine reached (266,256 in this footage); the
caption states no count.

**Re-shoot for interface version 2 (14 Nov 2026).** All footage was shot again from the redesigned app and the
video rendered again; timing, sound and title cards are unchanged. Framing changes, all derived from the recorded
boxes: with the map full-screen under floating panels, the pull-back (S4) and the slip (S6) end on a centred push
small enough to keep the brief panel's edge in frame; the map shots (S5 second half, S7 first half) start just
right of the brief panel so it is out of frame instead of cut in half; the reticle centres on the marker's ring
(half a label height left of its label). This re-shoot was checked on stills taken from the rendered file, not by a
second independent reviewer.

**Deliberate departures from the skill's rules** (aesthetic-rules says to record them):
- shot-transitions card not used: 8-frame cross-fades instead of white flashes or whip pans (calm demo, true-black UI).
- scan-bracket-sweep: 3 passes instead of 5 (shot is 3.2 s; per-pass time kept at about 0.8 s).
- brand-ink-open: the tagline is typed at 0.55 f/char (card: 0.7 f/char) so the complete lockup holds 1.2 s (36 f).
- Q8 (outro as the energy peak, "group photo") not followed: a calm close with the address is what the rules of the
  hackathon ask for.
- The reticle in S7 is the only overshoot (the card marks it as essential).

## Sound

The music file is not in git (the Mixkit licence does not allow passing the file on). Before rendering, fetch it:
`curl -L -o public/audio/bgm-cat-walk.mp3 https://assets.mixkit.co/music/371/371.mp3`. Without it, render the
no-music version (`npm run render:nomusic`).

- **Music**: "Cat Walk" by Arulo, Mixkit (https://assets.mixkit.co/music/371/371.mp3), bundled with video-shotcraft
  (`assets/audio/bgm/cat-walk.mp3`, listed in its `assets/audio/ATTRIBUTION.md`); the copy here
  (`public/audio/bgm-cat-walk.mp3`, SHA-256 `e241cba0…5aa489`) is byte-identical to the file Mixkit serves today.
  Played from 6.68 s into the track so its quiet intro sits under the title cards and its bass enters on the cut to
  the app (S4, 0:08.07). Volume 0.4, fade in 0.7 s, fade out over the last 1.5 s. Not auditioned by a person: chosen
  from the bundled list by measured energy (the skill's fifth track has no traceable source and was excluded).
- **Effects** (Freesound, CC0, MP3 previews; full records in `public/audio/sfx/audio-manifest.json` and
  `FREESOUND-CREDITS.md`): soft impact under the wordmark (S3), a light whoosh on the pull-back (S4) and, quieter, on
  the travel to the map (S5), a mechanical latch click when the reticle locks on the ridge (S7).
- **Sync**: SFX are pinned relative to `SHOTS` with `from = target peak frame − source peak − 1.28 f` (AAC priming,
  Remotion 4.0.484, AAC 48 kHz, MP4). Measured on 14 Nov 2026 on the rendered no-music file by locating each effect's 10 ms energy
  peak against its target frame: residuals 0.0, −0.5, −0.5, 0.0 frames (impact, two whooshes, click).
- **Levels**: with music −20.9 LUFS integrated, true peak −4.2 dBFS; without music −20.3 LUFS, −6.5 dBFS.

## Assets and licences

| Asset | Source | Licence |
|---|---|---|
| All pictures (`public/captures/*`, re-created by `npm run capture`) | Screenshots of the Earthrise app (http://localhost:5199 and its `validation.html`), headless Chrome on the GPU | The team's own work (Apache 2.0, see ../LICENSE); map data NASA LRO LOLA and JPL DE440 as credited in ../CREDITS.md |
| Archivo (variable) | `@fontsource-variable/archivo` | SIL Open Font License 1.1 |
| Source Serif 4 (variable, italic) | `@fontsource-variable/source-serif-4` | SIL Open Font License 1.1 |
| Music: "Cat Walk", Arulo | Mixkit, via video-shotcraft | Mixkit Stock Music Free License (free for commercial and non-commercial use, no attribution required) |
| `fs-728515.mp3` "Impact Hit at soft but big material", doudar41 | https://freesound.org/people/doudar41/sounds/728515/ | CC0 1.0 |
| `fs-701104.mp3` "Whoosh stereo light (transition)", xkeril | https://freesound.org/people/xkeril/sounds/701104/ | CC0 1.0 |
| `fs-815493.mp3` "Mechanical switch (latch) 02", xkeril | https://freesound.org/people/xkeril/sounds/815493/ | CC0 1.0 |
| Motion recipes and helper code (blur-slide, brand-ink-open, fui-hud-moves reticle-lock-on, scan-bracket-sweep, PageCam, easing helpers) | video-shotcraft by Vincentwei1021, https://github.com/Vincentwei1021/video-shotcraft | Apache 2.0 |

No AI-generated images, video, music or voices are used. No NASA logo, insignia or patch appears; "NASA" appears only
as words (the challenge's name and data sources).

Rendering engine: Remotion (https://remotion.dev), whose own licence makes it free for individuals and small teams
(companies above a size threshold need a paid licence). The workflow is the video-shotcraft skill by Vincentwei1021
(Apache 2.0).

## Project layout

- `scripts/capture.mjs` all footage (one script); `scripts/lib.mjs` Chrome helpers; `scripts/stills.mjs` QA stills
  into `out/qa/`; `scripts/probe.mjs` a one-off layout probe.
- `src/timeline.ts` the single source of timing, captions and title text; `src/Main.tsx` composition, SFX table, BGM;
  `src/shots/` the shots; `src/lib/` PageCam, caption band, blur-slide words, framing from boxes; `src/workbench.ts`
  manifest for the skill's workbench; `src/capture-layout.json` written by the capture script.
- `public/captures/` is git-ignored (about 410 MB); re-create it with `npm run capture`.


