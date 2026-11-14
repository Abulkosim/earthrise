# Project submission form

Draft texts for the Space Apps project page, one section per form field, in the
form's order. Paste the text under each heading. Notes for the team are in
square brackets and are not to be pasted.

## Project name

Earthrise

## High-level project summary

Earthrise is a web app that shows where a lander at the Moon's south pole would
have the Sun for power and the Earth for radio contact. Other tools answer this
for one point at a time. Earthrise answers for the whole map at once. On the
GPU it traces the terrain horizon in 360 directions from every point, using
NASA Goddard's track-adjusted LOLA elevation maps (down to 5 m) and JPL's DE440
ephemeris. Then it runs a whole
mission at every point: landing date, length of stay, solar array, battery,
Earth clearance, Deep Space Network contact, and the science team's need for
permanent shadow nearby. The map shows where the mission works. A landing
calendar shows how that changes when the date slips. When a launch slips, a
planner sees the new answer for the whole map in seconds.

## Link to project demo

TO ADD

## Link to final project

https://abulkosim.github.io/earthrise/

Source code: https://github.com/Abulkosim/earthrise

[Team: the repository is private for now and the site is not up yet. Host the
app on the team's server, put its address above, and make the repository
public before submitting.]

## Detailed project description

### What it does

You write a mission brief in plain sentences: landing date, length of stay,
solar array, mast height, loads, battery, Earth clearance, and whether a Deep
Space Network station must see the Moon. One more sentence is the science
team's: permanent shadow, where ice can last, within a set distance of the
landing point. Engineering wants light and contact, science wants the dark
nearby, and the same map answers both. This is the coordination between
science and engineering teams that the challenge asks for.

Earthrise colours the south polar map by the answer: where the mission works,
sunlight, longest dark, contact, longest silence, battery life, sunlight over
18.6 years and distance to permanent shadow.

A landing calendar under the map shows, for each landing date, how much ground
in view meets the brief. With the default lander (450 W array, 3000 Wh battery),
a 14-day stay landing on 3 November 2027 works on about 15% of the ground in
the default view. The catalogue's connecting-ridge point is about 64% sunlit
with 61% contact, but its longest dark stretch, 5 days 2 hours, is over the
brief's 72-hour limit. The Malapert Massif and Mons Mouton Plateau region
centres fail too: the power runs out. The share rises and falls with the
landing date, month by month.

