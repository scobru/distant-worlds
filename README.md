# Distant Worlds

Press **New world**: a new planet is born, with its own landscape, creatures and generative soundtrack.
Everything comes from a seed in the URL (`…/#v1-8393_2007_4`): share the link and whoever opens it sees and hears the same world, at the same spot (`#seed@12.5`).

- **Your explorer**: a character with looks random for each player (suit colour, helmet or hat, backpack) walks left and right (arrow keys / A-D, hold ◀ ▶, or drag), or on its own with **🚶 Auto** (it keeps going the way it faces).
- **Endless worlds**: walk forever. Terrain, structures, flora, creatures and rare relics are generated chunk by chunk as you go.
- **Cultures** (One Piece style: real places, reinvented): temperate, japanese, nordic, desert, jungle, western, arctic, apocalyptic, war. Each brings its buildings (pagodas and torii, longhouses and stave churches, domes and minarets, step pyramids, saloons, igloos and lighthouses, broken towers and wrecks, bunkers and searchlights), flora (blossoms, bamboo, palms, cacti, dead trees…), relief, colours, weather (petals, snow, ash) and music.
- **Relief and depth**: rolling hills, ridged peaks, mesas, dunes, rock spires, floating islands with waterfalls; rivers winding towards the viewer; auroras and smoke columns; seas that lie between the far ranges and the walkable shore; volcanoes (some erupting) and waterfalls pouring down the ranges. Volcanoes and waterfalls come from their own random stream, so every `v1` world keeps everything it had.
- **Traits**: era (ancient … far future), civilization (uninhabited, humans, aliens, ruins), fauna (birds, herds, sky jellyfish, giants, flying whales), flora (forest, conifers, crystals, mushrooms) and visual style (classic, neon, pastel, mono, sepia).
- **Living galaxy**: worlds are born, age and collapse on a clock shared by everyone. Each star lives 30-120 days; when its world collapses it gives birth to a new one (`#v1-x_y_n.g`, the g-th world of that star; old links lead to the new world). From age 70 a world is unstable: tremors, a red sky, meteors, richer ore, and gravity rising up to ×2 (slower steps, shorter reach, buildings cost more). If it collapses while you are there you jump away in an emergency and leave half your bag behind. A dying home can be moved to a young world (🚀, 3 plants + 3 ore per building); otherwise its buildings are lost and its creatures escape with you.
- **Heritage**: a world born from a star remembers the one before it. Ruins of its buildings stand here and there, one of its species survives (and can be captured), and the homes explorers built there are left as ruins: yours (remembered when your home collapsed) and, on Freenet, everyone else's, with their names.
- **Events**, the same for every explorer at the same time: every 3 hours a world may get one, lasting 1-2 hours. A meteor shower leaves meteorites with 4-7 ore (more showers on dying worlds), a herd migrates in from a star of the same sector and can be captured, a trader swaps plants and ore for ore, fuel or a creature from another world. The map marks worlds with an event now.
- **Galaxy**: every world is a star on a map (10,000 × 10,000 sectors, `#v1-<x>_<y>_<n>`). Regions such as the Alien Nebula or the Sky Seas change what grows there.
- **Composable species**: animals are built from parts (legs, neck, head, horns, tail, pattern) and go into your bestiary. Each species has its own size, from tiny to huge (×0.55 to ×2.6, giants even bigger), and so does each plant species, up to giant trees (×3.5). The Atlas shows each one's size, and the extremes are rarer finds (a huge or tiny species counts towards rare, epic, legendary; a giant plant is at least rare). Flyers (bird flocks, sky jellyfish, flying whales) are species too: capture one when it passes over you; at home it circles above your buildings (it does not breed).
- **Herbarium**: each world grows 1-3 plant species of its flora (own proportions, colour, sometimes flowers, a Latin-sounding name); the ones you see are pressed into the Atlas.
- **Pickups** along the walk, the same for everyone each day and more frequent far from the arrival point: fuel cells (+15 fuel, shaped by the culture), map fragments (the next jump costs half) and, on the Freenet version, time shards (your time on that planet runs ×3 for 90 s; 3 a day per planet). Click one near the middle of the screen, where you stand.
- **Gathering**: near your explorer, click (or press **E**) to harvest plants 🌿, capture creatures 🐾 and mine ore deposits ⛏. What you take is gone for the day and grows back tomorrow.
- **Home planet** (🏠): settle on a world, then come back for free with **Go home**. Creatures you captured are released there and roam around, and the seeds of every plant species you harvested (the first harvest gives them) are sown in a garden among your buildings; plants and ore build huts, mills, stables, workshops, temples, castles, towers and domes where you stand (**🏗 Build**), growing your camp into a village, town, city, capital. **Population**: huts, castles and domes house people, mills, stables and domes feed them (the land alone feeds 6); each inhabitant adds 2% to what the home produces (at most double). **Civilization level** comes from people, buildings (their cost and variety) and creatures, and gives the title. **Pirates** may attack a home every 8 hours (a shared clock, the same raids for everyone; new homes are spared for 3 days): crews grow with the civilization level, castles and towers (plus one per 5 people and one per 3 creatures) defend. Repelled pirates leave ore; winners damage a building, which does nothing until repaired for half its cost, and the home is then spared for a day. Buildings work for you: they produce plants, ore or fuel while you are away (up to a day's worth, collected when you come home), mills / workshops / stables add to what you gather, towers make every jump cheaper (10% each, up to 50%). Achievements: Settler, Founder, Mayor, Architect, Rancher. Kept in this browser (and in the node on Freenet), visible only to you.
- **Breeding** (🧬): each Stable at home lets two species living there have a young one a day (🌿10 ⛏5). The young takes each part from one parent, sometimes a new one (a mutation), with proportions in between, and a name from both; the same parents always give the same young (`world.js` `breed`). Its id joins the parents' ids, sorted, a bred parent in parentheses (`a+b`, `(a+b)+c`), so it can be checked and redrawn anywhere; young breed in turn, up to 3 generations from the wild. It joins the bestiary and the home, and on Freenet / the web version other explorers see it there.
- **Names** (✎, Freenet / web): the first explorer to name a species (wild or bred) or a plant (wild or crossed) from the Atlas gives it its common name, signed and kept by the galaxy (earliest wins); everyone sees it on hover cards and in their Atlas.
- **Messages** stay longer the longer they are, and the **📜 Log** (☰ menu) keeps this session's last 100. On a phone the world's details take one line: tap the name to read them all.
- **Hover cards**: point at (or tap) a plant, animal, building, relic, flyer or flag to see what it is, and whether it is already in your atlas or bestiary.
- **Music** (`audio.js`): each world has its own lead instrument (bell, glass, pluck, marimba, flute), drone (organ, wind, choir), optional pad / bass / percussion and reverb; it gets richer when more is happening on screen.
- **Composer** (`compose.js`): real harmony instead of a loop. Each world plays in one of three styles (ballad, dreamy, groove), and a world close to collapse switches to a fourth, tense, with chord progressions, phrased melodies (question and answer, cadences on the tonic, A A B A form), accompaniment (broken chords, arpeggios or stabs) and bass, all inside the world's own scale. What it knows comes partly from **example MIDI files**: `node tools/learn-music.mjs *.mid > music-model.js` learns chord-to-chord moves, melodic intervals, rhythm cells and tempo per style (statistics only, no notes). The model shipped here was learned from 76 MIDI transcriptions of the Final Fantasy VIII soundtrack (not in the repo): minor, fast pieces teach the tense style, slow ones the ballad, steady beats the groove, the rest the dreamy one. Add more examples and regenerate the model to teach it more.
- **Game**, all in the browser (`localStorage`, no server):
  - **rarity**: weighted traits make each world common / rare / epic / legendary;
  - **atlas**: discovered traits, civilization × era combinations, relics, achievements, bestiary, logbook of saved worlds;
  - **world of the day** (a star picked from the date) with a daily mission and streak;
  - **hyperdrive fuel**: jumping to an unvisited world costs fuel (nearby stars 20–50, a random jump 100). You refuel by walking new ground and discovering things; the daily mission fills the tank. Revisiting stars, saved worlds, the world of the day and shared links are free.
- Seeds carry the generator version (`v1-…`): a future v2 must keep generating `v1` seeds the same way.
- Static, no dependencies, no build: `index.html` + ES modules. Deterministic: `makeWorld(seed)` is a pure function (`node world.test.mjs && node atlas.test.mjs`).

Local: `python3 -m http.server` and open http://localhost:8000.

## Freenet version

The same app can be published on [Freenet](https://freenet.org). There it becomes multiplayer:

- **Sign in** with your [Viso](https://github.com/scobru/viso) persona (it delegates a key kept by your node, as in FreeNames; your **name and avatar come from your Viso profile**), or **create / import a key** right in the game, as in the other apps. Every colony and message is signed for that persona. A key made here can be backed up from the Atlas. Your progress (atlas, fuel, logbook) is also kept in the node, since the page runs in a sandbox that may have no `localStorage`.
- **Persona level**: colonizing needs a level (`ante`) of at least **20 bits**, chatting at least **16**. The level is the persona's own proof of work, made once: in Viso, or here for a key made in the game (about 2^20 hashes, some seconds; byte for byte the proof viso-ante makes). Colonies and messages carry it and the contracts verify it, so throwaway personas cost something.
- **Colonies**: one colonist per planet. Stay on a planet and your browser measures the time as proof of work, mined in the background at a fixed honest rate (5000 hashes/s). After a few minutes a **🚩 Plant flag** button appears: your flag goes where you stand, and everyone sees it in the world and on the map (gold ring). Planets keep their generated names. **Spend more time there than its colonist** and the button becomes **Take this planet**; they can come back and take it again (a colonist's extra time is published quietly, so staying defends the planet).
- **Homes**: once signed in (level ≥ 20), your home planet is published to the galaxy contract: whoever lands there sees your buildings and creatures, with your name and civilization title. The newest signed home of each persona wins; a home holds at most 64 buildings and 64 creatures.
- **Sieges** (⚔): land on another explorer's home and press **⚔ Besiege** (⚡20 ⛏10). Stay there: a second miner, bound to that home and the day (`sha256("dwr1|target|attacker|day|lane|nonce")`), measures the siege; every 2 minutes of it is one raider. **Attack** publishes the raid, signed, to the galaxy contract (at least the work of a colony, one raid per attacker, home and day, a longer siege replaces a shorter one). Raiders against the home's defence (castles, towers, people, creatures, as published) decide it: the attacker takes ore, or the defence holds. The defender's browser fights each new raid like a pirate raid (a building damaged and a day of shield, or ore), new homes are spared for 3 days. Homes marked **🕊 Peaceful** neither besiege nor get besieged, except for a day after their owner besieged someone.
- **Leaderboard** (🏆): explorers ranked by civilization level (computed from their published home: people, buildings, creatures), then colonies held and time invested, read straight from the contract; your rank even outside the top 20, and each explorer's planets, one click away.
- **Galaxy chat**: a hideable side panel (💬 Chat, with an unread count). Messages are signed for your persona; the Viso level is the anti-spam, so sending is instant. **🌍 Share world** posts the world you are on as a card (name, rarity, era, colonist) that takes whoever clicks it to the same spot, for free.

How time is measured: for each of 8 lanes the miner keeps the lowest `sha256("dwc1|seed|persona|lane|nonce")`. The sum of their top 64 bits shrinks as work accumulates, so it estimates the hashes spent (about 64·2⁶⁴ / sum). Lanes are bound to the planet and the persona, so time cannot be moved elsewhere. The contract keeps the lowest sum per planet; equal sums fall back to the colonist's newer update, so every merge order converges.

| Part | What it is |
| --- | --- |
| `contract/` | Rust galaxy contract: `seed → colony {persona, name, nick, x, ts, nonces, ante, sig, cert}`, plus homes, sieges (`raids`) and common names (`names`, species or plant id → first name). Checks the Viso delegation (`whoiam-delegation`, from FreeNames), the signature, the minimum work and the persona level (`viso-ante`, ≥ 20 bits). Admin-signed blocklist (`dwb1\|ts\|list`) hides stars or personas. Parameters = admin ed25519 key (`ADMIN` in `freenet/net.js`, the FreeNames / FreeTunes admin key) ‖ app path. |
| `chat/` | Rust chat contract: messages signed like colonies, persona level ≥ 16 bits, newest 20 per persona and 500 overall; the admin blocklist removes personas. |
| `freenet/chat.js` | Chat rules in JS. |
| `freenet/viso.js` | Reads a Viso persona (contract address, signed slots, profile, avatar, `ante` level) and builds a level for a key held here. Checked against vectors made with viso-core / viso-ante (`freenet/viso.vector.json`). |
| `freenet/colony.js` | Colony rules in JS and the time miner. Shares a test vector with the contract. |
| `freenet/connect.js` | Viso sign-in proof and key display, checked against whoiam's golden vector. |
| `freenet/net.js` | Node connection (`@freenetorg/freenet-stdlib`), identity delegate (FreeNames' `identity.wasm`), sign-in, galaxy contract. |
| `freenet/ui.js` | Game layer: miner loop, auto-colonize / take-over, status line, atlas sections. Only imported when a node serves the page or with `?node=host:port`, so the static site stays build-free. |

Known limits:

- **The time rate is honest, not enforced.** Freenet has no trusted clock: a modified client can mine faster and take planets sooner. The Viso level only makes each persona cost something; it does not slow down a fast miner.
- A level shows a persona cost something, not that it is unique or human: someone can still grind many personas.
- Profiles and avatars are read from the persona's Viso contract when this node can reach it; a key made in the game has no avatar. Its secret is kept in the node's store: back it up, since signing out forgets it.
- One node = one explorer: the app key lives in the node, so every browser on the same node shares the sign-in (use Sign out to switch persona).
- Names come from Viso profiles (or are chosen here when the profile has none): signed, but not unique.
- Names go to the earliest self-declared time: a modified client can backdate a name, as with chat times.
- Sieges are proven work, but who wins is decided by each browser against a self-declared home, and the damage is applied by the defender's own browser: a modified client can ignore it (as it can already inflate its home).
- Homes are self-declared: resources are gathered in the browser, so a modified client can publish a bigger home than it earned. The contract only bounds it (64 buildings, 64 creatures, signed, persona level ≥ 20).
- The admin can hide stars or personas; changing the admin key, the app path or the contract creates a new, empty galaxy.
- Colonies are public and permanent on the network (no global delete).
- Chat times are the authors' own (no trusted clock): clients hide messages from the future, and each persona keeps at most 20 messages, which bounds what fake times can do.
- On a node that does not have the contracts yet, the first visitor waits about 5 s while they are created.

### Build and publish

Requirements: `rustup` with the `wasm32-unknown-unknown` target, `freenet` and `fdev`, Node 20+.

```bash
cd contract && cargo test --release && cargo build --release --target wasm32-unknown-unknown && cd ..
cd chat && cargo test --release && cargo build --release --target wasm32-unknown-unknown && cd ..
cp contract/target/wasm32-unknown-unknown/release/distant_worlds_galaxy.wasm freenet/galaxy.wasm
cp chat/target/wasm32-unknown-unknown/release/distant_worlds_chat.wasm freenet/chat.wasm
npm install && npm test && npm run build          # -> dist/

# dev against a local node (no IPv6? add --ws-api-address 127.0.0.1)
freenet local --ws-api-port 7510 --config-dir .devnode/config --data-dir .devnode/data --log-dir .devnode/log
npm run dev   # open http://localhost:5173/?node=127.0.0.1:7510  (add &rate=150000 to colonize in seconds)

fdev website init distant-worlds                  # once: creates the signing key. Back it up!
fdev website publish dist --key distant-worlds    # later: fdev website update dist --key distant-worlds
```

Admin: open the app with `?admin`; the Atlas then shows a button to sign and send the blocklist (stars and personas; personas are also removed from the chat).

## Web version (SQLite)

The same multiplayer game without Freenet: a small Node server keeps the galaxy (colonies, homes, sieges, blocklist) and the chat in a SQLite file, using Node's built-in `node:sqlite` (Node 22.13+, no new dependency).

- Same records, same rules: `web/db.js` ports the contracts' checks (signatures, the whoiam delegation, the persona level, the proof of work, limits) and merge rules, so the client code (`freenet/ui.js`) is unchanged. `web/net.js` replaces `freenet/net.js` in the web build (`vite --mode web`).
- No Viso: explorers create or import a key in the game (kept in `localStorage`, backed up from the Atlas). Its level is built in the browser as on Freenet.
- Live updates through server-sent events (`/api/events`); `GET`/`POST /api/galaxy` and `/api/chat` read the state and send deltas, in the contracts' JSON shapes.

```bash
npm install && npm run build:web     # -> dist/
npm start                            # http://localhost:8080 (env: PORT, DB=distant-worlds.sqlite, DIST=dist, APP_PATH=/, ADMIN=<hex pubkey>)

# dev: the server in one terminal, vite (proxies /api) in another
npm start & npm run dev:web          # http://localhost:5173
```

With Docker (the database lives in the `data` volume):

```bash
docker compose up -d --build         # http://localhost:8080 (PORT and APP_PATH from the environment or .env)
```

Known limits: the server trusts no one more than the contracts did (same self-declared homes and honest-rate miner), and the database has to be backed up like any file. Behind a sub-path set `APP_PATH` (e.g. `/dw/`, with the trailing slash): it is part of every explorer's delegation, so changing it invalidates every key signed in so far (explorers have to sign in again).
