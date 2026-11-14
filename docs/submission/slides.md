# Slide deck

Seven slides, the limit in the Project Submission Guide (title slide included).
On-slide text is at most 30 words per slide, title included. Screenshots are
taken from the app (live address: LIVE URL TO ADD; until it is up, a local
run) in the default view unless a slide says otherwise. Use the app's own dark background,
gold for the Sun and blue for the Earth; nothing else coloured. The deck is built by
`app/scripts/deck.mjs`, which captures every screenshot and every number the slides
quote from the running app.

---

## Slide 1. Earthrise

**On the slide**

> Earthrise
>
> Every landing site at the Moon's south pole, every hour, on one map.
>
> Team Earthrise, Tashkent: Maria Dorofeeva, Abulkosim, Vladislav Kasev
>
> NASA Space Apps 2026: Lunar Landing Site Navigator

**Visual.** Full-bleed screenshot of the map alone (panels hidden), layer
"Light now", framed on the connecting ridge and the rim of Shackleton, with the
shadowed plain to the west. Text sits on the dark area.

**Speaker notes.** We are team Earthrise from Tashkent, and we took the Lunar
Landing Site Navigator challenge. Earthrise shows every landing site at the
Moon's south pole, every hour, on one map.

---

## Slide 2. A launch slips. Where do you land now?

**On the slide**

> A launch slips. Where do you land now?
>
> Small moves in place or date decide power and radio. IM-2 Athena landed 250 m
> off target and lasted one day.

**Visual.** The map zoomed to the IM-2 Athena marker near Mons Mouton, layer
"Light now", playhead at 6 March 2025 18:00 UTC, the hour of its landing. The
blue tint is ground that can see the Earth. The marker's name label visible.

**Speaker notes.** At the south pole the Sun skims the horizon and the Earth
can drop behind the terrain, so a short move or a few days change everything.
IM-2 Athena landed 250 metres from its target in March 2025 and its mission
ended a day later; IM-1 and SLIM also lost power or contact to geometry. The
app replays five real landings, this one included. And when a launch slips, a
planner has to find out again which sites still work.

---

## Slide 3. Every point at once

**On the slide**

> Every point at once
>
> Other tools check one point at a time. Earthrise traces the horizon from
> every point in view, then runs your whole mission at each one.
>
> Horizons for 138,528 points traced in 6.8 s. Stay evaluated at every point in 0.04 s.
>
> Connecting ridge, 5 m terrain. Bright: meets the brief.

**Visual.** A close-up of the connecting ridge at 2.2 m per screen pixel, which
loads the 5 m terrain (link `#c=-11000,-12100,2.2&layer=needs`), layer "Mission
works", default brief. Bright ground meets the brief, dark ground fails it.
Above it, the app's own status line for that view, word for word.

**Speaker notes.** Tools like Quickmap and JPL Horizons answer for one place at
a time. Earthrise walks the terrain in 360 directions from every point on the
GPU, here 138,528 points in 6.8 seconds, and then runs a 14-day hourly stay for
all of them in 0.04 seconds. This view is the connecting ridge on NASA
Goddard's 5 m terrain. So the map can show where a mission works, not just
what one point sees.

---

## Slide 4. Write the brief, read the map

**On the slide**

> Write the brief, read the map
>
> Describe the lander in sentences. Click any point for its sky, battery and
> landing odds.

**Visual.** The whole app window at 1920x1080, playhead 9 Nov 2027 12:00 UTC.
Left: the "Mission" tab, the brief as sentences with chips. Centre: the map,
layer "Mission works", with the note "15% of the ground in view meets the brief
for a landing on 3 Nov 2027." Right: the site sheet for "Connecting ridge,
region 4": the lander's-eye panorama (gold Sun and blue Earth over the terrain
horizon), the tiles Sunlight 100%, Contact 77%, "If the landing misses" 40%,
and "Meets the brief". Bottom: the timeline dock with the landing calendar and
three rows: Connecting ridge, region 4; Malapert Massif; Mons Mouton Plateau.

