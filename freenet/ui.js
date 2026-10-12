// Freenet game layer: viso sign-in, colonies (time on a planet, measured as proof of work), the
// leaderboard and progress kept in the node. index.html calls the returned hooks; it never imports
// this file unless a node serves the page.
import * as net from './net.js';
import { makeWorld } from '../world.js';
import { textOk, CHAT_BITS } from './chat.js';
import { newMiner, mineSome, minerScore, score, seconds, MAX_SCORE, HASHES_PER_SECOND, COLONY_BITS, validText } from './colony.js';

// Viso avatars as object URLs, loaded once per persona; until then a coloured dot stands in.
const avatars = new Map();
function avatar(persona, onReady) {
  if (!avatars.has(persona)) {
    avatars.set(persona, null);
    net.loadPersona(persona).then((p) => { if (p?.avatar) { avatars.set(persona, URL.createObjectURL(new Blob([p.avatar]))); onReady(); } });
  }
  return avatars.get(persona);
}
const fmt = (s) => (!isFinite(s) ? '—' : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${(s / 3600).toFixed(1)}h`);
const hueOf = (persona) => parseInt(persona.slice(0, 4), 16) % 360;
const storeKey = (seed, persona) => `mine:${seed.replaceAll('_', '-')}:${persona.slice(0, 16)}`;

/** `app`: { world(), st(), setSt(s), toast(lines), esc(s), refresh() } from index.html. */
export async function start(app) {
  let galaxy = { colonies: {} }, me = null, nick = '', miner = null, minerSeed = null, lastPublish = 0;
  let profile = null; // my Viso persona: { name, avatar, ante, bits }
  const level = () => profile?.bits ?? 0, anteHex = () => (profile?.ante ? [...profile.ante].map((b) => b.toString(16).padStart(2, '0')).join('') : '');
  const q = new URLSearchParams(location.search);
  // dev only: a faster honest rate, to test colonies without waiting minutes
  const rate = q.has('node') && q.get('rate') ? Number(q.get('rate')) : HASHES_PER_SECOND;

  const colonyOf = (seed) => galaxy.colonies?.[seed];
  const colScore = (seed, c) => score(seed, c.persona, c.nonces);
  const signBtn = document.getElementById('signBtn'), renameBtn = document.getElementById('renameBtn');

  async function refreshGalaxy() {
    try { galaxy = await net.loadGalaxy(); update(); app.refresh(); } catch (e) { console.warn('galaxy unavailable:', e); }
  }

  async function loadMiner() {
    const w = app.world();
    if (!me || !w.sector) { miner = null; minerSeed = null; return; }
    minerSeed = w.seed;
    const raw = await net.storeGet(storeKey(w.seed, me));
    if (minerSeed === w.seed) miner = raw ? JSON.parse(raw) : newMiner();
  }
  const saveMiner = () => miner && net.storePut(storeKey(minerSeed, me), JSON.stringify(miner));

  async function publish(name) {
    const w = app.world(), x = app.cam();
    const c = await net.publishColony(w.seed, { name, nick, x, nonces: [...miner.nonces], ante: anteHex() });
    galaxy.colonies[w.seed] = c; lastPublish = Date.now(); update(); app.refresh();
    return c;
  }

  // Background "time miner": runs while the planet is on screen; publishes when the work wins the planet.
  setInterval(() => {
    if (!miner || document.visibilityState !== 'visible' || minerSeed !== app.world().seed) return;
    mineSome(miner, minerSeed, me, Math.round(rate / 5));
  }, 200);
  setInterval(async () => {
    if (!miner) return;
    saveMiner();
    const seed = minerSeed, mine = minerScore(miner), col = colonyOf(seed);
    if (mine === null || mine > MAX_SCORE || !nick || level() < COLONY_BITS) return;
    const theirs = col && colScore(seed, col);
    try {
      if (!col) { await publish(colonyOf(seed)?.name ?? app.world().name); app.toast([`🚩 You colonized ${app.esc(app.world().name)}!`]); }
      else if (col.persona !== me && mine < theirs) {
        await publish(app.world().name);
        app.toast([`🚩 You spent more time here than ${app.esc(col.nick)}: ${app.esc(app.world().name)} is now your colony!`]);
      } else if (col.persona === me && mine * 5n < theirs * 4n && Date.now() - lastPublish > 60_000) await publish(col.name); // defend: 25% more time
    } catch (e) { console.warn('colony publish failed:', e); }
  }, 10_000);

  async function signedIn(persona) {
    me = persona;
    profile = await net.loadPersona(persona);
    // the Viso profile name, else a name chosen here
    nick = [...(profile?.name ?? '')].slice(0, 24).join('').trim().replaceAll('|', '/') || (await net.storeGet('nick')) || '';
    while (!nick) {
      const n = prompt('Your explorer name (shown on your colonies and the leaderboard, 1-24 characters):', '');
      if (n === null) break;
      if (validText('x', n.trim())) { nick = n.trim(); await net.storePut('nick', nick); }
    }
    await loadMiner(); update();
  }

  function update() {
    signBtn.hidden = !!me;
    const w = app.world(), col = colonyOf(w.seed);
    renameBtn.hidden = !(me && col && col.persona === me);
  }

  signBtn.hidden = false;
  signBtn.onclick = async () => { try { await net.startSignIn(); } catch (e) { app.toast([app.esc(e.message)]); } };
  renameBtn.onclick = async () => {
    const col = colonyOf(app.world().seed), name = prompt('Rename your planet (1-32 characters):', col?.name ?? '');
    if (!name || !validText(name.trim(), 'x')) return;
    try { await publish(name.trim()); app.toast([`Renamed to ${app.esc(name.trim())}.`]); } catch (e) { app.toast([app.esc(e.message)]); }
  };

  // Viso callback
  if (q.has('viso')) {
    try { await signedIn(await net.finishSignIn(q)); app.toast(['Signed in with Viso.']); }
    catch (e) { app.toast([app.esc(e.message)]); }
    for (const k of ['viso', 'pk', 'sig', 'challenge', 'ts']) q.delete(k);
    history.replaceState(null, '', location.pathname + (q.size ? '?' + q : '') + location.hash);
  } else {
    const s = await net.session();
    if (s) await signedIn(s.persona);
  }

  // Game progress lives in the node too, since the sandboxed page may have no localStorage.
  const saved = await net.storeGet('progress');
  if (saved) { const p = JSON.parse(saved); if ((p.count ?? 0) > (app.st().count ?? 0)) app.setSt(p); }
  setInterval(() => net.storePut('progress', JSON.stringify(app.st())), 15_000);

  net.onUpdate(refreshGalaxy);
  await refreshGalaxy();
  update();

  // ---------------------------------------------------------------- global chat (hideable)
  const chatBtn = document.getElementById('chatBtn'), panel = document.getElementById('chat');
  const log = document.getElementById('chatLog'), form = document.getElementById('chatForm'), input = document.getElementById('chatText');
  let chat = { messages: {} }, seen = 0, open = false;
  try { open = localStorage.getItem('dw-chat-open') === '1'; } catch { /* sandbox */ }
  const visible = () => Object.values(chat.messages ?? {}).filter((m) => m.ts < Date.now() + 5 * 60_000).sort((a, b) => a.ts - b.ts).slice(-100);
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function card(world) {
    const [seed, pos] = world.split('@'), w = makeWorld(seed), col = colonyOf(seed);
    return `<a class="card" href="#${seed}${pos ? '@' + pos : ''}">🌍 <b>${app.esc(col?.name ?? w.name)}</b> <span class="badge ${w.rarity}">${w.rarity}</span><br><small>${w.era} · ${w.civ} · ${w.fauna}${w.region ? ' · ' + w.region : ''}${col ? ' · colony of ' + app.esc(col.nick) : ''}</small></a>`;
  }
  function renderChat() {
    const msgs = visible(), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const av = (p) => { const u = avatar(p, renderChat); return u ? `<img class="av" src="${u}" alt="">` : `<span class="av" style="background:hsl(${hueOf(p)} 70% 55%)"></span>`; };
    log.innerHTML = msgs.map((m) => `<li>${av(m.persona)}<b style="color:hsl(${hueOf(m.persona)} 80% 70%)">${app.esc(m.nick)}</b> <small>${time(m.ts)}</small><br>${app.esc(m.text).replace(/\n/g, '<br>')}${m.world ? card(m.world) : ''}</li>`).join('')
      || '<li><small>No messages yet. Say hello, or share the world you are on.</small></li>';
    if (atBottom || !open) log.scrollTop = log.scrollHeight;
    if (open) seen = msgs.length;
    const unread = Math.max(0, msgs.length - seen);
    chatBtn.textContent = unread ? `💬 Chat (${unread})` : '💬 Chat';
  }
  function setOpen(o) {
    open = o; panel.hidden = !o; chatBtn.setAttribute('aria-expanded', o);
    try { localStorage.setItem('dw-chat-open', o ? '1' : '0'); } catch { /* sandbox */ }
    renderChat(); if (o) input.focus();
  }
  async function refreshChat() { try { chat = await net.loadChat(); renderChat(); } catch (e) { console.warn('chat unavailable:', e); } }
  async function post(text, world) {
    if (!me || !nick) return app.toast(['Sign in to chat.']);
    if (level() < CHAT_BITS) return app.toast([`Your Viso persona level is ${level()}; chatting needs ${CHAT_BITS}. Raise it in Viso, then sign in again.`]);
    if (!textOk(text)) return app.toast(['Messages are 1-280 characters.']);
    form.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const m = await net.postMessage(text, world, nick, anteHex());
      chat.messages[m.sig] = m; input.value = ''; renderChat(); log.scrollTop = log.scrollHeight;
    } catch (e) { app.toast([app.esc(e.message)]); }
    finally { form.querySelectorAll('button').forEach((b) => (b.disabled = false)); }
  }
  chatBtn.hidden = false;
  chatBtn.onclick = () => setOpen(!open);
  document.getElementById('chatHide').onclick = () => setOpen(false);
  form.onsubmit = (e) => { e.preventDefault(); post(input.value.trim(), ''); };
  document.getElementById('chatShare').onclick = () => {
    const w = app.world();
    if (!w.sector) return app.toast(['Only worlds on the star map can be shared.']);
    post(input.value.trim() || `Look at ${colonyOf(w.seed)?.name ?? w.name}!`, `${w.seed}@${app.cam().toFixed(1)}`);
  };
  log.addEventListener('click', (e) => { if (e.target.closest('a.card') && innerWidth < 640) setOpen(false); });
  net.onUpdate(refreshChat);
  await refreshChat();
  setOpen(open);

  return {
    onWorld: () => { saveMiner(); loadMiner().then(update); update(); },
    planetName: (w) => colonyOf(w.seed)?.name ?? w.name,
    status(w) {
      const col = colonyOf(w.seed), mine = miner && minerSeed === w.seed ? minerScore(miner) : null;
      const yours = mine === null ? 0 : seconds(mine);
      let s = col ? `${app.esc(w.name)}, colony of ${app.esc(col.nick)}${col.persona === me ? ' (you)' : ''} · ${fmt(seconds(colScore(w.seed, col)))} here · ` : (w.sector ? 'uncolonized · ' : '');
      if (me && w.sector && !(col && col.persona === me)) s += `your time ${fmt(yours)} / ${fmt(col ? seconds(colScore(w.seed, col)) : seconds(MAX_SCORE))} to colonize · `;
      if (me && w.sector && level() < COLONY_BITS) s += `Viso level ${level()}/${COLONY_BITS}: raise it in Viso to colonize · `;
      if (!me && w.sector) s += 'sign in to colonize · ';
      return s;
    },
    /** Beacon of the planet's colony: position in layer coordinates, colour, label. */
    beacon: (w) => { const c = colonyOf(w.seed); return c && { x: c.x / 100, hue: hueOf(c.persona), label: c.nick }; },
    colonyOf,
    atlasHtml() {
      const rows = new Map();
      for (const [seed, c] of Object.entries(galaxy.colonies ?? {})) {
        const r = rows.get(c.persona) ?? { nick: c.nick, n: 0, t: 0, persona: c.persona };
        r.n++; r.t += seconds(colScore(seed, c)); rows.set(c.persona, r);
      }
      const top = [...rows.values()].sort((a, b) => b.n - a.n || b.t - a.t).slice(0, 20);
      const mine = Object.entries(galaxy.colonies ?? {}).filter(([, c]) => c.persona === me);
      const av = (p) => { const u = avatar(p, () => {}); return u ? `<img class="av" src="${u}" alt="">` : `<span class="av" style="background:hsl(${hueOf(p)} 70% 55%)"></span>`; };
      return `<h3>Explorer</h3><p>${me ? `${av(me)}${app.esc(nick)} <small style="display:inline">${net.personaName(me).slice(0, 10)}… · Viso level ${level()} (colonies need ${COLONY_BITS}, chat ${CHAT_BITS})</small> <button id="signOutBtn">Sign out</button>` : 'Not signed in: sign in with Viso to colonize planets and chat.'}</p>
        <h3>Your colonies <small>${mine.length}</small></h3>
        ${mine.length ? `<ul>${mine.map(([seed, c]) => `<li><a href="#${seed}">${app.esc(c.name)}</a> <small style="display:inline">${fmt(seconds(colScore(seed, c)))}</small></li>`).join('')}</ul>` : '<p><small>Stay on a planet for a few minutes to colonize it.</small></p>'}
        <h3>Leaderboard <small>${Object.keys(galaxy.colonies ?? {}).length} colonies</small></h3>
        ${top.length ? `<ol>${top.map((r) => `<li>${av(r.persona)}${r.persona === me ? '<b>' : ''}${app.esc(r.nick)}${r.persona === me ? '</b>' : ''} — ${r.n} ${r.n === 1 ? 'colony' : 'colonies'}, ${fmt(r.t)}</li>`).join('')}</ol>` : '<p><small>No colonies yet.</small></p>'}
        ${q.has('admin') ? '<button id="blockBtn">Admin: block stars or personas</button>' : ''}`;
    },
    bindAtlas(dlg) {
      const so = dlg.querySelector('#signOutBtn');
      if (so) so.onclick = async () => {
        saveMiner(); me = null; nick = ''; profile = null; miner = null; minerSeed = null; // stop the miner before the session goes
        await net.signOut(); await net.storePut('nick', '');
        update(); app.refresh(); dlg.close(); app.toast(['Signed out.']);
      };
      const bb = dlg.querySelector('#blockBtn');
      if (bb) bb.onclick = async () => {
        const secret = prompt('Admin secret key (hex):'), list = prompt('Stars or persona keys to hide, comma-separated (replaces the list):', (galaxy.blocked?.list ?? []).join(','));
        if (secret && list !== null) try { await net.block(secret.trim(), list.split(',').map((x) => x.trim()).filter(Boolean)); app.toast(['Blocklist sent.']); } catch (e) { app.toast([app.esc(e.message)]); }
      };
    },
  };
}
