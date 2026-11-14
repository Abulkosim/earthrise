# Journal

A running record of what was done, what was found and what is still open.
Times are Tashkent time (UTC+5). Newest entry last.

## Sat 14 Nov 2026

### 14:36 Repo created

Private repo `Abulkosim/earthrise`. Work lands through branches and pull requests.

### 14:45 Challenge and rules read

Challenge: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).
The ask: let planners, educators and the public compare landing sites and dates
fast, by showing the Sun and Earth against the local horizon, so they can judge
solar power and direct-to-Earth contact. Focus on the south pole.

Rules that can sink us:

- Demo is a video of 30 s or less, or at most 7 slides. Over the limit means no global judging.
- Everything in English. All links must open without a login.
- At least one NASA dataset must be used, and every outside resource cited.
- AI use must be disclosed. AI images and video need a visible watermark.
  AI-written code and data must be acknowledged in text and metadata.
- The rules say AI should not be used to come up with the idea. The team lead
  directs the work and makes the calls.
- No work before Sat 14 Nov 09:00 local. The repo was created after that.

### 14:55 Deadline found

Global deadline is Sun 15 Nov 23:59. The Tashkent event judges earlier:
preliminary judging Sun 14:00 to 16:00, final judging 17:00 to 18:00, in person.
The product and the pitch must be ready by Sun 14:00.

Team Earthrise: Maria Dorofeeva (owner), Abulkosim, Vladislav Kasev.

### 15:00 Core math checked

- Sun and Earth angles from a lunar site, computed with SPICE (DE440, `MOON_ME`
  frame), match JPL Horizons to 0.00003 degrees.
- A terrain horizon from the LOLA elevation maps takes a fraction of a second
  per site.

### 15:05 Research in

- Judging: impact, creativity, validity, relevance, presentation, each 1 to 5.
  Eight of ten 2025 global winners shipped a live web app.
- Competition: about 1,050 teams picked this challenge and about 150 already
  have public repos. The best already compute terrain horizons, Sun disk
  fraction, DSN contact, battery state and site or date comparison. A feature
  list will not win. One idea has to carry the project.
- What nobody does: they all answer for one point at a time.

### 15:12 Direction chosen

The whole pole at once. Compute sunlight, Earth contact and power for every
point of the map on the GPU, so a planner sees where a mission works and how
that moves when the landing date slips. Validation against outside sources is
part of the product, not an afterthought.

### 15:18 Reference model (PR #3)

Python: SPICE ephemeris, LOLA horizon walk, disk fraction, DSN, eclipses.
19 tests against JPL Horizons, the six Apollo landings and the March 2025
eclipse. This is the ground truth for everything else.

### 15:29 GPU engine works (PR #4)

For every pixel of the view it traces the horizon in 360 directions, then runs
a mission window from the cached horizons.

- Against the reference at 24 points: horizon within 0.008 degrees on average,
  sunlit and contact shares within 0.2 points.
- Against NASA Goddard's published 18.6-year maps, 262,144 points: correlation
  0.94 for the Sun and 0.98 for the Earth.
- On an M2 Pro: horizons for about 265,000 points in 3 to 5 s, a 14-day stay
  for all of them in 0.02 s.

Two bugs found by the checks and fixed: a tiling bug that skipped rows, and
`gl.finish` not waiting in Chrome.

### 15:50 First complete interface (PR #5)

Map, mission brief written as sentences, site panel with a lander's-eye
panorama, timeline with Sun, Earth, battery and landing-window lanes, and a
landing calendar. Catalogue of 42 sites with a source for each.

Found while testing: 365 landing dates for the whole view evaluate in a few
seconds. In the default view a landing on 3 Nov 2027 works on about 5% of the
ground, two weeks later nowhere, a month later again. That became the landing
calendar.

Another bug found by cross-checking with the reference: horizon probes for
several sites ran at once and corrupted each other. Fixed. The three default
sites now match the reference to the percent.

### 16:00 Public and deploying

