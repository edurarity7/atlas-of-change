# Atlas of Change

An interactive globe for understanding how borders, wars, occupations and foreign powers shaped the Middle East from 1886 to today.

**Live site:** https://edurarity7.github.io/atlas-of-change/

The world is drawn only as dots. Tap any country to see, in plain sentences, who it fought, helped, backed or made peace with in the chosen year, drawn as arrows around the globe (faint arrows show the same links in other years). Every country and war name is tappable, so you can follow one connection to the next. Drag the timeline to move through time. Written stories on the 1948, 1967 and 1973 wars and the Iran–Iraq war cite peer-reviewed research and original documents.

## What changed in version 5

- Globe drawn only as white dots anchored to the ground (no dark sphere, sea or border lines); red dots for countries at war, red rings for occupied land
- Arrows around the globe for the tapped country: red = fought or on opposing sides, white = sent troops to help, dashed white = backed a government, dashed red = backed armed groups in a country, green = peace agreement
- Country panel rewritten as short sentences with tappable country chips, a "connections through the years" chart, and links to each war
- Country names inside the written stories are tappable
- `scripts/build_dots.py` turns `data/borders.geojson` into `data/dots.json` and `data/places.json`

## Data and credits

- Borders: CShapes 2.0 (Schvitz et al. 2022, *Journal of Conflict Resolution*), CC BY-NC-SA 4.0
- Armed conflicts, battle deaths, events, foreign support and peace agreements: Uppsala Conflict Data Program (UCDP)
- Map engine: MapLibre GL JS (BSD-3-Clause)

Non-commercial educational project. Source data and build scripts are kept in the project folder; this repository contains the published website.
