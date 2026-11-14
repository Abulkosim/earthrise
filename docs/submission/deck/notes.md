# Speaker notes

For the two presenters. One paragraph per slide, about 20 to 30 seconds each.
Before judging: put the live address on slide 7 (search `LIVE URL TO ADD` in
`index.html`), then rebuild from `app/` with `node scripts/deck.mjs --skip-shots`.

## 1. Earthrise

We are team Earthrise from Tashkent, and we took the Lunar Landing Site
Navigator challenge. Earthrise shows every landing site at the Moon's south
pole, every hour, on one map. What you see is the app itself: the ground as the
Sun lights it at one moment, with the connecting ridge and the rim of Shackleton
in the light.

## 2. A launch slips. Where do you land now?

At the south pole the Sun skims the horizon and the Earth can drop behind the
terrain, so a short move or a few days change everything. IM-2 Athena landed
250 metres from its target in March 2025 and its mission ended a day later;
IM-1 and SLIM also lost power or contact to geometry. This is the app replaying
Athena's landing hour on 6 March 2025 (the blue tint means the Earth is in view). The
app replays five real landings, this one included. And when a launch slips, a
planner has to find out again which sites still work.

## 3. Every point at once

Tools like Quickmap and JPL Horizons answer for one place at a time. Earthrise
walks the terrain in 360 directions from every point on the GPU, here 138,528
points in 6.8 seconds, and then runs a 14-day hourly stay for all of them in
0.04 seconds; the line above the map is the app's own status line. This is the
connecting ridge on NASA Goddard's 5 m terrain. So the map can show where a
mission works, not just what one point sees: bright ground meets the brief,
dark ground fails it.

## 4. Write the brief, read the map

The brief reads like a sentence: land on this date, stay this long, with this
array, these loads and this battery. One more sentence is the science team's:
permanent shadow, where ice can last, within so many kilometres. Engineering
and science read the same map. Click any point, or one of 45 known sites, and
you see the Sun and Earth over its real horizon and how long until each sets.
Up to six sites line up on one timeline of sunlight, Earth contact and battery.
Here region 4 of the connecting ridge: 100% sunlit, 77% contact, and it meets
the brief. Because a lander can miss its point, the sheet also says how much
ground within 500 metres meets the brief: 40%.

## 5. When the date slips

This is the question the challenge asks: what happens when the schedule moves.
The landing calendar runs the mission for every landing date and every point,
365 dates in a few seconds. In this view a landing on 3 November 2027 works on
15% of the ground; two weeks later, on 17 November, on none of it. In early
December it works again. "Show me" in the header can run a slipping landing date
as one animation.

## 6. Built on NASA data, checked against it

The terrain is NASA Goddard's track-adjusted LOLA maps (Barker et al.), 5 m
near the connecting ridge and 20 m out to 80 degrees south; the older mosaics
have errors along the laser tracks that cast false shadows under a low Sun. The
Sun and Earth come from JPL's DE440 ephemeris through NASA's SPICE toolkit. We
match JPL Horizons to 0.00003 degrees and Apollo Sun elevations to 0.15
degrees. The GPU engine matches our Python reference to 0.008 degrees of
horizon on average at 24 points. Against NASA Goddard's 18.6-year visibility
maps, 262,144 points, the correlation is 0.942 for the Sun and 0.976 for the
Earth. And we reproduce Table 2 of Barker et al. 2021 at 5 m: seven regions on
the connecting ridge, 2,114 pixels, two years hour by hour; all 42 values fall
on the right side of the paper's bounds. The two maps are ours, computed in the
browser, and Goddard's, on the same colour scale.

## 7. Try it

Earthrise runs in a browser, and the code and every check are open source under
Apache 2.0. Its limits are written in the app: the finest terrain is 5 m per
pixel, so no map sees boulders, and there is no thermal model. We want
to put it in front of mission planners and teachers next.
