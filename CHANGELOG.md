# Changelog

## 1.0.0

First release. A procedural galaxy of worlds from a seed, playable on Freenet or on a plain web server.

- Worlds, music and creatures generated from the seed; the same link gives everyone the same world.
- Exploration: walking, gathering, jumping over obstacles, entering buildings, walking into some worlds, Ilen's diary (100 pages), battles with elements and levels, a home with needs, trade, ships and expeditions.
- Multiplayer: colonies (proof of time), homes, sieges, common names, chat, and explorers who share a position show up as ghosts for 15 minutes. Same rules on Freenet (`contract/`, `chat/`) and web (`web/db.js`).
- Security: records are signed and checked by the contract or server, and again by every client before it is shown; hardened web server. See `SECURITY.md` for what is and is not defended.
- Colonies: each extra colony needs 1.5× more work than the last (enforced by the contracts), and a flag also costs ore and plants from your bag (client rule).
- Breaking for an existing galaxy: the blocklist is signed per contract (`dwb2|galaxy|…`, `dwb2|chat|…`), so the contracts (and their keys) are new and start empty.