Click any point, or find one of 45 sites (Apollo, robotic landings of several
countries, planned CLPS landings, Artemis III regions, three regions from
NASA Goddard's 5 m study of the connecting ridge) or type coordinates. You get
the lander's-eye panorama with the Sun and Earth against the real horizon, the
time to sunset and Earthset, the distance to permanent shadow, and a verdict.
One tile answers "If the landing misses": the share of ground within 500 m
that still meets the brief. IM-2 came down 250 m from its target. Up to six
sites share one timeline of Sun, Earth contact, battery and landing windows.
Press play to watch the light move, or use the "Show me" menu: a lunar month
of light, a landing date that slips, the view from the ridge, and the best
place to land in view, the point with the most workable ground around it. The
map zooms in to 1.5 m per pixel.

Five real landings can be replayed: Chandrayaan-3, SLIM, IM-1, IM-2 and Blue
Ghost Mission 1. Each says what happened and what the model shows for the Sun
and the Earth at that site and date. SLIM came to rest with its cells facing
west; the brief can describe a fixed array like that, and the replay uses it.

That covers every objective of the challenge: site choice and comparison,
dates, Sun and Earth against the horizon, power and contact metrics, science
and engineering needs together, several views, time animation, and plain
language.

### How it works

A WebGL 2 engine walks the terrain in 360 directions from every pixel of the
view and stores the horizon: 266,256 points in about 3.6 seconds on an Apple M2
Pro. It nests four grids: a fine focus around the view (5 to 80 m), a 20 or
40 m ring around a 5 or 10 m focus, 160 m and 960 m. The terrain is NASA
Goddard's track-adjusted LOLA maps: 5 m from 87 S, 20 m to 80 S, 240 m to
60 S. While time plays, the light comes from the cached horizons, so playback
and panning stay smooth. Sun and Earth positions come from SPICE (JPL DE440, MOON_ME
frame, light-time and aberration), hourly from 2023 to 2045. A 14-day stay at
every point then takes a fraction of a second. An
18.6-year run in 12-hour steps, about 2 s, finds the ground that never sees the
Sun and each point's distance to it.

We checked it. Positions agree with JPL Horizons to 0.00003 degrees. Sun
elevation at the six Apollo landings matches the Apollo Lunar Surface Journal
within 0.15 degrees. The Earth's eclipse of the Sun seen by Blue Ghost in March
2025 is reproduced. We reproduced Table 2 of Barker et al. 2021: seven regions
on the connecting ridge, 2,114 pixels at 5 m, two years hourly, at 1 m and 5 m
height. All 42 values fall on the right side of the paper's bounds; at 5 m
height our average sunlight is 0.2 to 2.2 points above their 1st percentile.
On the way we found why the older PDS elevation mosaics are wrong for this:
errors along the laser tracks cast false shadows under a grazing Sun, and on
the connecting ridge they cut the longest lit period from about 220 days to
about 25. So we moved to Goddard's adjusted maps. The GPU engine matches our
Python reference model at 24 points: horizons within 0.008 degrees on average,
shares within 0.2 percentage points, the same in Safari as in Chrome. Against
NASA Goddard's 18.6-year Sun visibility map, correlation is 0.942. The app has its own
validation page, "How we know it is right", with every check, its sources, and
buttons that rerun the GPU checks in the visitor's browser, including a
comparison of permanent shadow with Goddard's map. An independent review of
the engine code was part of the process, and its findings were fixed.

Limits: the terrain (5 m near the pole, 20 m to 80 S) misses boulders and
small craters; no thermal model; the
antenna has no pointing limits; the battery model is simple.

### What benefits it has

After a slip, a planner sees which sites and dates still work, at once.
Geometry decides whether a lander lives. IM-2 Athena landed 250 m from its
target in March 2025 and its mission ended a day later; IM-1 and SLIM also lost
power or contact to geometry. Students see why the pole is hard, on the real
terrain.

### What we hope to achieve

A tool a mission team opens when a date moves, and a teacher opens in class.
It runs in a browser, with no install and no login.

### Tools and languages

TypeScript, React 19 and Vite for the app, with shadcn/ui on Radix, Tailwind 4,
Motion and lucide icons; GLSL on WebGL 2 for the engine;
Python with NumPy, SpiceyPy and pytest for the reference model and data build.
To be hosted on the team's own server.

## Use of Super Intelligence (SI)

Yes. The team chose the challenge, set the direction and made the decisions.
Claude, by Anthropic, used through Claude Code, wrote most of the code, tests
and documentation under the team's direction, and did the literature and data
survey. Every source file written with AI help says so in its first line, and
the README states it. The numbers we quote come from tests and comparisons
anyone can rerun from the repository. We used no AI-generated images, video or
audio.

## NASA data

- NASA Goddard's track-adjusted LOLA elevation maps from the Lunar
  Reconnaissance Orbiter: LDEM_87S_5MPP (5 m, 87 to 90 S; Barker et al. 2021,
  PGDA product 81, from the USGS copy), LDEM_80S_20MPP_ADJ (20 m, to 80 S) and
  LDEM_60S_240MPP_ADJ (240 m, to 60 S; Barker et al. 2023, PGDA product 90).
  The terrain for every horizon.
- NASA Goddard's Site01 region outlines on the connecting ridge: used for the
  check against Barker et al. 2021, Table 2.
- The older LOLA polar mosaics from the PDS Geosciences Node: used only for
  comparison.
- SPICE kernels from NASA's Navigation and Ancillary Information Facility
  (NAIF): naif0012.tls (leap seconds), pck00011.tpc (planetary constants),
  de440s.bsp (JPL DE440 ephemeris), moon_pa_de440_200625.bpc and
  moon_de440_250416.tf (lunar orientation and the MOON_ME frame). These give
  the Sun and Earth position for every hour from 2023 to 2045, and when Deep
  Space Network stations can see the Moon.
- NASA Goddard average Sun and Earth visibility maps, AVGVISIB_85S_060M_201608
  (imbrium.mit.edu/EXTRAS/ILLUMINATION, method of Mazarico et al. 2011): used
  to check our maps.
- JPL Horizons API: used only in tests, to check our Sun and Earth positions.
- NASA Moon Trek map layers (landing sites, CLPS sites, Artemis III regions,
  LOLA maximum illumination sites): coordinates for most entries in the site
  list, cited per site.
- Apollo Lunar Surface Journal (NASA History), Sun elevation table compiled by
  J. Scotti: used to check Sun elevation at the six Apollo landings.

Exact URLs and file sizes are in pipeline/scripts/fetch_data.py.

## Space agency partner data and other references

We compute on no partner-agency dataset. The site list includes landings and
planned landings of ISRO (Chandrayaan-3, Vikram), JAXA (SLIM), CNSA (Chang'e
3 to 7), Roscosmos, ispace, SpaceIL and others, from public coordinates. Each
entry cites its source: NASA Moon Trek, LROC (Arizona State University) or the
IAU/USGS Gazetteer of Planetary Nomenclature.

Other references:

- IAU/USGS Gazetteer of Planetary Nomenclature: feature names on the map.
- Mazarico et al. 2011, Icarus 211:1066 (illumination of the lunar poles from
  LOLA topography); Barker et al. 2021, Planetary and Space Science 203:105119
  (LOLA south pole elevation maps and their effect on illumination; we reproduce
  its Table 2); Barker et al. 2023, Planetary Science Journal 4:183 (the 20 m
  and 240 m adjusted maps); Gläser et
  al. 2014, Icarus 243:78 (illumination at the lunar south pole from LOLA
  elevation models).
- Libraries: React, Vite, TypeScript, Tailwind CSS, shadcn/ui, Radix, Motion,
  lucide, cmdk, sonner, react-day-picker, SpiceyPy (wrapping NAIF's CSPICE),
  NumPy, pytest, Vitest, puppeteer-core, oxlint.
- Fonts: Archivo and Source Serif 4 (SIL Open Font License), through
  Fontsource.
- Claude by Anthropic, through Claude Code (see Use of SI).

The full list, with links and licences, is in CREDITS.md in the repository.
