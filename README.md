# Earthrise

Earthrise shows where at the Moon's south pole a lander gets sunlight and a line to Earth, for every point on the map at once. Other tools answer for one point at a time. Earthrise traces the real terrain horizon from about a quarter of a million points in a few seconds. Then it runs your whole mission (landing date, length of stay, solar array, loads, battery, contact needs, distance to permanent shadow) at every one of those points in a fraction of a second. It is for mission planners choosing a landing site and a date, and for teachers and the public who want to see why the south pole is so hard. Built by team Earthrise (Tashkent) for the [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/), challenge "Lunar Landing Site Navigator".

## Try it

- The app: LIVE URL TO ADD (the team will host it on its own server; until then, run it yourself as below)
- Source: https://github.com/Abulkosim/earthrise (private for now)

The app links to its validation page, "How we know it is right". It needs a browser with WebGL 2 and float textures. We test in Chrome and Safari.

## What you can do

The map fills the screen. Panels float on it: a header, the mission on the left, the site on the right, the timeline at the bottom.

- Write the brief (left panel, tab "Mission"): landing date, stay, solar array (tracking, or fixed at a facing and a tilt), loads, battery, Earth clearance and DSN contact, as sentences. Each value is a chip; click it to change it. One more sentence is for the science team: permanent shadow, where ice can last, within N km of the landing point.
- Choose what the map shows from the layer dock in the header: light at this moment, where the mission works, sunlight over the stay, longest dark stretch, contact with Earth, longest silence, how long the power lasts, sunlight over 18.6 years, distance to permanent shadow.
- Find a site: "Find a site" in the header (Cmd K, or Ctrl K) searches 45 sites and also takes a latitude and longitude. Or click any point on the map.
- Read the site sheet: the lander's-eye panorama with the real terrain skyline, the Sun and the Earth, tiles for sunlight, longest dark, contact, longest silence, power and permanent shadow, and a verdict on the brief. The tile "If the landing misses" gives the share of ground within 500 m that meets the brief: landers do not come down on the exact point they aim for.
- Compare dates: the landing calendar in the timeline dock shows, for each landing day in a 100-day window, how much of the ground in view meets the brief. Up to six sites share the timeline, with Sun, contact, battery and landing windows for each.
- Watch it: the "Show me" menu plays a lunar month of light, a landing date that slips, the view from the connecting ridge, or jumps to the best place to land in view (the point with the most workable ground within 500 m).
- Zoom in to 1.5 m per pixel. Near the pole this loads the 5 m terrain.
- Replay five real landings (tab "Real landings": Chandrayaan-3, SLIM, IM-1, IM-2, Blue Ghost Mission 1): what happened, and what the model says about the light and the Earth there. The SLIM replay sets its west-facing fixed array.

With the default lander (450 W array, 200 W lit and 40 W dark load, 3000 Wh battery), a 14-day stay landing 3 Nov 2027 meets the brief on about 15% of the ground in the default view. The catalogue's connecting-ridge point reads about 64% sunlit, 61% contact and 5 d 2 h longest dark, over the brief's 72 h limit. The Malapert Massif and Mons Mouton Plateau region centres fail too: their power runs out. The share of ground that works rises and falls with the landing date, month by month.

## How it works

Terrain comes from NASA Goddard's track-adjusted LOLA elevation maps of the south pole: 5 m from 87° S to the pole, 20 m to 80° S, 240 m to 60° S. The engine nests four grids: a fine focus around the view (5 to 80 m), a 20 or 40 m ring around a 5 or 10 m focus, 160 m and 960 m, each used only as far out as its detail matters. Sun and Earth positions come from JPL's DE440 ephemeris through NASA's SPICE toolkit, in the same lunar frame as the maps, for every hour from 2023 to 2044. In the browser, a WebGL 2 shader walks outward from every pixel of the view in 360 directions, along the curved surface, and keeps the highest terrain angle in each direction. Those horizons are stored on the GPU in 10 bits per direction. While time plays, the light picture comes from these cached horizons, one lookup per pixel, so playback and panning do not overload the GPU. A second shader then steps through the mission hour by hour for every pixel: how much of the Sun's disk clears the horizon, whether the Earth clears it and a Deep Space Network station can see the Moon, and what that does to the battery. The landing calendar runs the same stay from each day of the timeline in the background. Once per view, the engine also runs 18.6 years in 12 h steps for every pixel (about 2 s on an M2 Pro), marks the ground that never sees any part of the Sun as permanent shadow, and measures every pixel's distance to it with an exact distance transform. A clicked point gets a finer 720-direction horizon and a double-precision run on the CPU. Landing odds and the best place to land are read from the last map evaluation. The full method, with every constant, is in [docs/how-it-works.md](docs/how-it-works.md).

## How we know it is right

Every check compares against something outside this project, or against our own slow reference model in [pipeline/](pipeline/). An independent review of the engine code was also part of the process, and the defects it found were fixed; details are in the git history.

