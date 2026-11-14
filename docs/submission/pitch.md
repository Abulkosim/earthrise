<!-- Written with AI assistance (Claude); see the README. -->
# Pitch notes for the presenters

For Maria and Vlad. Read it once, then say it in your own words.
The slides are in `deck/`. This file is the live demo and the questions.

## The one sentence

Every other tool tells you about one point on the Moon at a time.
Earthrise works out sunlight, Earth contact and power for every point of the
south pole at once, so a planner sees where a mission works and how that
changes when the launch date slips.

## Three-minute talk

1. **The problem (20 s).** At the lunar south pole the Sun sits within two
   degrees of the horizon. A hill a few kilometres away can hide it for days.
   The Earth hangs low too, and when it drops behind the terrain the lander
   cannot talk to home. In March 2025 IM-2 Athena came down 250 m from its
   target, ended up in a small crater, and the mission was over the next day.
2. **What planners do today (15 s).** They check one site and one date at a
   time in tools made for specialists. When the launch slips, they start again.
3. **What we built (30 s).** A map that does it for every point at once. You
   describe the lander in plain sentences: how long it stays, its solar array,
   its battery, how clear the Earth must be. The map shows where that mission
   works.
4. **Live demo (75 s).** See the steps below.
5. **Why you can trust it (25 s).** It is built on NASA Goddard's corrected
   laser elevation maps, 5 m near the pole, and JPL's ephemeris. We reproduced
   a published NASA Goddard result: sunlight on seven regions of the
   connecting ridge over 2024 and 2025. All 42 numbers land on the right side
   of the paper's bounds. That check also showed that the older public maps
   have errors along the laser tracks that cast false shadows: on the ridge
   they cut the longest sunlit period from about 220 days to about 25. So we
   switched maps. The validation page lets anyone rerun the checks on their
   own computer.
6. **Close (15 s).** Science teams want the permanent shadow, where ice can
   last. Engineers want the light. One sentence in the brief asks for both,
   and the map shows the ground that has it.

## Live demo, click by click

Open the app. Wait for the map (a few seconds). The map fills the screen; the
mission is on the left, the timeline at the bottom.

1. Point at the map. "This is the south pole right now, lit by the real Sun
   position, on NASA's corrected elevation maps. That black circle is
   Shackleton crater. Its floor never sees the Sun."
2. Open **Show me** in the header and choose **A lunar month of light**. "One
   month in 25 seconds. The Sun goes around the horizon and the shadows turn
   with it." Press **Stop**.
3. In the layer dock in the header, pick **Where the mission works** (hover
   the icons to see their names). "Bright ground is where this lander
   survives a 14-day stay starting 3 November 2027: enough Sun, enough
   battery, enough contact with Earth. About 15 percent of what you see." Point
   at the left panel, tab **Mission**: "The brief is plain sentences. Every
   value is a chip you can click and change."
4. **Show me**, then **A landing date that slips**. "Now the launch slips, day
   by day. The good ground moves and shrinks. The bars at the bottom are the
   landing calendar: for each date, how much of the map still works." Press
   **Stop**.
5. Press **Cmd K** (or click **Find a site**), type "connecting ridge" and
   pick **Shackleton connecting ridge**. The site sheet opens on the right.
   "This is what the lander sees: the horizon around it, the Sun in gold, the
   Earth in blue. The tiles give sunlight, longest dark, contact, longest
   silence, power and permanent shadow. This point gets 64 percent sunlight,
   but one dark stretch of 5 days 2 hours, over the brief's 72-hour limit,
   so it fails."
6. Point at the tile **If the landing misses**. "Landers miss. IM-2 came down
   250 m from its target. This is the share of ground within 500 m that still
   works." Then **Show me**, **The best place to land**. "It finds the point
   in view with the most workable ground around it."
7. In the brief, turn on the last sentence, about permanent shadow. "Now the
   map keeps only ground within 2 km of permanent shadow. This is where
   science and engineering agree."
8. If there is time: left panel, tab **Real landings**, then **IM-2**. "The
   real landing, on the real date, with what the model shows there. The
   lander died in a 20 m crater. We say so on the page: that is below what
   the data there can see."
