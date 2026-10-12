// Player progress: discoveries, achievements, saved worlds, daily world. Pure logic on a
// plain object; index.html persists it in localStorage.
import { TRAITS, RARITA, REPERTI, hashSeed, rng, rngFrom, randomSeed } from './world.js';

// Every discoverable entry, as "trait:value".
export const ENTRIES = [
  ...Object.entries(TRAITS).flatMap(([k, t]) => Object.keys(t).map((v) => `${k}:${v}`)),
  'notte:true', 'anelli:true', 'mare:true',
  ...RARITA.map(([r]) => `rarità:${r}`),
  ...REPERTI.map((r) => `reperto:${r}`),
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
  ['Cercatore di reperti', 'Trova portale, monolite e scheletro', (st) => has(st, 'reperto', REPERTI) === REPERTI.length],
  ['Naturalista', 'Cataloga 10 specie', (st) => st.species.length >= 10],
  ['Tassonomo', 'Cataloga 50 specie', (st) => st.species.length >= 50],
  ['Criptozoologo', 'Trova una specie leggendaria', (st) => st.species.some((s) => s.rarity === 'leggendario')],
  ['Esploratore', 'Esplora 100 mondi', (st) => st.count >= 100],
  ['Costante', 'Missione del giorno 7 giorni di fila', (st) => st.daily.best >= 7],
];

export const emptyState = () => ({ seen: [], combos: [], count: 0, favs: [], species: [], stars: [], daily: { done: null, streak: 0, best: 0 } });

// Applies `change` to the state; returns the entries, combos and achievements it unlocked.
function discover(st, keys, combo, change = () => {}) {
  const before = ACHIEVEMENTS.filter(([, , ok]) => ok(st)).map(([n]) => n);
  const entries = keys.filter((k) => !st.seen.includes(k));
  st.seen.push(...entries);
  const combos = !combo || st.combos.includes(combo) ? [] : [combo];
  st.combos.push(...combos);
  change();
  const achievements = ACHIEVEMENTS.filter(([n, , ok]) => ok(st) && !before.includes(n)).map(([n]) => n);
  return { entries, combos, achievements };
}

// Records a visited world.
export const visit = (st, w) => discover(st,
  [...Object.entries(w.traits).filter(([, v]) => v !== false).map(([k, v]) => `${k}:${v}`), `rarità:${w.rarity}`],
  `${w.civ}@${w.era}`, () => {
    st.count++;
    // Visited stars, for the map. shortcut: capped list, switch to a Set-like index if it grows a lot.
    if (w.sector && !st.stars.includes(w.seed)) st.stars = [...st.stars, w.seed].slice(-5000);
  });

// Records a species seen while walking; `isNew` tells whether it entered the bestiary.
export function findSpecies(st, sp, w) {
  if (st.species.some((s) => s.id === sp.id)) return { isNew: false, achievements: [] };
  const news = discover(st, [], null, () => st.species.unshift({ id: sp.id, name: sp.name, rarity: sp.rarity, world: w.seed, worldName: w.name }));
  return { isNew: true, achievements: news.achievements };
}

// Records a relic seen while walking.
export const findRelic = (st, kind) => discover(st, [`reperto:${kind}`]);

export const isoDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// The daily world is a star on the map, the same for everyone that day.
export const dailySeed = (day) => randomSeed(rngFrom('giorno:' + day));

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
