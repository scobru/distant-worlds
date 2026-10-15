# Changelog

## Unreleased

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
