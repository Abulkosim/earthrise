# Credits

Everything Earthrise uses that the team did not make: what it is, what we use it for, where it is, and its licence or terms. Where we could not confirm a licence, it says "terms: see source".

This project is not endorsed by NASA or by any of the organisations below. It uses no NASA logo or insignia.

## NASA data

**LOLA gridded polar elevation maps** (Lunar Reconnaissance Orbiter, Lunar Orbiter Laser Altimeter; PDS data set LRO-L-LOLA-4-GDR-V1.0). The terrain for every horizon. We use LDEM_80S_20M, LDEM_80S_40M and LDEM_80S_80M (80 to 90° S at 20, 40 and 80 m) and LDEM_60S_240M (60 to 90° S at 240 m).
From PDS Geosciences Node: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
Terms: NASA Planetary Data System data, free to use. Instrument paper: Smith, D. E. et al. (2010), The Lunar Orbiter Laser Altimeter investigation on the Lunar Reconnaissance Orbiter mission, Space Science Reviews 150, 209-241, https://doi.org/10.1007/s11214-009-9512-y.

**SPICE kernels from NASA's Navigation and Ancillary Information Facility (NAIF), JPL.** Sun and Earth positions, lunar orientation and time. Files: naif0012.tls (leap seconds), pck00011.tpc (planetary constants), de440s.bsp (JPL DE440 planetary and lunar ephemeris), moon_pa_de440_200625.bpc (lunar orientation), moon_de440_250416.tf (lunar frames, including MOON_ME).
From https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
Terms: NAIF rules for SPICE, https://naif.jpl.nasa.gov/naif/rules.html. NAIF asks users to acknowledge SPICE: Acton, C. H. (1996), Ancillary data services of NASA's Navigation and Ancillary Information Facility, Planetary and Space Science 44(1), 65-70, https://doi.org/10.1016/0032-0633(95)00107-7; Acton, C., Bachman, N., Semenov, B., Wright, E. (2018), A look towards the future in the handling of space science mission geometry, Planetary and Space Science 150, 9-12, https://doi.org/10.1016/j.pss.2017.02.013. The ephemeris: Park, R. S. et al. (2021), The JPL planetary and lunar ephemerides DE440 and DE441, The Astronomical Journal 161, 105, https://doi.org/10.3847/1538-3881/abd414.

**NASA Goddard lunar polar illumination maps**, average visibility of the Sun and of the Earth over 18.6 years, 85 to 90° S at 60 m (AVGVISIB_85S_060M_201608 and AVGVISIB_85S_060M_201608_EARTH). Used only to check our results; see the validation page.
From http://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/ (also on https://pgda.gsfc.nasa.gov/products/69).
Terms: NASA GSFC public data; the product page asks users to cite Mazarico et al. (2011), below.

**JPL Horizons API** (Solar System Dynamics, JPL). Used only in a test, to check our Sun and Earth directions from three lunar sites.
https://ssd.jpl.nasa.gov/api/horizons.api
Terms: see source.

**NASA Moon Trek** (Solar System Treks, JPL). Coordinates of past landing sites, Artemis III candidate regions, CLPS sites and LOLA highest-illumination points, listed site by site in `app/src/data/sites.json`.
https://trek.nasa.gov/moon/
Terms: see source.

**Apollo Lunar Surface Journal**, table of Sun altitude and azimuth at each Apollo landing, compiled by J. Scotti. Used in a test of our Sun elevations.
https://www.nasa.gov/wp-content/uploads/static/history/alsj/Scotti_AltAz.txt
Terms: see source.

## Other data

**Gazetteer of Planetary Nomenclature**, IAU Working Group for Planetary System Nomenclature and USGS Astrogeology. Names and positions of the craters and mountains drawn on the map, and two landing sites.
https://planetarynames.wr.usgs.gov/
Terms: see source.

