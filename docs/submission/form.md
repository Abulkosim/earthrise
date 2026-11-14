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
NASA's LOLA elevation data and JPL's DE440 ephemeris. Then it runs a whole
mission at every point: landing date, length of stay, solar array, battery,
Earth clearance and Deep Space Network contact. The map shows where the mission
works. A landing calendar shows how that changes when the date slips. When a
launch slips, a planner sees the new answer for the whole map in seconds.

## Link to project demo

TO ADD

## Link to final project

https://abulkosim.github.io/earthrise/

Source code: https://github.com/Abulkosim/earthrise

## Detailed project description

### What it does

You write a mission brief in plain sentences: landing date, length of stay,
solar array, mast height, loads, battery, Earth clearance, and whether a Deep
Space Network station must see the Moon. Earthrise colours the south polar map
by the answer: where the mission works, sunlight, longest dark, contact,
longest silence, battery life.

A landing calendar under the map shows, for each landing date, how much ground
in view meets the brief. In the default view a landing on 3 November 2027 works
on about 5% of the ground. Two weeks later it works nowhere. A month later it
works again.

Click any point, pick one of 42 sites (Apollo, robotic landings of several
countries, planned CLPS landings, Artemis III regions) or type coordinates. You
get the lander's-eye panorama with the Sun and Earth against the real horizon,
the time to sunset and Earthset, and a verdict. Up to six sites share one
timeline of Sun, Earth contact and battery. Press play to watch the light move.

That covers every objective of the challenge: site choice and comparison,
dates, Sun and Earth against the horizon, power and contact metrics, several
views, time animation, and plain language.

### How it works

A WebGL 2 engine walks the LOLA terrain in 360 directions from every pixel of
the view and stores the horizon: about 265,000 points in 3 to 5 seconds on an
Apple M2 Pro. Sun and Earth positions come from SPICE (JPL DE440, MOON_ME
frame, light-time and aberration), hourly from 2023 to 2045. A 14-day stay at
every point then takes 0.02 s; 365 landing dates take a few seconds.

We checked it. Positions agree with JPL Horizons to 0.00003 degrees. Sun
elevation at the six Apollo landings matches the Apollo Lunar Surface Journal
within 0.15 degrees. The Earth's eclipse of the Sun seen by Blue Ghost in March
2025 is reproduced. The GPU engine matches our Python reference model within
0.2 percentage points. Against NASA Goddard's 18.6-year visibility maps,
correlation is 0.942 for the Sun and 0.975 for the Earth. The app shows these
checks on its own page.

Limits: 20 m terrain misses boulders and small craters; no thermal model; the
lander is upright and its array tracks the Sun; the battery model is simple.

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

TypeScript, React 19, Vite and CSS for the app; GLSL on WebGL 2 for the engine;
Python with NumPy, SpiceyPy and pytest for the reference model and data build.
Hosted on GitHub Pages.

## Use of Super Intelligence (SI)

Yes. The team chose the challenge, set the direction and made the decisions.
Claude, by Anthropic, used through Claude Code, wrote most of the code, tests
and documentation under the team's direction, and did the literature and data
survey. Every source file written with AI help says so in its first line, and
the README states it. The numbers we quote come from tests and comparisons
anyone can rerun from the repository. We used no AI-generated images, video or
audio.

## NASA data

- LOLA gridded elevation from the Lunar Reconnaissance Orbiter (PDS Geosciences
  Node): LDEM_80S_20M, LDEM_80S_40M and LDEM_80S_80M for the terrain and
  horizons around the pole, LDEM_60S_240M for distant horizons and the map
  down to 60 S.
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
  (LOLA south pole elevation maps and their effect on illumination); Gläser et
  al. 2014, Icarus 243:78 (illumination at the lunar south pole from LOLA
  elevation models).
- Libraries: React, Vite, TypeScript, SpiceyPy (wrapping NAIF's CSPICE),
  NumPy, pytest, oxlint.
- Fonts: Archivo and Source Serif 4 (SIL Open Font License), through
  Fontsource.
- Claude by Anthropic, through Claude Code (see Use of SI).

The full list, with links and licences, is in CREDITS.md in the repository.
