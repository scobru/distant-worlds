// Player progress: discoveries, achievements, saved worlds, daily world. Pure logic on a
// plain object; index.html persists it in localStorage.
import { TRAITS, RARITA, VERSION, hashSeed, rng } from './world.js';

// Every discoverable entry, as "trait:value".
export const ENTRIES = [
  ...Object.entries(TRAITS).flatMap(([k, t]) => Object.keys(t).map((v) => `${k}:${v}`)),
  'notte:true', 'anelli:true', 'mare:true',
  ...RARITA.map(([r]) => `rarità:${r}`),
];

// Second tier: who lived in which era. Rare pairs (aliens in the far future) take a while.
export const COMBOS = Object.keys(TRAITS.civ).flatMap((c) => Object.keys(TRAITS.era).map((e) => `${c}@${e}`));

const has = (st, k, vals) => vals.filter((v) => st.seen.includes(`${k}:${v}`)).length;
export const ACHIEVEMENTS = [
  ['Viaggiatore del tempo', 'Visita tutte le epoche', (st) => has(st, 'era', Object.keys(TRAITS.era)) === 6],
  ['Zoologo', 'Incontra ogni fauna', (st) => has(st, 'fauna', Object.keys(TRAITS.fauna)) === 6],
  ['Botanico', 'Trova ogni flora', (st) => has(st, 'flora', Object.keys(TRAITS.flora)) === 5],
  ['Esteta', 'Vedi tutti gli stili', (st) => has(st, 'style', Object.keys(TRAITS.style)) === 5],
  ['Archeologo', 'Rovine di 4 epoche diverse', (st) => st.combos.filter((c) => c.startsWith('rovine@')).length >= 4],
  ['Storico', 'Tutte le civiltà in tutte le epoche', (st) => COMBOS.every((c) => st.combos.includes(c))],
  ['Primo contatto', 'Trova gli alieni', (st) => st.seen.includes('civ:alieni')],
  ['Cacciatore di leggende', 'Trova un mondo leggendario', (st) => st.seen.includes('rarità:leggendario')],
  ['Esploratore', 'Esplora 100 mondi', (st) => st.count >= 100],
  ['Costante', 'Missione del giorno 7 giorni di fila', (st) => st.daily.best >= 7],
];

export const emptyState = () => ({ seen: [], combos: [], count: 0, favs: [], daily: { done: null, streak: 0, best: 0 } });

// Records a visited world; returns what is new (entries, combos and achievement names).
export function visit(st, w) {
  const before = ACHIEVEMENTS.filter(([, , ok]) => ok(st)).map(([n]) => n);
  const keys = [...Object.entries(w.traits).filter(([, v]) => v !== false).map(([k, v]) => `${k}:${v}`), `rarità:${w.rarity}`];
  const entries = keys.filter((k) => !st.seen.includes(k));
  st.seen.push(...entries);
  const combo = `${w.civ}@${w.era}`, combos = st.combos.includes(combo) ? [] : [combo];
  st.combos.push(...combos);
  st.count++;
  const achievements = ACHIEVEMENTS.filter(([n, , ok]) => ok(st) && !before.includes(n)).map(([n]) => n);
  return { entries, combos, achievements };
}

export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dailySeed = (day) => `${VERSION}-giorno-${day}`;

// Two trait constraints derived from the date, rare enough to hunt for but findable
// (at least ~1 world in 40).
export function mission(day) {
  const r = rng(hashSeed('missione:' + day)), keys = Object.keys(TRAITS);
  for (;;) {
    const k1 = keys[Math.floor(r() * keys.length)], k2 = keys[Math.floor(r() * keys.length)];
    if (k1 === k2) continue;
    const pick = (k) => { const t = Object.entries(TRAITS[k]).slice(1); const [v, w] = t[Math.floor(r() * t.length)]; return [k, v, w / Object.values(TRAITS[k]).reduce((a, b) => a + b)]; };
    const a = pick(k1), b = pick(k2);
    if (a[2] * b[2] >= 1 / 40) return [a, b].map(([k, v]) => [k, v]);
  }
}
export const matches = (w, m) => m.every(([k, v]) => w.traits[k] === v);

// Marks today's mission done (if the world fits) and updates the streak.
export function checkMission(st, w, day, yesterday) {
  if (st.daily.done === day || !matches(w, mission(day))) return false;
  st.daily.streak = st.daily.done === yesterday ? st.daily.streak + 1 : 1;
  st.daily.best = Math.max(st.daily.best, st.daily.streak);
  st.daily.done = day;
  return true;
}
