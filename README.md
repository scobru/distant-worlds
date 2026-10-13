# Distant Worlds

Press **New world**: a new planet is born, with its own landscape, creatures and generative soundtrack.
Everything comes from a seed in the URL (`…/#v1-8393_2007_4`): share the link and whoever opens it sees and hears the same world, at the same spot (`#seed@12.5`).

- **Your explorer**: a character with looks random for each player (suit colour, helmet or hat, backpack) walks left and right (arrow keys / A-D, hold ◀ ▶, or drag), or on its own with **🚶 Auto** (it keeps going the way it faces).
- **Endless worlds**: walk forever. Terrain, structures, flora, creatures and rare relics are generated chunk by chunk as you go.
- **Cultures** (One Piece style: real places, reinvented): temperate, japanese, nordic, desert, jungle, western, arctic, apocalyptic, war. Each brings its buildings (pagodas and torii, longhouses and stave churches, domes and minarets, step pyramids, saloons, igloos and lighthouses, broken towers and wrecks, bunkers and searchlights), flora (blossoms, bamboo, palms, cacti, dead trees…), relief, colours, weather (petals, snow, ash) and music.
- **Relief and depth**: rolling hills, ridged peaks, mesas, dunes, rock spires, floating islands with waterfalls; rivers winding towards the viewer; auroras and smoke columns.
- **Traits**: era (ancient … far future), civilization (uninhabited, humans, aliens, ruins), fauna (birds, herds, sky jellyfish, giants, flying whales), flora (forest, conifers, crystals, mushrooms) and visual style (classic, neon, pastel, mono, sepia).
- **Living galaxy**: worlds are born, age and collapse on a clock shared by everyone. Each star lives 30-120 days; when its world collapses it gives birth to a new one (`#v1-x_y_n.g`, the g-th world of that star; old links lead to the new world). From age 70 a world is unstable: tremors, a red sky, meteors, richer ore. If it collapses while you are there you jump away in an emergency and leave half your bag behind. A dying home can be moved to a young world (🚀, 3 plants + 3 ore per building); otherwise its buildings are lost and its creatures escape with you.
- **Galaxy**: every world is a star on a map (10,000 × 10,000 sectors, `#v1-<x>_<y>_<n>`). Regions such as the Alien Nebula or the Sky Seas change what grows there.
- **Composable species**: animals are built from parts (legs, neck, head, horns, tail, pattern) and go into your bestiary.
- **Herbarium**: each world grows 1-3 plant species of its flora (own proportions, colour, sometimes flowers, a Latin-sounding name); the ones you see are pressed into the Atlas.
- **Pickups** along the walk, the same for everyone each day and more frequent far from the arrival point: fuel cells (+15 fuel, shaped by the culture), map fragments (the next jump costs half) and, on the Freenet version, time shards (your time on that planet runs ×3 for 90 s; 3 a day per planet). Click one near the middle of the screen, where you stand.
- **Gathering**: near your explorer, click (or press **E**) to harvest plants 🌿, capture creatures 🐾 and mine ore deposits ⛏. What you take is gone for the day and grows back tomorrow.
- **Home planet** (🏠): settle on a world, then come back for free with **Go home**. Creatures you captured are released there and roam around; plants and ore build huts, mills, stables, workshops, temples, castles, towers and domes where you stand (**🏗 Build**), growing your camp into a village, town, city, capital. Buildings work for you: they produce plants, ore or fuel while you are away (up to a day's worth, collected when you come home), mills / workshops / stables add to what you gather, towers make every jump cheaper (10% each, up to 50%). Achievements: Settler, Founder, Mayor, Architect, Rancher. Kept in this browser (and in the node on Freenet), visible only to you.
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
- **Leaderboard** (🏆): explorers ranked by colonies held and time invested, read straight from the contract; your rank even outside the top 20, and each explorer's planets, one click away.
- **Galaxy chat**: a hideable side panel (💬 Chat, with an unread count). Messages are signed for your persona; the Viso level is the anti-spam, so sending is instant. **🌍 Share world** posts the world you are on as a card (name, rarity, era, colonist) that takes whoever clicks it to the same spot, for free.

How time is measured: for each of 8 lanes the miner keeps the lowest `sha256("dwc1|seed|persona|lane|nonce")`. The sum of their top 64 bits shrinks as work accumulates, so it estimates the hashes spent (about 64·2⁶⁴ / sum). Lanes are bound to the planet and the persona, so time cannot be moved elsewhere. The contract keeps the lowest sum per planet; equal sums fall back to the colonist's newer update, so every merge order converges.

| Part | What it is |
| --- | --- |
| `contract/` | Rust galaxy contract: `seed → colony {persona, name, nick, x, ts, nonces, ante, sig, cert}`. Checks the Viso delegation (`whoiam-delegation`, from FreeNames), the signature, the minimum work and the persona level (`viso-ante`, ≥ 20 bits). Admin-signed blocklist (`dwb1\|ts\|list`) hides stars or personas. Parameters = admin ed25519 key (`ADMIN` in `freenet/net.js`, the FreeNames / FreeTunes admin key) ‖ app path. |
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
