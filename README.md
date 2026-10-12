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

The same app can be published on [Freenet](https://freenet.org). There it becomes multiplayer:

- **Sign in with Viso**: your [Viso](https://github.com/scobru/viso) persona delegates a key kept by your node (as in FreeNames), and every colony is signed for that persona. Without Viso, you can create a local explorer key. Your progress (atlas, fuel, logbook) is also kept in the node, since the page runs in a sandbox that may have no `localStorage`.
- **Colonies**: one colonist per planet. Stay on a planet and your browser measures the time as proof of work, mined in the background at a fixed honest rate (5000 hashes/s). After a few minutes the planet is yours: your flag stands where you were, you name the planet, and everyone sees it in the world and on the map (gold ring). **Spend more time there than its colonist and the planet becomes yours**; they can come back and take it again.
- **Leaderboard**: explorers ranked by colonies held and time invested, read straight from the contract.
- **Galaxy chat**: a hideable side panel (💬 Chat, with an unread count). Messages are signed for your persona and carry a small proof of work against spam. **🌍 Share world** posts the world you are on as a card (name, rarity, era, colonist) that takes whoever clicks it to the same spot, for free.

How time is measured: for each of 8 lanes the miner keeps the lowest `sha256("dwc1|seed|persona|lane|nonce")`. The sum of their top 64 bits shrinks as work accumulates, so it estimates the hashes spent (about 64·2⁶⁴ / sum). Lanes are bound to the planet and the persona, so time cannot be moved elsewhere. The contract keeps the lowest sum per planet; equal sums fall back to the colonist's newer update, so every merge order converges.

| Part | What it is |
| --- | --- |
| `contract/` | Rust galaxy contract: `seed → colony {persona, name, nick, x, ts, nonces, sig, cert}`. Checks the Viso delegation (`whoiam-delegation`, from FreeNames), the signature and the minimum work. Admin-signed blocklist (`dwb1\|ts\|list`) hides stars or personas. Parameters = admin ed25519 key (`ADMIN` in `freenet/net.js`, the FreeNames / FreeTunes admin key) ‖ app path. |
| `chat/` | Rust chat contract: messages signed like colonies, 16-bit proof of work, newest 20 per persona and 500 overall; the admin blocklist removes personas. |
| `freenet/chat.js` | Chat rules in JS; shares a test vector with the contract. |
| `freenet/colony.js` | Colony rules in JS and the time miner. Shares a test vector with the contract. |
| `freenet/connect.js` | Viso sign-in proof and key display, checked against whoiam's golden vector. |
| `freenet/net.js` | Node connection (`@freenetorg/freenet-stdlib`), identity delegate (FreeNames' `identity.wasm`), sign-in, galaxy contract. |
| `freenet/ui.js` | Game layer: miner loop, auto-colonize / take-over, status line, atlas sections. Only imported when a node serves the page or with `?node=host:port`, so the static site stays build-free. |

Known limits:

- **The time rate is honest, not enforced.** Freenet has no trusted clock: a modified client can mine faster and take planets sooner. Viso persona levels (`ante`) or a minimum level per colony would raise the cost of that; not done yet.
- One node = one explorer: the app key lives in the node, so every browser on the same node shares the sign-in (use Sign out to switch persona).
- Nicknames are chosen by each explorer (signed, but not unique). Viso profile names and avatars are not fetched yet.
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
