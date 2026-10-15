# Rules for AI agents

## Keep the Freenet and web versions aligned

The game ships in two multiplayer versions that must always behave the same:

- **Freenet**: `freenet/net.js` + Rust contracts `contract/` (galaxy) and `chat/` (chat).
- **Web**: `web/net.js` + `web/db.js` (the same contract rules over SQLite) + `web/server.js`.

`freenet/ui.js` and the game files are shared by both. Every change that touches one side must land on the other in the same change:

- A new or changed field, record, limit or check in `contract/src/lib.rs` or `chat/src/lib.rs` → the same in `web/db.js` (and its signed message in `freenet/colony.js` / `freenet/chat.js`, which both sides use).
- A new or changed export in `freenet/net.js` used by `freenet/ui.js` → the same export in `web/net.js` (or `null` when the web version cannot offer it, as with Viso sign-in, and `freenet/ui.js` must handle that).
- A change in merge rules (who wins, pruning, blocklist) → mirrored in both.
- Tests: `npm test` covers both (`freenet/net.test.mjs`, `web/db.test.mjs`); extend the one on the other side too. Run `npm run build` and `npm run build:web`.
- README: document the feature for both versions, or say why one cannot have it.

If a feature truly cannot exist on one side, say so in the README and in the PR.

## Tell players what changed

Every change players can notice adds an entry at the top of the 📰 Updates dialog (`<dialog id="updates">` in `index.html`), in the same change: a dated `<h3>` title and a few plain bullets, in players' words (what they will see or do, not how it is built), newest first. `CHANGELOG.md` stays the technical record.
