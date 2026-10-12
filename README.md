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

## Freenet version

The same app can be published on [Freenet](https://freenet.org). There it adds one shared thing: **star names**. Any explorer can name the star they are on (✎ Name star); the name appears for everyone, on the map (gold ring) and on the world itself.

Freenet has no global clock, so "first to discover" cannot be decided fairly. As in FreeNames, a name is held by the **strongest proof of work**: naming a free star takes a moment of mining (2^18 hashes on average), and taking a named star means out-working its holder. The contract keeps the strongest claim per star (the 20,000 strongest overall), so every merge order converges.

| Part | What it is |
| --- | --- |
| `contract/` | Rust contract: `seed → {name, by, nonce}` with `sha256("dw1\|seed\|name\|by\|nonce")` ≥ 18 leading zero bits; lower hash wins. Admin-signed blocklist (`dwb1\|ts\|seeds`) hides stars. Parameters = admin ed25519 key (the FreeNames / FreeTunes admin key, `ADMIN` in `freenet/net.js`). |
| `freenet/names.js` | The same claim rules in JS, and the miner. Shares a test vector with the contract. |
| `freenet/net.js` | Node connection (`@freenetorg/freenet-stdlib`): load / subscribe / publish names. Only imported when a node serves the page or with `?node=host:port`, so the static site stays build-free. |

Known limits:

- **Nicknames are not authenticated**: anyone can type any nickname. A whoiam/viso sign-in (as in FreeNames) would fix that.
- **Progress is per browser, and may not persist on Freenet**: the node serves apps in a sandboxed iframe where `localStorage` can be unavailable; then atlas, fuel and logbook last only for the session. A storage delegate (as in FreeNames) would fix that.
- The admin can hide a star's name; changing the admin key or the contract creates a new, empty registry.
- Names are public and permanent on the network (no global delete).

### Build and publish

Requirements: `rustup` with the `wasm32-unknown-unknown` target, `freenet` and `fdev`, Node 20+.

```bash
cd contract && cargo test --release && cargo build --release --target wasm32-unknown-unknown && cd ..
cp contract/target/wasm32-unknown-unknown/release/distant_worlds_names.wasm freenet/names.wasm
npm install && npm test && npm run build          # -> dist/

# dev against a local node: npm run dev, then open http://localhost:5173/?node=127.0.0.1:7509
fdev website init distant-worlds                  # once: creates the signing key. Back it up!
fdev website publish dist --key distant-worlds    # later: fdev website update dist --key distant-worlds
```

Admin: open the app with `?admin`; the Atlas then shows a button to sign and send the blocklist.
