// ===========================================================
// pokeapi.js — small wrapper around PokéAPI with caching
// ===========================================================

const cache = new Map();
const BASE = 'https://pokeapi.co/api/v2';

export const TYPE_COLORS = {
  normal:'#A8A878', fire:'#F08030', water:'#6890F0', electric:'#F8D030',
  grass:'#78C850', ice:'#98D8D8', fighting:'#C03028', poison:'#A040A0',
  ground:'#E0C068', flying:'#A890F0', psychic:'#F85888', bug:'#A8B820',
  rock:'#B8A038', ghost:'#705898', dragon:'#7038F8', dark:'#705848',
  steel:'#B8B8D0', fairy:'#EE99AC'
};

export const STAT_LABELS = {
  hp: 'HP', attack: 'ATK', defense: 'DEF',
  'special-attack': 'SP.ATK', 'special-defense': 'SP.DEF', speed: 'VEL'
};
export const STAT_LABELS_ES = {
  hp: 'HP', attack: 'Ataque', defense: 'Defensa',
  'special-attack': 'Ataque Esp.', 'special-defense': 'Defensa Esp.', speed: 'Velocidad'
};
export const MAX_STAT = 255;

export const capitalize = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
export const pad3 = n => String(n).padStart(3, '0');

export const officialArt = id =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
export const fallbackSprite = id =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;

export function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0,2), 16);
  const g = parseInt(h.substring(2,4), 16);
  const b = parseInt(h.substring(4,6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

let nameListPromise = null;
async function loadNameList() {
  if (!nameListPromise) {
    nameListPromise = safeFetch(`${BASE}/pokemon?limit=1025&offset=0`)
      .then(d => d.results.map(p => p.name));
  }
  return nameListPromise;
}

async function safeFetch(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

export async function getPokemonByName(name) {
  return safeFetch(`${BASE}/pokemon/${String(name).toLowerCase().trim()}`);
}
export async function getPokemonSpecies(idOrName) {
  return safeFetch(`${BASE}/pokemon-species/${idOrName}`);
}
export async function getTypeInfo(type) {
  return safeFetch(`${BASE}/type/${type.toLowerCase()}`);
}

// ---- Extract pokemon names mentioned in user text ----
export async function extractPokemonNames(text) {
  if (!text) return [];
  const names = await loadNameList();
  const lower = text.toLowerCase();
  const found = new Set();
  for (const name of names) {
    // longer names first via the list itself; we also try without "-"
    const variants = [name, name.replace(/-/g, ' '), name.replace(/-/g, '')];
    for (const v of variants) {
      const escaped = v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const re = new RegExp(`\\b${escaped}s?\\b`, 'i');
      if (re.test(lower)) { found.add(name); break; }
    }
  }
  // Sort so longer name matches first (helps with mr-mime etc.)
  return [...found].sort((a, b) => b.length - a.length);
}
export const searchPokemonInText = extractPokemonNames;

export async function getPokemonContext(names) {
  const results = [];
  for (const name of names.slice(0, 3)) {
    try {
      const p = await getPokemonByName(name);
      const types = p.types.map(t => t.type.name).join(', ');
      const stats = p.stats.map(s => `${s.stat.name}:${s.base_stat}`).join(', ');
      const abilities = p.abilities.map(a => a.ability.name).join(', ');
      results.push(`${p.name}(#${p.id}): tipos=${types}, habilidades=${abilities}, stats=[${stats}], altura=${p.height/10}m, peso=${p.weight/10}kg`);
    } catch (e) { /* ignore */ }
  }
  return results.join('\n');
}

// ---- Build a "card" view-model for one Pokémon ----
export async function getPokemonCard(nameOrId) {
  const p = await getPokemonByName(String(nameOrId));
  return {
    id: p.id,
    name: p.name,
    types: p.types.map(t => t.type.name),
    stats: p.stats.map(s => ({ name: s.stat.name, value: s.base_stat })),
    abilities: p.abilities.map(a => ({ name: a.ability.name, hidden: a.is_hidden })),
    height: p.height / 10,
    weight: p.weight / 10,
    sprite: p.sprites.front_default,
    artwork: officialArt(p.id),
    // raw, used by the battle modal which is ported as-is
    raw: p
  };
}

export async function getComparisonData(nameA, nameB) {
  const [a, b] = await Promise.all([
    getPokemonByName(nameA),
    getPokemonByName(nameB)
  ]);
  return { a, b };
}

export async function getEvolutionText(name) {
  try {
    const sp = await getPokemonSpecies(String(name).toLowerCase());
    const evoData = await safeFetch(sp.evolution_chain.url);
    const chain = [];
    let node = evoData.chain;
    while (node) {
      chain.push(capitalize(node.species.name));
      node = node.evolves_to?.[0];
    }
    return chain.length > 1 ? chain.join(' → ') : '';
  } catch { return ''; }
}

export async function getFlavorText(name, lang = 'es') {
  try {
    const sp = await getPokemonSpecies(String(name).toLowerCase());
    const entries = sp.flavor_text_entries || [];
    const found = entries.find(e => e.language.name === lang)
              || entries.find(e => e.language.name === 'en');
    return found ? found.flavor_text.replace(/\f|\n|\r/g, ' ') : '';
  } catch { return ''; }
}
