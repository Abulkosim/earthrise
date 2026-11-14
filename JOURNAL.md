# Journal

A running record of what was done, what was found and what is still open.
Times are Tashkent time (UTC+5). Newest entry last.

## Sat 14 Nov 2026

### 14:30 Repo created

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
- The rules say AI should not be used to come up with the idea. The concept is the team's call.
- No work before Sat 14 Nov 09:00 local. The repo was created after that.

### 15:00 Deadline found

Global deadline is Sun 15 Nov 23:59. The Tashkent event judges earlier:
preliminary judging Sun 14:00 to 16:00, final judging 17:00 to 18:00, in person.
The product and the pitch must be ready by Sun 14:00.

Team Earthrise: Maria Dorofeeva (owner), Abulkosim, Vladislav Kasev.

### 15:10 Core math checked

Two throwaway spikes, not in the repo yet.

- Sun and Earth azimuth and elevation from a lunar site, computed with SPICE
  (DE440, `MOON_ME` frame). They match JPL Horizons to 0.00003 degrees over a
  month at three sites.
- A terrain horizon in 1,440 directions from the LOLA 80 m south-pole elevation
  map takes 0.15 s per site. An hourly sweep over 18.6 years at a Shackleton
  rim point (89.45 S, 222.69 E) gives the Sun at least partly visible 84.6% of
  the time from 2 m up and 95.4% from 10 m. Gläser 2014 reports 92.27% at 2 m
  and 95.65% at 10 m for the same ridge from a 20 m map; the 2 m gap is expected
  from the coarser map and is still to be closed.

### 16:00 Research in

- Judging: five criteria (impact, creativity, validity, relevance, presentation),
  each scored 1 to 5. Eight of ten 2025 global winners shipped a live web app.
  All ten disclosed AI use openly.
- Competition: about 1,050 teams picked this challenge and about 150 already
  have public repos. The best ones already compute terrain horizons, Sun disk
  fraction, DSN contact, battery state and site or date comparison. A few add
  elevation-map uncertainty, landing scatter and rover traverses. A feature
  list will not win. One idea has to carry the project.
- What nobody does well: they all answer for one point at a time. None shows
  the whole polar region for a chosen hour, none checks itself against real
  mission timelines side by side, and none models a tilted lander or panel.

### Open

- Concept decision by the team lead.
- Data inventory report (exact files and sizes) still running.
