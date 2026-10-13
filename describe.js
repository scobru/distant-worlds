// What the explorer is pointing at: a title and a few lines for the hover card.
const STRUCT = {
  pyramid: 'Pyramid', temple: 'Temple', obelisk: 'Obelisk', castle: 'Castle', house: 'House', windmill: 'Windmill',
  factory: 'Factory', block: 'Tower block', antenna: 'Antenna', tower: 'Sky tower', dome: 'Dome', arch: 'Megastructure arch',
  spire: 'Alien spire', orb: 'Glowing orb', pods: 'Alien pods',
  pagoda: 'Pagoda', torii: 'Torii gate', minka: 'Minka house', longhouse: 'Longhouse', stavechurch: 'Stave church', runestone: 'Rune stone',
  mosque: 'Domed mosque', mudhouse: 'Mud-brick house', steppyramid: 'Step pyramid', stilthut: 'Stilt hut', totem: 'Totem',
  saloon: 'Saloon', watertower: 'Water tower', igloo: 'Igloo', lighthouse: 'Lighthouse', wreck: 'Car wreck', shack: 'Scrap shack',
  brokentower: 'Broken skyscraper', bunker: 'Bunker', watchtower: 'Watchtower', tank: 'Tank', searchlight: 'Searchlight',
};
const FLORA = {
  forest: 'Broadleaf tree', conifers: 'Conifer', crystals: 'Crystal cluster', mushrooms: 'Giant mushroom',
  blossoms: 'Blossom tree', bamboo: 'Bamboo grove', palms: 'Palm', cacti: 'Cactus', deadwood: 'Dead tree',
};
const RELIC = {
  portal: 'Glows with the light of another world.', monolith: 'Nobody knows who placed it here.', skeleton: 'The bones of something enormous.',
};
const FLYER = { flock: ['Flock of birds', 'They never land.'], jellyfish: ['Sky jellyfish', 'Drifts on warm currents.'], whale: ['Flying whale', 'Sings below the clouds.'] };
const parts = (d) => [`${d.legs} legs`, d.neck === 'none' ? 'no neck' : `${d.neck} neck`, `${d.head} head`, d.extra === 'none' ? '' : d.extra, d.tail === 'none' ? 'no tail' : `${d.tail} tail`, d.pattern].filter(Boolean).join(' · ');
const hint = (e, verb) => e.reach === undefined ? '' : e.reach ? `Click (or press E) to ${verb} it.` : `Walk closer to ${verb} it.`;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** `e`: { type: 'thing' | 'walker' | 'flyer' | 'beacon', ...the drawn entity }; `w`: the world;
 *  `known`: { relic(kind), species(id) } — whether the explorer already has it in the atlas. */
