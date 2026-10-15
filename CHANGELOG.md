# Changelog

## Unreleased

- Cities are raided and besieged like the home: pirates when you arrive there (`pirates` through `withHome`), sieges with `Raid.target` as `persona` or `persona/seed` (`target_persona`; `targetPersona` in `freenet/check.js`, so web), fought by `defend` on the right city; the leaderboard adds up home and cities. A city needs its persona's colony on that planet (`city_ok` in the contract, the same in `web/db.js`): refused without it and dropped when the planet is taken. Galaxy contract changes again; raids already published stay valid.
- The Stables need counts creature room (8 per stable, +50% per level) instead of stable count, and `homeAdvice` may return `up` (the index of a building to upgrade) when that costs no more than the cheapest new building.
- Cities: a persona can found a city on each planet it colonized (`foundCity`, `st.cities`, at most `CITY.max` 8, cost grows 1.5× each). Published as homes with `city: true` (signed `|city`), kept under `persona/seed` beside the home under `persona` (`home_key` in the contract, `homeKey` in `freenet/colony.js`); a persona keeps its 8 newest cities (`MAX_CITIES`, `prune_homes`, same in `web/db.js`). Raids, the leaderboard and fleets stay on the home planet. Galaxy contract changes; older homes stay valid.
- Building upgrades (`lv`, up to `MAX_LV` 3): +50% of base house, food, hourly output and guard per level; `upgrade`/`upgradeCost` in `atlas.js`. Homes still list plain parts; `size_ok` (contract, `freenet/check.js`, so web) now allows 25 people and 125 cost a part (was 10 and 50). Galaxy contract changes but stays compatible with homes already published.
- The home (Build) dialog folds into `<details>` sections like the Atlas, open ones kept across renders; same code for Freenet and web (shared `index.html`).
- Touch: a double tap on the landscape jumps.
- Music follows the game: battles and unstable worlds crossfade into tense music and back; songs fade on jump and mute; the lead swells with each phrase; a world's `density` sets how often the melody rests.
- ☰ 📰 Updates: what changed, in players' words.
- Explorers on the same planet see each other, near-live: a signed presence per persona in the chat contract (`Here`, `dwp1|…`), the same on Freenet and web; ☰ 👁 hides you.
- Shared world cards carry the explorer's position (they carried a layer coordinate), so links and ghosts land where they were shared.
- Battles and raids show: shakes and a red flash.
- Homes declare their whole size (parts, creatures, people, points), bounded by the contract: the leaderboard counts homes bigger than the 64 buildings and 64 creatures they can list; the Build dialog and the leaderboard say what others see. New galaxy contract (homes published before stay valid on the web).
- Breaking for the chat: the chat contract is new and starts empty (the galaxy is unchanged).

## 1.0.0

First release. A procedural galaxy of worlds from a seed, playable on Freenet or on a plain web server.

- Worlds, music and creatures generated from the seed; the same link gives everyone the same world.
- Exploration: walking, gathering, jumping over obstacles, entering buildings, walking into some worlds, Ilen's diary (100 pages), battles with elements and levels, a home with needs, trade, ships and expeditions.
- Multiplayer: colonies (proof of time), homes, sieges, common names, chat, and explorers who share a position show up as ghosts for 15 minutes. Same rules on Freenet (`contract/`, `chat/`) and web (`web/db.js`).
- Security: records are signed and checked by the contract or server, and again by every client before it is shown; hardened web server. See `SECURITY.md` for what is and is not defended.
- Colonies: each extra colony needs 1.5× more work than the last (enforced by the contracts), and a flag also costs ore and plants from your bag (client rule).
- Breaking for an existing galaxy: the blocklist is signed per contract (`dwb2|galaxy|…`, `dwb2|chat|…`), so the contracts (and their keys) are new and start empty.
