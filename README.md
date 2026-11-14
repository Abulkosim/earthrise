# Earthrise

Earthrise shows where at the Moon's south pole a lander gets sunlight and a line to Earth, for every point on the map at once. Other tools answer for one point at a time. Earthrise traces the real terrain horizon from about a quarter of a million points in a few seconds. Then it runs your whole mission (landing date, length of stay, solar array, loads, battery, contact needs, distance to permanent shadow) at every one of those points in a fraction of a second. It is for mission planners choosing a landing site and a date, and for teachers and the public who want to see why the south pole is so hard. Built by team Earthrise (Tashkent) for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/), challenge "Lunar Landing Site Navigator".

## Try it

- The app: LIVE URL TO ADD (the team will host it on its own server; until then, run it yourself as below)
- Source: https://github.com/Abulkosim/earthrise (private for now)

The app links to its validation page, "How we know it is right". It needs a desktop browser with WebGL 2 and float textures. We test in Chrome.

## What you can do

- Write the brief: landing date, stay, solar array, loads, battery, Earth clearance and DSN contact, as sentences with editable numbers. One more sentence is for the science team: permanent shadow, where ice can last, within N km of the landing point.
- Compare sites: put up to six sites side by side on one timeline, with Sun, Earth contact, battery and landing windows for each.
- Compare dates: the landing calendar shows, for each landing day in a 100-day window, how much of the ground in view meets the brief. Drag the stay to see what a schedule slip does.
- See the Sun and the Earth against the local horizon: click any point for the lander's-eye panorama, with the real terrain skyline, the time to sunset and Earthset, and a verdict on the brief.
- Judge power, contact and science: map layers for sunlight, longest dark stretch, contact with Earth, longest silence, how long the battery lasts, sunlight over 18.6 years and distance to permanent shadow, and one layer that shows only the ground where the whole mission works.
- Watch it: "Show me" in the top bar plays a lunar month of light, a landing date that slips, or the view from the connecting ridge.
- Replay five real landings (Chandrayaan-3, SLIM, IM-1, IM-2, Blue Ghost Mission 1): what happened, and what the model says about the light and the Earth there.

With the default lander (450 W array, 200 W lit and 40 W dark load, 3000 Wh battery), a 14-day stay landing 3 Nov 2027 meets the brief on about 12% of the ground in the default view, around the connecting ridge and Shackleton. The ridge passes; the Malapert Massif and Mons Mouton Plateau region centres fail. The share of ground that works rises and falls with the landing date, month by month.

## How it works

Terrain comes from NASA's LOLA elevation maps of the south pole, at 20 m near the pole and coarser further out. Sun and Earth positions come from JPL's DE440 ephemeris through NASA's SPICE toolkit, in the same lunar frame as the maps, for every hour from 2023 to 2044. In the browser, a WebGL 2 shader walks outward from every pixel of the view in 360 directions, along the curved surface, and keeps the highest terrain angle in each direction. Those horizons are stored on the GPU in 10 bits per direction. A second shader then steps through the mission hour by hour for every pixel: how much of the Sun's disk clears the horizon, whether the Earth clears it and a Deep Space Network station can see the Moon, and what that does to the battery. The landing calendar runs the same stay from each day of the timeline in the background. Once per view, the engine also runs 18.6 years in 12 h steps for every pixel (about 2 s on an M2 Pro), marks the ground that never sees any part of the Sun as permanent shadow, and measures every pixel's distance to it with an exact distance transform. A clicked point gets a finer 720-direction horizon and a double-precision run on the CPU. The full method, with every constant, is in [docs/how-it-works.md](docs/how-it-works.md).

## How we know it is right

Every check compares against something outside this project, or against our own slow reference model in [pipeline/](pipeline/). An independent review of the engine code was also part of the process, and the defects it found were fixed; details are in the git history.