export function describe(e, w, known) {
  if (e.type === 'pickup') return {
    title: { fuel: '⚡ Fuel cell', time: '⏳ Time shard', map: '🧭 Map fragment' }[e.kind],
    lines: [{ fuel: '+15 fuel for the hyperdrive.', time: 'Your time on this planet runs ×3 for 90 s (3 a day per planet).', map: 'Your next jump to a new star costs half.' }[e.kind],
      e.reach ? 'Click to pick it up.' : 'Walk closer to pick it up.'],
  };
  if (e.type === 'home') return { title: e.name, lines: [e.owner ? `Built by ${e.owner} on their home planet.` : 'Built by you on your home planet.'] };
  if (e.type === 'pet') return { title: e.dna.name, lines: [e.owner ? `Lives in ${e.owner}'s home.` : 'Lives on your home planet.', parts(e.dna)] };
  if (e.type === 'trader') return { title: '🧳 Trader', lines: [`Trades plants and ore until ${new Date(e.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`, e.reach ? 'Click (or press E) to trade.' : 'Walk to the stall to trade.'] };
  if (e.type === 'ore' && e.meteor) return { title: '☄ Meteorite', lines: [`${e.amount} rare ore, fallen from the sky.`, e.reach ? 'Click (or press E) to mine it.' : 'Walk closer to mine it.'] };
  if (e.type === 'ore') return { title: '⛏ Ore deposit', lines: [`${e.amount} raw material for your home planet.`, e.reach ? 'Click (or press E) to mine it.' : 'Walk closer to mine it.'] };
  if (e.type === 'island') return { title: 'Floating island', lines: ['Held up by something nobody understands.'] };
  if (e.type === 'beacon') return { title: '🚩 Colony flag', lines: [`Planted by ${e.label}.`] };
  if (e.type === 'colonist') return { title: `${e.label}'s people`, lines: [`${e.dna.name}: settlers who follow ${e.label} from planet to planet.`, parts(e.dna)] };
  if (e.type === 'flyer') { const [t, l] = FLYER[e.kind] ?? [cap(e.kind), '']; return { title: t, lines: [l] }; }
  if (e.type === 'walker') {
    if (e.kind === 'human') return { title: 'Inhabitant', lines: [`Human of the ${w.era} era.`] };
    if (e.kind === 'alien') return { title: 'Alien inhabitant', lines: ['Tall, three-legged, curious.'] };
    const d = e.dna;
    return {
      title: d.name, rarity: d.rarity,
      lines: [
        parts(d),
        e.migrant ? `Migrating from ${e.migrant}.` : '',
        known.species(d.id) ? '✓ In your bestiary' : 'New species',
        hint(e, 'capture'),
      ],
    };
  }
  if (e.relic) return { title: cap(e.kind), lines: ['Rare relic. ' + RELIC[e.kind], known.relic(e.kind) ? '✓ In your atlas' : 'Not in your atlas yet'] };
  if (FLORA[e.kind]) return e.plant
    ? { title: e.plant.name, rarity: e.plant.rarity, lines: [`${FLORA[e.kind]}${e.plant.bloom ? ', flowering' : ''}.`, known.plant?.(e.plant.id) ? '✓ In your herbarium' : 'New plant', hint(e, 'harvest')] }
    : { title: FLORA[e.kind], lines: [`Flora of this world (${e.kind}).`] };
  return {
    title: (e.broken ? 'Ruined ' + (STRUCT[e.kind] ?? e.kind).toLowerCase() : STRUCT[e.kind] ?? cap(e.kind)),
    lines: [w.civ === 'aliens' ? 'Built by aliens.' : e.broken ? `Left from the ${w.era} era. Nobody lives here now.` : `Built by humans, ${w.era} era${w.culture && w.culture !== 'temperate' ? `, ${w.culture} style` : ''}.`],
  };
}

/** Rough on-screen box of something drawn at (x, y) with size s (canvas pixels), for hit tests. */
export function boxOf(e, x, y, s) {
  if (e.type === 'flyer') {
    if (e.kind === 'flock') return e.speed < 0 ? [x - 2 * s, y - 3 * s, x + 30 * s, y + 3 * s] : [x - 30 * s, y - 3 * s, x + 2 * s, y + 3 * s];
    if (e.kind === 'whale') return [x - 1.4 * s, y - 0.4 * s, x + 1.4 * s, y + 0.4 * s];
    return [x - 0.6 * s, y - 0.5 * s, x + 0.6 * s, y + 1.3 * s];
  }
  if (e.type === 'walker' || e.type === 'colonist' || e.type === 'pet') return [x - 0.9 * s, y - 1.2 * s, x + 0.9 * s, y];
  if (e.type === 'pickup') return {
    title: { fuel: '⚡ Fuel cell', time: '⏳ Time shard', map: '🧭 Map fragment' }[e.kind],
    lines: [{ fuel: '+15 fuel for the hyperdrive.', time: 'Your time on this planet runs ×3 for 90 s (3 a day per planet).', map: 'Your next jump to a new star costs half.' }[e.kind],
      e.reach ? 'Click to pick it up.' : 'Walk closer to pick it up.'],
  };
  if (e.type === 'island') return { title: 'Floating island', lines: ['Held up by something nobody understands.'] };
  if (e.type === 'beacon') return [x - 0.2 * s, y - 2.3 * s, x + 1 * s, y];
  if (e.kind === 'arch') return [x - 3 * s, y - 3 * s, x + 3 * s, y];
  if (e.kind === 'block' || e.kind === 'tower') return [x - 0.5 * s, y - 2.8 * s, x + 0.5 * s, y];
  return [x - 1 * s, y - 2 * s, x + 1 * s, y];
}
