# Distant Worlds

Press **New world**: a new planet is born, with its own landscape, creatures and generative soundtrack.
Everything comes from a seed in the URL (`…/#v1-8393_2007_4`): share the link and whoever opens it sees and hears the same world, at the same spot (`#seed@12.5`).

- **Endless worlds**: walk forever (arrow keys / A-D, drag, or **Walk**). Terrain, structures, flora, creatures and rare relics are generated chunk by chunk as you go.
- **Traits**: era (ancient … far future), civilization (uninhabited, humans, aliens, ruins), fauna (birds, herds, sky jellyfish, giants, flying whales), flora (forest, conifers, crystals, mushrooms) and visual style (classic, neon, pastel, mono, sepia).
- **Galaxy**: every world is a star on a map (10,000 × 10,000 sectors, `#v1-<x>_<y>_<n>`). Regions such as the Alien Nebula or the Sky Seas change what grows there.
- **Composable species**: animals are built from parts (legs, neck, head, horns, tail, pattern) and go into your bestiary.
- **Music** (`audio.js`): each world has its own lead instrument (bell, glass, pluck, marimba, flute), drone (organ, wind, choir), optional pad / bass / percussion and reverb; it gets richer when more is happening on screen.
- **Game**, all in the browser (`localStorage`, no server):
  - **rarity**: weighted traits make each world common / rare / epic / legendary;
  - **atlas**: discovered traits, civilization × era combinations, relics, achievements, bestiary, logbook of saved worlds;
  - **world of the day** (a star picked from the date) with a daily mission and streak;
  - **hyperdrive fuel**: jumping to an unvisited world costs fuel (nearby stars 20–50, a random jump 100). You refuel by walking new ground and discovering things; the daily mission fills the tank. Revisiting stars, saved worlds, the world of the day and shared links are free.
- Seeds carry the generator version (`v1-…`): a future v2 must keep generating `v1` seeds the same way.
- Static, no dependencies, no build: `index.html` + ES modules. Deterministic: `makeWorld(seed)` is a pure function (`node world.test.mjs && node atlas.test.mjs`).

Local: `python3 -m http.server` and open http://localhost:8000.