| What | Checked against | Result |
|---|---|---|
| Sun and Earth direction | JPL Horizons API, 3 lunar sites, 113 samples each over a lunar month in 2027 | Within 0.00003°. The CI test fails above 0.001°. |
| Sun elevation at the six Apollo landings | Apollo Lunar Surface Journal table (J. Scotti) | Within 0.15° |
| Earth eclipsing the Sun, 14 March 2025 | Blue Ghost's photographs of it | Reproduced: the Sun is fully covered |
| GPU horizons, 24 south-pole points | Python reference model | Mean difference 0.008°. Sunlit and contact shares over two lunar days within 0.2 points. |
| 18.6-year average Sun visibility, 262,144 points | NASA Goddard map AVGVISIB_85S_060M_201608 | Correlation 0.942, mean absolute difference 1.78 points, bias +0.48 |
| 18.6-year average Earth visibility, same points | NASA Goddard Earth visibility map | Correlation 0.975, mean absolute difference 1.32 points, bias +0.22 |
| App site panel, three sites, 14-day stay from 3 Nov 2027 | Python reference model | Same to the percent and the hour |

The Goddard maps use a 60 m elevation model from 2016; we use the 20 m one, so some difference is expected. The validation page also compares permanent shadow with Goddard's map, computed live in your browser only. On an Apple M2 Pro in Chrome, horizons for about 265,000 points take 3 to 5 s, a 14-day hourly stay for all of them takes 0.02 s, and 365 landing dates take a few seconds. The tests are in [pipeline/tests/](pipeline/tests/), the engine check is [app/verify.html](app/verify.html) with [app/src/verify.ts](app/src/verify.ts).

## Run it yourself

The data step downloads about 2.7 GB from NASA servers and writes about 450 MB of browser data to `app/public/data` (not in git). The source files go to `../earthrise-data` next to the repo, or to the folder in `EARTHRISE_DATA`.

```sh
cd pipeline
python3 -m venv .venv && source .venv/bin/activate   # Python 3.11 or newer
pip install -e ".[dev]"
python scripts/fetch_data.py                          # SPICE kernels, LOLA maps, Goddard maps
python scripts/build_web_data.py dem ephem validation # grids, tiles, hourly ephemeris table
python scripts/make_fixtures.py                       # reference answers for app/verify.html
pytest                                                # the Horizons test needs internet

cd ../app
pnpm install
pnpm dev
```

## Data and credits

The terrain is NASA LRO LOLA data, the ephemeris is JPL DE440 through NASA NAIF's SPICE, and the validation maps are from NASA Goddard. Every dataset, paper, library and font, with its licence, is in [CREDITS.md](CREDITS.md). This project is not endorsed by NASA, and it uses no NASA logo.

## Use of AI

The team chose the challenge, set the goal and the direction, and made the decisions. Claude, an AI model by Anthropic, used through Claude Code, wrote most of the code, tests and documentation under the team's direction, and did the literature and data survey. Source files carry a one-line note at the top that says so ("Written with AI assistance (Claude); see the README."), and this statement covers every file in the repository, with or without the note. The project contains no AI-generated images, video or audio. The numbers it shows are computed from NASA data and checked against sources outside the project, listed on the app's validation page ([app/src/validation.ts](app/src/validation.ts)) and in the table above.

## Limits

- The 20 m terrain cannot see boulders or craters smaller than a few tens of metres.
- No thermal model. The battery model is a simple energy balance.
- The solar array either tracks the Sun or is fixed at an azimuth and tilt you give. The antenna has no pointing limits. Light reflected from the terrain is ignored.
- DSN visibility uses the IAU Earth rotation model and a 10° elevation mask at three complexes.
- The map's horizon cache stores each angle in 10 bits: steps of 0.02° near the pole, coarser where the Sun and Earth can stand higher. The site panel uses full precision.
- Sites north of 60° S have no terrain in the app and use a smooth-sphere horizon. The app says so.
- Permanent shadow is found in 12 h steps on the map's own grid, so shadow smaller than one cell can be missed. The distance to it counts only shadow inside the view.
- Ephemeris coverage runs from 2023 to 2044.

## Team

Team Earthrise, Tashkent: Maria Dorofeeva, Abulkosim, Vladislav Kasev.

## Licence

Apache 2.0. See [LICENSE](LICENSE).