**Lunar Reconnaissance Orbiter Camera (LROC) image releases**, NASA/GSFC/Arizona State University. Coordinates of recent landers (Chang'e 5 and 6, SLIM, IM-1, IM-2, Blue Ghost Mission 1, HAKUTO-R Missions 1 and 2, Luna 25) and the Mons Mouton Plateau region of interest; each site links to its page in `app/src/data/sites.json`.
https://lroc.im-ldi.com/
Terms: see source.

**China in Space** (news site). Planned landing area of Chang'e 7.
https://www.china-in-space.com/p/change-7-moon-mission-arrives-in
Terms: see source.

## Method papers

- Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Torrence, M. H. (2011), Illumination conditions of the lunar polar regions using LOLA topography, Icarus 211, 1066-1081, https://doi.org/10.1016/j.icarus.2010.10.030. The horizon method and the average visibility maps we check against.
- Barker, M. K., Mazarico, E., Neumann, G. A., Smith, D. E., Zuber, M. T., Head, J. W. (2021), Improved LOLA elevation maps for south pole landing sites: error estimates and their impact on illumination conditions, Planetary and Space Science 203, 105119, https://doi.org/10.1016/j.pss.2020.105119. Horizon practice and the cut of the Sun's disk by a level horizon.
- Gläser, P., Scholten, F., De Rosa, D., Marco Figuera, R., Oberst, J., Mazarico, E., Neumann, G. A., Robinson, M. S. (2014), Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA, Icarus 243, 78-90, https://doi.org/10.1016/j.icarus.2014.08.013. Illumination figures for the Shackleton connecting ridge, used as a sanity check.
- Bussey, D. B. J. et al. (2010), Illumination conditions of the south pole of the Moon derived using Kaguya topography, Icarus 208, 558-564, https://doi.org/10.1016/j.icarus.2010.03.028. Source of one candidate point in the site list.

## Software

| Package | Used for | Where | Licence |
|---|---|---|---|
| React 19.3.1, React DOM 19.3.1 | Web app interface | https://react.dev | MIT |
| Vite 8.3.8 | Dev server and build | https://vite.dev | MIT |
| @vitejs/plugin-react 6.3.0 | React support in Vite | https://github.com/vitejs/vite-plugin-react | MIT |
| TypeScript 7.0.2 | Language and type checks | https://www.typescriptlang.org | Apache-2.0 |
| oxlint 1.93.0 | Lint | https://oxc.rs | MIT |
| @types/react, @types/react-dom, @types/node | Type definitions | https://github.com/DefinitelyTyped/DefinitelyTyped | MIT |
| NumPy 2.5.4 | Reference model and data build | https://numpy.org | BSD-3-Clause (with bundled MIT, 0BSD, Zlib and CC0 parts) |
| SpiceyPy 8.4.0 | Python interface to SPICE | https://github.com/AndrewAnnex/SpiceyPy | MIT |
| SPICE Toolkit (CSPICE, bundled in SpiceyPy) | Ephemeris, frames and time | https://naif.jpl.nasa.gov/naif/toolkit.html | NAIF rules, https://naif.jpl.nasa.gov/naif/rules.html |
| pytest 9.2.0 | Tests | https://pytest.org | MIT |
| setuptools | Python package build | https://github.com/pypa/setuptools | terms: see source |
| pnpm, Node.js | Package manager and runtime | https://pnpm.io, https://nodejs.org | terms: see source |
| GitHub Actions (checkout, setup-node, setup-python, cache, pnpm/action-setup) and GitHub Pages | CI and hosting | https://github.com | terms: see source |

Versions are the ones installed when this file was written; `app/package.json` and `pipeline/pyproject.toml` hold the ranges.

## Fonts

| Font | Used for | Where | Licence |
|---|---|---|---|
| Archivo (variable, by Omnibus-Type), through Fontsource `@fontsource-variable/archivo` 5.3.0 | Interface text | https://fontsource.org/fonts/archivo | SIL Open Font License 1.1 |
| Source Serif 4 (variable italic, by Adobe), through Fontsource `@fontsource-variable/source-serif-4` 5.3.1 | Place names on the map | https://fontsource.org/fonts/source-serif-4 | SIL Open Font License 1.1 |

## Design guidance

Anthropic's "frontend-design" skill, https://github.com/anthropics/skills (skills/frontend-design, Apache-2.0). Read as guidance on interface design only. No code or assets were copied from it.

## AI

Claude, an AI model by Anthropic, used through Claude Code. It wrote most of the code, tests and documentation under the team's direction. See "Use of AI" in the [README](README.md).
