// PokeAPI client with caching + helpers for rich Pokémon cards.

const cache = new Map();
const BASE = 'https://pokeapi.co/api/v2';

// In-memory cache of the full Pokémon names list (loaded on demand).
let nameListPromise = null;

async function safeFetch(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

/* ---------- Basic endpoints ---------- */

export async function getPokemonByName(name) {
  const normalized = String(name).toLowerCase().trim();
  return safeFetch(`${BASE}/pokemon/${normalized}`);
}

export async function getPokemonSpecies(nameOrId) {
  return safeFetch(`${BASE}/pokemon-species/${String(nameOrId).toLowerCase()}`);
}

export async function getTypeInfo(type) {
  return safeFetch(`${BASE}/type/${type.toLowerCase()}`);
}

/* ---------- Name list (preloaded for extraction) ---------- */

async function loadNameList() {
  if (nameListPromise) return nameListPromise;
  nameListPromise = (async () => {
    try {
      const data = await safeFetch(`${BASE}/pokemon?limit=1025&offset=0`);
      return data.results.map(p => p.name);
    } catch (e) {
      console.warn('Failed to load Pokémon name list', e);
      return [];
    }
  })();
  return nameListPromise;
}

/* ---------- Smarter extraction ---------- */
// Matches Pokémon names appearing as whole words (case-insensitive), handles
// dashes (e.g. "mr-mime"), and de-duplicates. Returns names in their canonical
// PokeAPI form (lowercase, dashed).
export async function extractPokemonNames(text) {
  if (!text) return [];
  const names = await loadNameList();
  if (!names.length) return [];

  // Normalize text: lowercase, replace some punctuation, keep dashes
  const lower = ' ' + String(text).toLowerCase().replace(/[.,;:!?"()¡¿]/g, ' ') + ' ';
  const found = new Set();

  for (const name of names) {
    // The name might be "mr-mime" — we accept either "mr-mime" or "mr mime"
    const variants = new Set([name, name.replace(/-/g, ' ')]);
    for (const v of variants) {
      // word boundary: space before and after
      if (lower.includes(' ' + v + ' ') || lower.includes(' ' + v + 's ')) {
        found.add(name);
        break;
      }
    }
  }

  return Array.from(found);
}

/* ---------- Back-compat alias used by chat.js context builder ---------- */
export async function searchPokemonInText(text) {
  return extractPokemonNames(text);
}

export async function getPokemonContext(names) {
  // Returns a compact text summary of pokemon data for LLM context.
  const results = [];
  for (const name of names.slice(0, 3)) {
    try {
      const p = await getPokemonByName(name);
      const types = p.types.map(t => t.type.name).join(', ');
      const stats = p.stats.map(s => `${s.stat.name}: ${s.base_stat}`).join(', ');
      const abilities = p.abilities.map(a => a.ability.name).join(', ');
      results.push(
        `${p.name} (#${p.id}): tipos=${types}, habilidades=${abilities}, stats=[${stats}], altura=${p.height / 10}m, peso=${p.weight / 10}kg`
      );
    } catch (e) {
      // skip
    }
  }
  return results.join('\n');
}

/* ---------- Rich card object ---------- */
// Structured shape consumed by the UI to render a .poke-card.
export async function getPokemonCard(nameOrId) {
  const p = await getPokemonByName(nameOrId);
  const id = p.id;
  return {
    id,
    name: p.name,
    types: p.types.map(t => t.type.name),
    stats: p.stats.map(s => ({ name: s.stat.name, value: s.base_stat })),
    abilities: p.abilities.map(a => a.ability.name),
    height: p.height / 10, // meters
    weight: p.weight / 10, // kg
    sprite: p.sprites?.front_default || null,
    artwork:
      p.sprites?.other?.['official-artwork']?.front_default ||
      `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`,
  };
}

/* ---------- Evolution chain as text ---------- */
export async function getEvolutionText(pokemonName) {
  try {
    const species = await getPokemonSpecies(pokemonName);
    const evoUrl = species.evolution_chain?.url;
    if (!evoUrl) return '';
    const evo = await safeFetch(evoUrl);
    const chain = [];
    const walk = (node) => {
      if (!node) return;
      chain.push(capitalize(node.species.name));
      (node.evolves_to || []).forEach(walk);
    };
    walk(evo.chain);
    return chain.join(' → ');
  } catch (e) {
    return '';
  }
}

/* ---------- Flavor text ---------- */
export async function getFlavorText(pokemonName, lang = 'es') {
  try {
    const species = await getPokemonSpecies(pokemonName);
    const entries = species.flavor_text_entries || [];
    let entry = entries.find(e => e.language?.name === lang);
    if (!entry) entry = entries.find(e => e.language?.name === 'en');
    if (!entry) return '';
    return entry.flavor_text.replace(/\f|\n|\r/g, ' ').trim();
  } catch (e) {
    return '';
  }
}

/* ---------- Utilities ---------- */
export function capitalize(s) {
  if (!s) return '';
  return s
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const TYPE_COLORS = {
  normal: '#A8A878', fire: '#F08030', water: '#6890F0', electric: '#F8D030',
  grass: '#78C850', ice: '#98D8D8', fighting: '#C03028', poison: '#A040A0',
  ground: '#E0C068', flying: '#A890F0', psychic: '#F85888', bug: '#A8B820',
  rock: '#B8A038', ghost: '#705898', dragon: '#7038F8', dark: '#705848',
  steel: '#B8B8D0', fairy: '#EE99AC',
};

export const STAT_LABELS = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'SP.ATK',
  'special-defense': 'SP.DEF',
  speed: 'SPD',
};

export const MAX_STAT = 255;
