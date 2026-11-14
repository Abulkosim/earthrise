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
5. **Why you can trust it (25 s).** It is built on NASA's laser elevation maps
   and JPL's ephemeris, and checked against sources we did not write: JPL
   Horizons, the Apollo landing records, and NASA Goddard's 18-year
   illumination maps. The validation page lets anyone rerun two of the checks
   on their own computer.
6. **Close (15 s).** Science teams want the permanent shadow, where ice can
   last. Engineers want the light. One sentence in the brief asks for both,
   and the map shows the ground that has it.

## Live demo, click by click

Open the app. Wait for the map (a few seconds).

1. Point at the map. "This is the south pole right now, lit by the real Sun
   position, on NASA's 20 m elevation map. That black circle is Shackleton
   crater. Its floor never sees the Sun."
2. Click **a lunar month of light** in the top bar. "One month in 25 seconds.
   The Sun goes around the horizon and the shadows turn with it." Click
   **Stop**.
3. On the left, choose **Where the mission works**. "Bright ground is where
   this lander survives a 14-day stay starting 3 November 2027: enough Sun,
   enough battery, enough contact with Earth. About 13 percent of what you
   see."
4. Click **a landing date that slips**. "Now the launch slips, day by day. The
   good ground moves and shrinks. The bars at the bottom are the landing
   calendar: for each date, how much of the map still works." Click **Stop**.
5. Click the marker **Shackleton connecting ridge**. "This is what the lander
   sees: the horizon around it, the Sun in gold, the Earth in blue. It says
   when the Sun sets and when the Earth rises, and how the battery does."
6. Tick the last sentence of the brief, **The science team wants ground that
   never sees the Sun**. "Now the map keeps only ground within 2 km of
   permanent shadow. This is where science and engineering agree."
7. If there is time: **Replay a real landing**, then **IM-2 Athena**. "The
   real landing, on the real date. Our 20 m map shows the spot in sunlight.
   The lander died in a 20 m crater. We say so on the page: that is below what
   the data can see."

If the network or projector fails: the deck has a screenshot of every step.

## Numbers worth knowing by heart

| What | Number |
|---|---|
| Points evaluated at once | about 265,000 |
| Time to trace their horizons | 3 to 5 s on a laptop GPU |
| Time to run a 14-day stay for all of them | 0.02 s |
| Against JPL Horizons | 0.00003 degrees |
| Against NASA Goddard's 18.6-year maps | correlation 0.94 (Sun), 0.98 (Earth) |
| Permanent shadow against Goddard's | 93% and 98% agreement |
| Automated checks | 19 on the model, 26 on the app, 9 end to end |
| Sites in the catalogue | 42, each with a source |

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
Three layers. The Sun and Earth positions match JPL Horizons. A slow reference
model in Python, tested on its own, matches the fast engine at 24 hard points.
And the long-run averages match NASA Goddard's published maps. The validation
page shows all of it and lets you rerun two checks.

**What does it get wrong?**
The map is 20 m per pixel, so it cannot see a boulder or a small crater. There
is no thermal model. The lander is assumed upright with an array that tracks
the Sun. All of this is listed on the validation page.

**Which NASA data do you use?**
LOLA elevation maps from the Lunar Reconnaissance Orbiter, JPL's DE440
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
Finer terrain where NASA has it (5 m at the Artemis sites), a tilted lander
and fixed solar panels, a thermal model for the night, and relay satellites
besides direct contact with Earth.

**Does it run on any computer?**
It runs in a browser with no install. On a weak graphics card it uses fewer
points and still answers in seconds. It also works on a phone.
