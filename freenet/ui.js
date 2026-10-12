// Freenet game layer: viso sign-in, colonies (time on a planet, measured as proof of work), the
// leaderboard and progress kept in the node. index.html calls the returned hooks; it never imports
// this file unless a node serves the page.
import * as net from './net.js';
import { makeWorld, colonists, makeSpecies } from '../world.js';
import { drawCreature } from '../draw.js';
import { textOk, CHAT_BITS } from './chat.js';
import { grindAnte, anteBits } from './viso.js';
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
  let peopleCache = {};
  const colScore = (seed, c) => score(seed, c.persona, c.nonces);
  const signBtn = document.getElementById('signBtn'), plantBtn = document.getElementById('plantBtn');

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

  // Planets keep their generated name; the flag goes where the explorer stands (or stays put when defending).
  async function publish(x = app.cam()) {
    const w = app.world();
    const c = await net.publishColony(w.seed, { name: w.name, nick, x, nonces: [...miner.nonces], ante: anteHex() });
    galaxy.colonies[w.seed] = c; lastPublish = Date.now(); update(); app.refresh();
    return c;
  }

  // Background "time miner": runs while the planet is on screen. When the work wins the planet, the
  // Plant flag button appears; a colonist's own extra time is published quietly to defend the planet.
  setInterval(() => {
    if (!miner || document.visibilityState !== 'visible' || minerSeed !== app.world().seed) return;
    mineSome(miner, minerSeed, me, Math.round(rate / 5));
  }, 200);
  setInterval(async () => {
    if (!miner) return;
    saveMiner();
    const seed = minerSeed, mine = minerScore(miner), col = colonyOf(seed);
    if (mine === null || mine > MAX_SCORE || !nick || level() < COLONY_BITS) return;
    try {
      if (col?.persona === me && mine * 5n < colScore(seed, col) * 4n && Date.now() - lastPublish > 60_000) await publish(col.x / 100); // 25% more time
    } catch (e) { console.warn('colony publish failed:', e); }
  }, 10_000);

  /** Can the signed-in explorer plant a flag here now (enough time, level, and more time than the colonist)? */
  function canPlant() {
    const w = app.world(), col = colonyOf(w.seed), mine = miner && minerSeed === w.seed ? minerScore(miner) : null;
    return !!(me && nick && mine !== null && mine <= MAX_SCORE && level() >= COLONY_BITS && (!col || (col.persona !== me && mine < colScore(w.seed, col))));
  }
  setInterval(() => {
    const ready = canPlant();
    plantBtn.hidden = !ready;
    if (ready) plantBtn.textContent = colonyOf(app.world().seed) ? '🚩 Take this planet' : '🚩 Plant flag';
  }, 1000);
  plantBtn.onclick = async () => {
    if (!canPlant()) return;
    const w = app.world(), col = colonyOf(w.seed);
    plantBtn.disabled = true;
    try {
      await publish();
      app.toast([col ? `🚩 You spent more time here than ${app.esc(col.nick)}: ${app.esc(w.name)} is now your colony!` : `🚩 Your flag flies on ${app.esc(w.name)}!`]);
    } catch (e) { app.toast([app.esc(e.message)]); }
    finally { plantBtn.disabled = false; }
  };

  async function signedIn(persona) {
    me = persona;
    profile = await net.loadPersona(persona);
    // A key held here has no Viso contract: build its level here once, as Viso would.
    const sk = await net.localKey(persona);
    if (sk && !(profile?.bits >= COLONY_BITS)) {
      const slotKey = `ante:${persona.slice(0, 16)}`, unhex = (h) => Uint8Array.from(h.match(/../g).map((x) => parseInt(x, 16)));
      let ante = await net.storeGet(slotKey);
      if (!ante) {
        const bytes = await grindAnte(unhex(sk), COLONY_BITS, (n) => app.toast([`Building your explorer level… ${Math.min(99, Math.round((100 * n) / 2 ** COLONY_BITS))}%`]));
        ante = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
        await net.storePut(slotKey, ante);
        app.toast([`Explorer level ${anteBits(unhex(persona), bytes)} reached.`]);
      }
      const bytes = unhex(ante);
      profile = { name: profile?.name ?? '', avatar: profile?.avatar ?? null, ante: bytes, bits: anteBits(unhex(persona), bytes) };
    }
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
  }

  signBtn.hidden = false;
  const signDlg = document.getElementById('signDlg');
  signBtn.onclick = () => signDlg.showModal();
  document.getElementById('signClose').onclick = () => signDlg.close();
  document.getElementById('signViso').onclick = async () => { try { await net.startSignIn(); } catch (e) { app.toast([app.esc(e.message)]); } };
  const withKey = async (sk) => {
    signDlg.close();
    try { await signedIn(await net.createLocalIdentity(sk)); app.toast(['Signed in. Back up your key from the Atlas.']); } catch (e) { app.toast([app.esc(e.message)]); }
  };
  document.getElementById('signNew').onclick = () => withKey();
  document.getElementById('signImport').onclick = () => {
    const k = prompt('Your secret key (64 hexadecimal characters):')?.replace(/\s/g, '').toLowerCase();
    if (k === undefined) return;
    if (!/^[0-9a-f]{64}$/.test(k)) return app.toast(['A key is 64 hexadecimal characters.']);
    withKey(k);
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

  // ---------------------------------------------------------------- leaderboard
  const lbBtn = document.getElementById('lbBtn'), lbDlg = document.getElementById('lbDlg');
  function renderLeaderboard() {
    const rows = new Map();
    for (const [seed, c] of Object.entries(galaxy.colonies ?? {})) {
      const r = rows.get(c.persona) ?? { nick: c.nick, persona: c.persona, t: 0, planets: [] };
      const t = seconds(colScore(seed, c));
      r.t += t; r.planets.push({ seed, name: makeWorld(seed).name, t }); rows.set(c.persona, r);
    }
    const all = [...rows.values()].sort((a, b) => b.planets.length - a.planets.length || b.t - a.t);
    const av = (p) => { const u = avatar(p, renderLeaderboard); return u ? `<img class="av" src="${u}" alt="">` : `<span class="av" style="background:hsl(${hueOf(p)} 70% 55%)"></span>`; };
    const row = (r, rank) => `<li value="${rank}"${r.persona === me ? ' class="me"' : ''}><details><summary>${av(r.persona)}<b>${app.esc(r.nick)}</b>${r.persona === me ? ' (you)' : ''} — ${r.planets.length} ${r.planets.length === 1 ? 'colony' : 'colonies'}, ${fmt(r.t)}</summary>
      <ul>${r.planets.sort((a, b) => b.t - a.t).map((p) => `<li><a href="#${p.seed}">${app.esc(p.name)}</a> <small style="display:inline">${fmt(p.t)}</small></li>`).join('')}</ul></details></li>`;
    const mine = all.findIndex((r) => r.persona === me);
    document.getElementById('lbBody').innerHTML = all.length
      ? `<p><small>${all.length} explorers · ${Object.keys(galaxy.colonies ?? {}).length} colonies · ranked by colonies, then time. Open a name to see their planets.</small></p>
        <ol>${all.slice(0, 20).map((r, i) => row(r, i + 1)).join('')}</ol>
        ${mine >= 20 ? `<p>…</p><ol>${row(all[mine], mine + 1)}</ol>` : ''}
        ${me && mine < 0 ? '<p><small>You have no colony yet: stay on a planet for a few minutes.</small></p>' : ''}`
      : '<p><small>No colonies yet. Stay on a planet for a few minutes to found the first one.</small></p>';
    lbDlg.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => lbDlg.close()));
  }
  lbBtn.hidden = false;
  lbBtn.onclick = () => { renderLeaderboard(); lbDlg.showModal(); };
  document.getElementById('lbClose').onclick = () => lbDlg.close();
  net.onUpdate(() => { if (lbDlg.open) setTimeout(renderLeaderboard, 500); });


  const chatBtn = document.getElementById('chatBtn'), panel = document.getElementById('chat');
  const log = document.getElementById('chatLog'), form = document.getElementById('chatForm'), input = document.getElementById('chatText');
  let chat = { messages: {} }, seen = 0, open = false;
  try { open = localStorage.getItem('dw-chat-open') === '1'; } catch { /* sandbox */ }
  const visible = () => Object.values(chat.messages ?? {}).filter((m) => m.ts < Date.now() + 5 * 60_000).sort((a, b) => a.ts - b.ts).slice(-100);
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function card(world) {
    const [seed, pos] = world.split('@'), w = makeWorld(seed), col = colonyOf(seed);
    return `<a class="card" href="#${seed}${pos ? '@' + pos : ''}">🌍 <b>${app.esc(w.name)}</b> <span class="badge ${w.rarity}">${w.rarity}</span><br><small>${w.era} · ${w.civ} · ${w.fauna}${w.region ? ' · ' + w.region : ''}${col ? ' · colony of ' + app.esc(col.nick) : ''}</small></a>`;
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
    post(input.value.trim() || `Look at ${w.name}!`, `${w.seed}@${app.cam().toFixed(1)}`);
  };
  log.addEventListener('click', (e) => { if (e.target.closest('a.card') && innerWidth < 640) setOpen(false); });
  net.onUpdate(refreshChat);
  await refreshChat();
  setOpen(open);

  return {
    onWorld: () => { saveMiner(); loadMiner().then(update); update(); },
    status(w) {
      const col = colonyOf(w.seed), mine = miner && minerSeed === w.seed ? minerScore(miner) : null;
      const yours = mine === null ? 0 : seconds(mine);
      let s = col ? `${app.esc(w.name)}, colony of ${app.esc(col.nick)}${col.persona === me ? ' (you)' : ''} · ${fmt(seconds(colScore(w.seed, col)))} here · ` : (w.sector ? 'uncolonized · ' : '');
      if (me && w.sector && !(col && col.persona === me)) s += `your time ${fmt(yours)} / ${fmt(col ? seconds(colScore(w.seed, col)) : seconds(MAX_SCORE))} to colonize · `;
      if (canPlant()) s += '🚩 you can plant your flag · ';
      if (me && w.sector && level() < COLONY_BITS) s += `Viso level ${level()}/${COLONY_BITS}: raise it in Viso to colonize · `;
      if (!me && w.sector) s += 'sign in to colonize · ';
      return s;
    },
    /** Beacon of the planet's colony: position in layer coordinates, colour, label. */
    /** The planet's colony as drawn: flag position, colour, label and the colonist's people around it. */
    beacon(w) {
      const c = colonyOf(w.seed);
      if (!c) return null;
      const key = `${w.seed}|${c.persona}|${c.x}|${c.nonces}`;
      if (peopleCache.key !== key) peopleCache = { key, people: colonists(c.persona, w.seed, c.x / 100, seconds(colScore(w.seed, c)) / 60) };
      return { x: c.x / 100, hue: hueOf(c.persona), label: c.nick, people: peopleCache.people };
    },
    colonyOf,
    atlasHtml() {
      const mine = Object.entries(galaxy.colonies ?? {}).filter(([, c]) => c.persona === me);
      const av = (p) => { const u = avatar(p, () => {}); return u ? `<img class="av" src="${u}" alt="">` : `<span class="av" style="background:hsl(${hueOf(p)} 70% 55%)"></span>`; };
      return `<h3>Explorer</h3><p>${me ? `${av(me)}${app.esc(nick)} <small style="display:inline">${net.personaName(me).slice(0, 10)}… · Viso level ${level()} (colonies need ${COLONY_BITS}, chat ${CHAT_BITS})</small> <button id="signOutBtn">Sign out</button> <button id="backupBtn" hidden>Back up key</button>` : 'Not signed in: sign in to colonize planets and chat.'}</p>
        ${me ? `<p><canvas id="peoplePortrait" class="portrait" width="72" height="48" aria-hidden="true"></canvas>Your people: <b>${app.esc(makeSpecies(`people:${me}`, 0, false).name)}</b> <small style="display:inline">they settle around every flag you plant</small></p>` : ''}
        <h3>Your colonies <small>${mine.length}</small></h3>
        ${mine.length ? `<ul>${mine.map(([seed, c]) => `<li><a href="#${seed}">${app.esc(makeWorld(seed).name)}</a> <small style="display:inline">${fmt(seconds(colScore(seed, c)))}</small></li>`).join('')}</ul>` : '<p><small>Stay on a planet for a few minutes to colonize it.</small></p>'}
        ${q.has('admin') ? '<button id="blockBtn">Admin: block stars or personas</button>' : ''}`;
    },
    bindAtlas(dlg) {
      const pc = dlg.querySelector('#peoplePortrait');
      if (pc && me) drawCreature(pc.getContext('2d'), { kind: 'species', dna: makeSpecies(`people:${me}`, 0, false), speed: 1, seed: 1 }, 36, 44, 38,
        { color: `hsl(${hueOf(me)} 45% 45%)`, accent: `hsl(${hueOf(me)} 90% 70%)`, style: 'classic', lights: false, t: 0 });
      const bk = dlg.querySelector('#backupBtn');
      net.localKey(me ?? '').then((k) => { if (bk && k) { bk.hidden = false; bk.onclick = () => prompt('Your explorer key. Keep it somewhere safe: whoever has it plays as you, and without it you cannot get this explorer back.', k); } });
      const so = dlg.querySelector('#signOutBtn');
      if (so) so.onclick = async () => {
        if (await net.localKey(me) && !confirm('Signing out forgets this key on this node. Did you back it up?')) return;
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