**Speaker notes.** The brief reads like a sentence: land on this date, stay
this long, with this array, these loads and this battery. One more sentence is
the science team's: permanent shadow, where ice can last, within so many
kilometres. Engineering and science read the same map. Click any point, or
one of 45 known sites, and you see the Sun and Earth over its real horizon and
how long until each sets. Up to six sites line up on one timeline of sunlight,
Earth contact and battery. And because a lander can miss its point, the sheet
says how much ground within 500 metres also meets the brief: here 40%.

---

## Slide 5. When the date slips

**On the slide**

> When the date slips
>
> Land 3 Nov 2027: 15% of the ground in view works. Two weeks later, none of
> it does. A month later it works again.
>
> "15% of the ground in view meets the brief for a landing on 3 Nov 2027."
>
> "No ground in view meets the brief for a landing on 17 Nov 2027."

**Visual.** Top: the landing calendar strip close up, "Ground in view that
meets the brief, by landing date", with the 3 Nov 2027 bar highlighted and 3 Nov
and 17 Nov marked under it. Below: two captures of the map, default view, layer
"Mission works", for a landing on 3 Nov 2027 and on 17 Nov 2027, each with the
first sentence of the app's map note quoted word for word. "Show me" in the
header can run a slipping landing date as one animation.

**Speaker notes.** This is the question the challenge asks: what happens when
the schedule moves. The landing calendar runs the mission for every landing
date and every point, 365 dates in a few seconds. In this view a landing on 3
November 2027 works on 15% of the ground; two weeks later, on 17 November, on
none of it. In early December it works again.

---

## Slide 6. Built on NASA data, checked against it

**On the slide**

> Built on NASA data, checked against it
>
> LOLA terrain from NASA Goddard, JPL DE440.
>
> - JPL Horizons: 0.00003°
> - Apollo landings, Sun angles: within 0.15°
> - Engine against reference: 0.008° at 24 points
> - NASA Goddard 18.6-year maps, correlation: 0.942 Sun, 0.976 Earth
> - Barker et al. 2021, Table 2, at 5 m: all 42 values within the paper's bounds
>
> Sunlight over 18.6 years, same 41 km square. Ours. NASA Goddard.

**Visual.** The table on the left. On the right, the two maps from the
validation page's live Goddard check, run in the browser on the new terrain:
ours and NASA Goddard's average Sun visibility for the same 41 km square at the
pole, same colour scale.

**Speaker notes.** The terrain is NASA Goddard's track-adjusted LOLA maps
(Barker et al.), 5 m near the connecting ridge and 20 m out to 80 degrees
south; the older mosaics have errors along the laser tracks that cast false
shadows under a low Sun. The Sun and Earth come from JPL's DE440 ephemeris
through NASA's SPICE toolkit. We match JPL Horizons to 0.00003 degrees and
Apollo Sun elevations to 0.15 degrees. The GPU engine matches our Python
reference to 0.008 degrees of horizon on average at 24 points. Against NASA
Goddard's 18.6-year visibility maps, 262,144 points, the correlation is 0.942
for the Sun and 0.976 for the Earth. And we reproduce Table 2 of Barker et al.
2021 at 5 m: seven regions on the connecting ridge, 2,114 pixels, 2024 and 2025
hour by hour; all 42 values fall on the right side of the paper's bounds.

---

## Slide 7. Try it

**On the slide**

> Try it
>
> LIVE URL TO ADD
>
> Runs in a browser, no install, no login. Open source. For mission planners,
> teachers and anyone curious.

**Visual.** The live address as an obvious placeholder (LIVE URL TO ADD,
dashed box) beside a close crop of the panorama from slide 4: the terrain
horizon of Connecting ridge, region 4, with the gold Sun and the blue Earth
above it.

**Speaker notes.** Earthrise runs in a browser, and the code and every check
are open source under Apache 2.0. Its limits are written in the app: the
finest terrain is 5 m per pixel, so no map sees boulders, and there is no
thermal model. We want to put it in front of mission planners and teachers next.