The repo is public. The app deploys to GitHub Pages on every push to main:
<https://abulkosim.github.io/earthrise/>. The 390 MB of prepared NASA data is
served from `Abulkosim/earthrise-data`.

Data downloaded so far (all NASA, logged in `pipeline/scripts/fetch_data.py`):
SPICE kernels 46 MB, LOLA elevation maps 2.5 GB, Goddard visibility maps 102 MB.

### 16:10 Repositories private again

The team decided to keep both repositories private until close to the
deadline. GitHub's free plan takes Pages down for private repositories, so the
live site is off. The team lead will host it on a server with its own domain;
`deploy/` has the script and the web server config for that. The Pages
workflow is disabled until then.

### 16:20 Build-out by six parallel agents (PR #9)

- Validation page, "How we know it is right", with two checks the reader can
  rerun on their own GPU.
- Replays of five real landings (Chandrayaan-3, SLIM, IM-1, IM-2, Blue Ghost 1)
  with sourced facts next to the model's numbers. The texts say where the model
  cannot explain an outcome: IM-2 died in a 20 m crater, below what a 20 m map
  can see.
- 26 unit tests of the app's site model against values computed from SPICE.
- README, CREDITS, method description, drafts of the submission texts.
- An independent review of the engine and interface found 12 defects, 4 of
  them serious (passes sharing one framebuffer, a background sweep cancelling
  the map's own evaluation, a bad fallback where fine tiles are missing, a
  date field that sent year 0002 to the model). All fixed, each reproduced
  first. The 24-point check gives the same 0.0085 degrees after the fixes.

### 16:25 Science meets engineering (PR #10)

The challenge text speaks of coordination between science and engineering
teams. Science wants ground that never sees the Sun, where ice can last.
Engineering wants light. The engine now runs 18.6 years for every point in
view (about 2 s), finds permanent shadow, and measures every point's distance
to it. The brief can ask for permanent shadow within N km. Two new layers show
the long run.

Against NASA Goddard's map: of the ground they call permanently shadowed, 93%
is in ours; of ours, 98% is in theirs.

Default lander retuned to 450 W and 3 kWh. In the default view a landing on
3 Nov 2027 now works on about 13% of the ground; the connecting ridge passes,
the Malapert Massif and Mons Mouton Plateau region centres fail.

### 16:30 Share links, demonstrations, end-to-end check (PRs #8, #11, #12)

- "Show me" buttons: a lunar month of light, a landing date that slips, the
  view from the ridge.
- The whole view lives in the address, with a copy-link button.
- `pnpm e2e` drives the app in headless Chrome and compares what the screen
  says with the reference. Nine checks pass. It also takes the screenshots for
  the slides.

### In progress

- The seven-slide deck, built from real screenshots.
- The 30 s video.

### Open

- Hosting: needs the server and domain from the team lead. Then one command:
  `deploy/deploy.sh user@host`.
- The repositories go public before submission.
- The submission form on spaceappschallenge.org has to be filled in and
  submitted by a team member; the tool cannot log in. The texts are ready.

### 16:57 The deck (PR #15)

Seven slides, built by `deck.mjs` from screenshots of the running app, with
the numbers read off the screen. Printed to a PDF at 1920x1080. Pitch notes
for the presenters: the talk, the demo click by click, the numbers and the
likely questions. The last slide keeps a placeholder for the live address.

### 16:58 Fixed solar array and SLIM (PR #16)

IM-1, IM-2 and SLIM all ended with their arrays pointing the wrong way, and
the model assumed an array that tracks the Sun. The brief can now say the
array is fixed, facing an azimuth at a tilt. Output is the visible Sun
fraction times the cosine of the angle to the Sun, the same formula on the GPU
and in the site model. SLIM, replayed with its cells facing west: no power at
landing on 19 Jan 2024, first light on 23 Jan, JAXA regained contact on 28
Jan. 30 unit tests.

### 17:53 Safari (PR #17)

