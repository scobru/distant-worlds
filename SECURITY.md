# Security notes

Distant Worlds runs on clients that can be modified, so it cannot stop cheating. It limits what a cheat gains and makes
it cost something. This file says what is trusted, what was reviewed, and what is open.

## What is trusted

- **Private progress** (bag, fuel, atlas, achievements) lives in the browser (or the node's store). Editing it only
  changes your own game; nothing here is defended.
- **Public records** (colonies, homes, sieges, names, chat) are signed by the explorer's delegated app key, carry a
  Viso level (proof of work) and are checked by the contract (Freenet) or `web/db.js` (web) before they are kept.
  The checks are in `freenet/check.js` (web, client) and `contract/`, `chat/` (Rust); they must stay equal.
- **The client checks what it reads** (`freenet/ui.js`, `sound`): a record is verified with the same rules before it is
  shown or acted on, so a server that lies (or a bug in it) cannot make an explorer see something unsigned or lose a
  building to a forged siege.

## Review of the web version (what was read)

Read in full: `web/server.js`, `web/db.js`, `web/net.js`, every place of `index.html` and `freenet/ui.js` that puts
text from other explorers into the page (all of them go through `esc`, nothing found). Not read line by line: the Rust
contracts and the Freenet node side.

Fixed with this review:

| # | Severity | Finding | Now |
| - | - | - | - |
| 1 | medium | The client showed whatever the server returned: a forged home, flag, name or message, or a raid that damages your home, would be taken as real. | Every record is checked again before it is shown or acted on (`sound`); a forged home leaves the leaderboard. |
| 2 | medium | No limits on `POST` (each record costs three signature checks and a pass over a table) or on event streams: a cheap way to exhaust CPU and memory. | Token buckets per client, caps on streams, 64 KB bodies, 50 records per delta, request timeouts, slow stream clients dropped. |
| 3 | low | No security headers: framing, sniffing and injected scripts were not restricted. | CSP (own origin only), `frame-ancestors 'none'`, `nosniff`, `no-referrer`, a permissions policy. |
| 4 | low | `GET /api/galaxy` sent the whole state uncompressed to anyone, on every change. | Compressed once per change. |
| 5 | low | The blocklist message had no separation between the galaxy and the chat: a list signed for one could be replayed on the other. | Signed as `dwb2\|galaxy\|ts\|list` and `dwb2\|chat\|ts\|list` (a new galaxy, made for v1). |
| 6 | medium | Colonies cost nothing beyond the first minutes: one explorer could hold any number. | A persona's k-th colony needs 1.5^k times the minimum work, enforced by the contract and `web/db.js` (not by the client). Bag resources stay a client-side cost only: they are private and cannot be checked. |

Open (documented, not fixed):

- **Pre-mined colonies.** The proof of work is bound to the planet and the persona, not to a moment, so work can be
  done in advance for many planets. It measures work, not time (already in the README).
- **Self-declared times.** Names go to the earliest declared time (it can be backdated) and chat and presence times are the author's.
- **Presence is public.** Whoever plays signed in tells everyone the planet and spot they are on (every 20 s to a minute) unless they turn off ☰ 👁. A presence with a time in the future stays at the top for its persona (only that persona's own record, and the cap of 100 bounds how many such records a crowd of personas can pin).
- **Homes are self-declared**: resources are gathered in the browser, so a bigger home can be published (at most 64
  buildings and 64 animals). A cap tied to the persona's Viso level was considered and left out: the level most players
  hold (20 bits) would then limit them to a small home, which hurts honest play more than it stops a cheat that only
  inflates what others see. A proof of work proportional to growth would need a chain of homes; not done.
  A home also declares its whole size (parts, creatures, people, points) for the leaderboard; the contract only bounds
  it (see `size_ok`), so a modified client can climb the leaderboard up to those bounds. Fights (defence in sieges)
  read only what the home lists, so the declared size cannot make a home harder to besiege.
- **Sieges are applied by the defender's client**, which can ignore them (and republish an intact home). Deriving the
  damage from the public raids is not enough while the home itself is self-declared; the contract would have to refuse a
  home that ignores the raids against it. Left open.
- **Each accepted write scans whole tables** (`cap`, the purge loops). The rate limit bounds it; an indexed query would
  remove it.
- **The web key sits in `localStorage` in the clear.** A script injected into the page could read it; the CSP and the
  escaping are what stand in the way. A passphrase on the exported backup would help.
- **The web server's operator can omit or delay records** (not forge them: clients verify), and holds the admin key
  for the blocklist.

Changing a rule in the contracts (a limit, a signed message) makes a new, empty galaxy: group such changes.

## Reporting

Open an issue, or write to the maintainer, with the steps to reproduce. Do not publish a way to break a live galaxy before it is fixed.