| What | Checked against | Result |
|---|---|---|
| Sun and Earth direction | JPL Horizons API, 3 lunar sites, 113 samples each | Within 0.00003°. The CI test fails above 0.001°. |
| Sun elevation at the six Apollo landings | Apollo Lunar Surface Journal (J. Scotti) | Within 0.15° |
| Earth eclipsing the Sun, 14 March 2025 | Blue Ghost's photographs | Reproduced: the Sun is fully covered |
| Sunlight on the connecting ridge, 2024 and 2025 | Barker et al. 2021, Table 2: 7 regions, 2,114 pixels at 5 m, at 1 m and 5 m height | All 42 values on the right side of the paper's bounds |
| GPU horizons, 24 south-pole points | Python reference model | Mean difference 0.008°, at most 0.16°. Sunlit and contact shares within 0.2 points. |
| 18.6-year average Sun visibility, 262,144 points | NASA Goddard map AVGVISIB_85S_060M_201608 | Correlation 0.942 |

The Barker check: at 5 m height our average illumination is 0.2 to 2.2 points above their 1st percentile (for example 90.2 against 89.3, 87.7 against 87.4, 83.0 against 82.8). Our longest lit period is 142 to 233 days against their 119 to 231, and our longest shadow 3.9 to 6.9 days against their 4.0 to 8.4. The paper gives percentiles over 100 error clones of the terrain; one run on the nominal terrain should sit at or above the 1st percentile of light and at or below the 99th of shadow, and it does. Run it at `app/verify.html?mode=barker`.

What it found: the older PDS mosaics carry errors along the laser tracks, metre-scale ridges that cast shadows that are not there when the Sun grazes the ground. On the connecting ridge they cut the longest lit period from about 220 days to about 25. That is why Earthrise now runs on Goddard's adjusted maps (Barker et al. 2021 and 2023).

The 24-point check views each point at 5 m per pixel, so the map reads the same terrain as the reference. Safari 26.6 passes it with the same numbers as Chrome. The Goddard maps use a 60 m elevation model from 2016, so some difference is expected. On an Apple M2 Pro in Chrome, horizons for 266,256 points take about 3.6 s, and a 14-day stay for all of them a fraction of a second. The tests are in [pipeline/tests/](pipeline/tests/); the engine checks are [app/verify.html](app/verify.html) with [app/src/verify.ts](app/src/verify.ts) and [app/src/checks.ts](app/src/checks.ts).

## Run it yourself

The data step downloads about 7 GB from NASA servers and writes 2.4 GB of browser data to `app/public/data` (not in git). The source files go to `../earthrise-data` next to the repo, or to the folder in `EARTHRISE_DATA`.

```sh
cd pipeline
python3 -m venv .venv && source .venv/bin/activate   # Python 3.11 or newer
pip install -e ".[dev]"
python scripts/fetch_data.py kernels adj validation   # SPICE kernels, adjusted LOLA maps, Goddard maps
# Goddard's server is slow (about 0.5 MB/s per connection). If the adj step crawls, fetch its
# two PGDA files over many connections instead; it resumes if interrupted:
python scripts/fetch_parallel.py https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_20MPP_ADJ.TIF ../../earthrise-data/adj/ldem_80s_20mpp_adj.tif
python scripts/fetch_parallel.py https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF ../../earthrise-data/adj/ldem_60s_240mpp_adj.tif
python scripts/convert_adj.py                         # GeoTIFF to raw float grids
python scripts/build_web_data.py dem ephem validation # grids, tiles, hourly ephemeris table
python scripts/make_fixtures.py                       # reference answers for app/verify.html (fixtures-v2.json)
# Barker check: unpack https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_ROIs.tgz into ../../earthrise-data/barker/
python scripts/make_barker_fixture.py                 # regions and Table 2 for verify.html?mode=barker
pytest                                                # the Horizons test needs internet

cd ../app
pnpm install
pnpm dev
```

`python scripts/fetch_data.py dem` fetches the older PDS mosaics, used only by scripts that compare against them.

## Stack

React 19, TypeScript and Vite. Interface on shadcn/ui components (Radix), styled with Tailwind 4, moved with Motion, icons from lucide. Engine in GLSL on WebGL 2. Reference model and data build in Python with NumPy and SpiceyPy. Tests with Vitest, pytest, and puppeteer-core driving headless Chrome.

## Data and credits

The terrain is NASA LRO LOLA data, as adjusted by NASA Goddard, the ephemeris is JPL DE440 through NASA NAIF's SPICE, and the validation maps are from NASA Goddard. Every dataset, paper, library and font, with its licence, is in [CREDITS.md](CREDITS.md). This project is not endorsed by NASA, and it uses no NASA logo.

## Use of AI

The team chose the challenge, set the goal and the direction, and made the decisions. Claude, an AI model by Anthropic, used through Claude Code, wrote most of the code, tests and documentation under the team's direction, and did the literature and data survey. Source files carry a one-line note at the top that says so ("Written with AI assistance (Claude); see the README."), and this statement covers every file in the repository, with or without the note. The project contains no AI-generated images, video or audio. The numbers it shows are computed from NASA data and checked against sources outside the project, listed on the app's validation page ([app/src/validation.ts](app/src/validation.ts)) and in the table above.

## Limits

- The terrain cannot see boulders or craters much smaller than its grid: 5 m from 87° S, 20 m to 80° S, coarser beyond. Zoomed out, the map uses coarser terrain, so a ridge point can read differently there than at 5 m per pixel.
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