Safari cannot be scripted without changing its settings. With `?report=<url>`
the check page posts its result to a listener, so any browser can be checked
by opening a link. Safari 26.6 on an Apple GPU passes the 24-point check with
the same numbers as Chrome.

### 17:59 Playback fix (PR #18)

Reported by a teammate on an M2: with time playing, the map stuttered, every
animation on the machine went jerky, and the map could hardly be dragged. The
light picture walked the terrain for every screen pixel on every frame. Now
the walk runs only when the view and time are at rest, for at most about 1.6
million pixels. While time plays, the light comes from the cached horizons;
while the map moves, the last picture is reused and refreshed coarsely. No
heavy frame is issued before the GPU has finished the last one. Measured on a
4484x2014 canvas: 60 frames per second while playing and panning.

### 18:10 Terrain from NASA Goddard's adjusted maps

The PDS polar mosaics carry errors along the laser tracks: metre-scale ridges
that cast false shadows when the Sun grazes the ground. Checked on the
connecting ridge against Barker et al. 2021, Table 2: on the PDS 5 m mosaic
the longest lit period comes out near 25 days, on Goddard's adjusted map near
220, as published.

- The engine and the reference model now run on Goddard's track-adjusted maps:
  5 m to 87 S (from the USGS copy), 20 m to 80 S, 240 m to 60 S.
  `fetch_parallel.py` gets them from Goddard's slow server over many
  connections; `convert_adj.py` decodes the GeoTIFFs.
- Four nested grids: a 5 to 80 m focus, a 20 or 40 m ring around a 5 or 10 m
  focus, 160 m, 960 m.
- Tiles are int32 centimetres with a plane predictor. The built data is
  2.4 GB.
- Barker check, `verify.html?mode=barker`: 2,114 pixels at 5 m, hourly for
  two years, at 1 m and 5 m height. All 42 values fall on the right side of
  the paper's bounds. At 5 m height our average sunlight is 0.2 to 2.2 points
  above their 1st percentile, longest lit period 142 to 233 days against their
  119 to 231, longest shadow 3.9 to 6.9 days against 4.0 to 8.4.
- 24-point check on the new terrain: horizons 0.008 degrees apart on average,
  0.16 at most; sunlit and contact shares within 0.2 points.

### 18:46 Interface rebuild (PR #19)

The team lead found the first interface looked dated. Rebuilt on shadcn/ui
(Radix), Tailwind 4 and Motion. The map fills the screen; glass panels float
on it: a header with the layer dock, "Show me" and "Find a site" (Cmd K); a
left panel with tabs Mission and Real landings; a site sheet with panorama,
stat tiles and verdict; a timeline dock. Gold still means the Sun and blue the
Earth. Engine, site model and behaviour unchanged; the hooks the end-to-end
check and the deck use are kept. Also fixed: the field was often cut to 20,000
to 100,000 points on a cold start. A fresh load now ends at 266,256 points in
3.6 s on an M2 Pro.

### 19:02 Landing odds, best place to land, 5 m zoom

- Site sheet tile "If the landing misses": share of ground within 500 m that
  meets the brief. IM-2 came down 250 m from its target.
- "The best place to land" in Show me: the point in view with the most
  workable ground around it.
- Zoom reaches 1.5 m per pixel, which loads the 5 m terrain. The live 24-point
  check views each point at 5 m per pixel.
- Three of Barker's 5 m regions are in the catalogue (45 sites).
- With the new terrain the default view and brief (landing 3 Nov 2027, 14
  days) meet the brief on about 15% of the ground. The catalogue's
  connecting-ridge point reads about 64% sunlit, 5 d 2 h longest dark, 61%
  contact: it now fails the 72 h dark limit. Barker's regions, 100 to 200 m
  away, read 75% sunlit and more.
- Docs updated to match: README, CREDITS, method, submission form, pitch
  notes, deploy notes.
- Open: the end-to-end check still expects the old site numbers for the
  three compared sites and fails those three checks; the other six pass.