9. Or **SLIM**. "SLIM landed on its nose with its solar cells facing west. The
   replay sets a fixed array that way. The model gives no power at landing
   and first light on 23 January. JAXA regained contact on the 28th."

If the network or projector fails: the deck has screenshots.

## Numbers worth knowing by heart

| What | Number |
|---|---|
| Points evaluated at once | 266,256 |
| Time to trace their horizons | about 3.6 s on an M2 Pro |
| Finest terrain | 5 m, from 87 S to the pole |
| Against Barker et al. 2021, Table 2 | 42 of 42 values inside the bounds |
| Track errors on the old maps, connecting ridge | longest lit period about 25 days instead of about 220 |
| Against our reference, 24 points | 0.008 degrees mean, 0.16 at most |
| Against JPL Horizons | 0.00003 degrees |
| Against NASA Goddard's 18.6-year Sun map | correlation 0.94 |
| Automated checks | 19 on the model, 30 on the app, 9 end to end |
| Sites in the catalogue | 45, each with a source |

## Questions judges may ask

**How is this different from NASA's QuickMap or Moon Trek?**
Those show data layers and let you inspect a point. They do not take a mission
description and tell you where and when it works. Ours evaluates the mission
at every point and for every landing date.

**Other teams also compute horizons. What is new here?**
They compute one site at a time. We compute the whole map on the graphics
card, fast enough to move the landing date and watch the answer change. The
landing calendar and the "where the mission works" map come from that.

**How do you know the numbers are right?**
Layers. The Sun and Earth positions match JPL Horizons. A slow reference model
in Python, tested on its own, matches the fast engine at 24 hard points. We
reproduce a published NASA Goddard table of sunlight on the connecting ridge.
And the long-run averages match Goddard's published maps. The validation page
shows all of it and lets you rerun the checks.

**How do you know the terrain is right?**
We use NASA Goddard's track-adjusted LOLA maps (Barker et al. 2021 and 2023),
5 m near the pole. We checked them by reproducing Table 2 of Barker et al.
2021: seven regions on the connecting ridge, 2,114 pixels at 5 m, every hour
of 2024 and 2025, at 1 m and 5 m above the ground. All 42 values fall on the
right side of the paper's bounds. At 5 m height our average sunlight is 0.2 to
2.2 points above their 1st percentile, the longest lit period 142 to 233 days
against their 119 to 231, the longest shadow 3.9 to 6.9 days against 4.0 to
8.4. The same check showed the older PDS mosaics are not good enough: errors
along the laser tracks leave metre-high ridges that cast false shadows when the
Sun grazes the ground. On the ridge they cut the longest lit period from about
220 days to about 25.

**What does it get wrong?**
The terrain is 5 m near the pole and 20 m further out, so it cannot see a
boulder or a small crater. There
is no thermal model. The antenna has no pointing limits and the battery model
is simple. All of this is listed on the validation page.

**Which NASA data do you use?**
NASA Goddard's track-adjusted LOLA elevation maps from the Lunar
Reconnaissance Orbiter, Goddard's region outlines for the Barker check, JPL's DE440
ephemeris through the SPICE toolkit, NASA Goddard's illumination maps for
checking, JPL Horizons for checking, and the Apollo Lunar Surface Journal.

**Did you use AI?**
Yes, and we say so everywhere. The team chose the challenge, set the direction
and made the decisions. Claude, an AI model, wrote most of the code and tests
under our direction. That is why we put so much weight on checks against
outside sources: the numbers do not depend on trusting the code's author.

**Who would use it?**
A mission planner whose launch date just moved. A science team and an
engineering team who need to agree on a site. A teacher showing why the south
pole is hard. The brief is written in plain sentences for that reason.

**What would you do next?**
The 5 m terrain at more Artemis sites as Goddard publishes it, a thermal model
for the night, antenna pointing limits, and relay satellites besides direct
contact with Earth.

**Does it run on any computer?**
It runs in a browser with no install, in Chrome and in Safari (Safari 26.6
gives the same check results). On a weak graphics card it uses fewer points
and still answers in seconds. It also works on a phone.
