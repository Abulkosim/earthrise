# Slide deck

Seven slides, the limit in the Project Submission Guide (title slide included).
On-slide text is at most 30 words per slide, title included. Screenshots are
taken from the live app at https://abulkosim.github.io/earthrise/ in the
default view unless a slide says otherwise. Use the app's own dark background,
gold for the Sun and blue for the Earth; nothing else coloured.

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

**Visual.** Full-bleed screenshot of the map alone (side panels hidden or
cropped), layer "Light at this moment", default view at the pole, at a
time when the rims are lit gold and the crater floors are black. Text sits on
the dark area.

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
"Light at this moment", playhead at the landing date of 6 March 2025, so the
shadowed ground around the marker shows. The marker's name label visible.

**Speaker notes.** At the south pole the Sun skims the horizon and the Earth
can drop behind the terrain, so a short move or a few days change everything.
IM-2 Athena landed 250 metres from its target in March 2025 and its mission
ended a day later; IM-1 and SLIM also lost power or contact to geometry. And
when a launch slips, a planner has to find out again which sites still work.

---

## Slide 3. Every point at once

**On the slide**

> Every point at once
>
> Other tools check one point at a time. Earthrise traces the horizon from
> 265,000 points, then runs your whole mission at every one.

**Visual.** The map with layer "Where the mission works", default brief. Bright
ground meets the brief, dark ground fails it. Keep the status line in the
header visible: "Horizons for ... points traced in ... s. Stay evaluated at
every point in 0.02 s." (use the numbers the screen shows).

**Speaker notes.** Tools like Quickmap and JPL Horizons answer for one place at
a time. Earthrise walks the terrain in 360 directions from every pixel on the
GPU, about 265,000 points in 3 to 5 seconds, and then runs a 14-day hourly stay
for all of them in 0.02 seconds. So the map can show where a mission works, not
just what one point sees.

---

## Slide 4. Write the brief, read the map

**On the slide**

> Write the brief, read the map
>
> Describe the lander in sentences. The map shows where it works. Click a point
> for its sky, sunset time and battery.

**Visual.** The whole app window. Left: the "Mission brief" written as
sentences with editable numbers. Centre: the map, layer "Where the mission
works". Right: the site panel for "Shackleton connecting ridge", with the
lander's-eye panorama (gold Sun and blue Earth against the terrain horizon)
and the lines "It sets in ...". Bottom: the timeline with three rows,
Shackleton connecting ridge, Malapert Massif and Mons Mouton Plateau.

**Speaker notes.** The brief reads like a sentence: land on this date, stay
this long, with this array, these loads and this battery. Click any point, or
one of 42 known sites, and you see the Sun and Earth over its real horizon and
how long until each sets. Up to six sites line up on one timeline of sunlight,
Earth contact and battery.

---

## Slide 5. When the date slips

**On the slide**

> When the date slips
>
> Land 3 Nov 2027: about 5% of the ground in view works. Two weeks later: none.
> A month later: it works again.

**Visual.** Top: the landing calendar strip close up, "Ground in view that
meets the brief, by landing date", with the 3 Nov 2027 bar highlighted. Below:
three small captures of the map, layer "Where the mission works", for landing
on 3 Nov 2027, two weeks later, and a month later, each with the map note "...
of the ground in view meets the brief for a landing on ..." or "No ground in
view meets the brief ...".

**Speaker notes.** This is the question the challenge asks: what happens when
the schedule moves. The landing calendar runs the mission for every landing
date and every point, 365 dates in a few seconds. In this view a landing on 3
November 2027 works on about 5% of the ground, two weeks later nowhere, and a
month later again.

[Team: check the three numbers on screen before capturing.]

---

## Slide 6. Built on NASA data, checked against it

**On the slide**

> Built on NASA data, checked against it
>
> LOLA terrain, JPL DE440. Agrees with JPL Horizons to 0.00003°, Apollo Sun
> angles to 0.15°, Goddard's 18.6-year maps at correlation 0.942 and 0.975.

**Visual.** The app's validation page ("How we know it is right"): NASA
Goddard's average Sun visibility map next to ours for the same 41 km square at
the pole, same colour scale. If the page is not ready, use the two maps alone.

**Speaker notes.** The terrain is NASA's LOLA elevation data from the Lunar
Reconnaissance Orbiter, and the Sun and Earth come from JPL's DE440 ephemeris
through NASA's SPICE toolkit. We match JPL Horizons to 0.00003 degrees,
Apollo Sun elevations to 0.15 degrees, NASA Goddard's 18.6-year visibility maps
at 262,144 points with correlation 0.942 for the Sun and 0.975 for the Earth,
and our own Python reference within 0.2 percentage points.

---

## Slide 7. Try it

**On the slide**

> Try it
>
> abulkosim.github.io/earthrise
>
> Runs in a browser, no install, no login. Open source. For mission planners,
> teachers and anyone curious.

**Visual.** A QR code for https://abulkosim.github.io/earthrise/ beside a
close crop of the panorama from slide 4: the terrain horizon with the gold Sun
and the blue Earth above it.

**Speaker notes.** Earthrise runs in a browser, and the code and every check
are public under Apache 2.0. Its limits are written in the app: 20 m terrain
cannot see boulders, there is no thermal model, and the lander is assumed
upright. We want to put it in front of mission planners and teachers next.
