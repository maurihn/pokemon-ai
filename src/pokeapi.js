// Cache for PokeAPI data
const cache = new Map();
const BASE = 'https://pokeapi.co/api/v2';

async function safeFetch(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(url, data);
  return data;
}

export async function getPokemonByName(name) {
  const normalized = name.toLowerCase().trim();
  return safeFetch(`${BASE}/pokemon/${normalized}`);
}

export async function getPokemonSpecies(nameOrId) {
  return safeFetch(`${BASE}/pokemon-species/${nameOrId}`);
}

export async function getTypeInfo(type) {
  return safeFetch(`${BASE}/type/${type.toLowerCase()}`);
}

export async function searchPokemonInText(text) {
  // Extract pokemon names mentioned in text
  // Fetch a list of all pokemon names for matching
  const listData = await safeFetch(`${BASE}/pokemon?limit=1025&offset=0`);
  const names = listData.results.map(p => p.name);
  const found = [];
  const lower = text.toLowerCase();
  for (const name of names) {
    if (lower.includes(name)) found.push(name);
  }
  return found;
}

export async function getPokemonContext(names) {
  // Returns a compact text summary of pokemon data for LLM context
  const results = [];
  for (const name of names.slice(0, 3)) { // limit to 3 to avoid huge context
    try {
      const p = await getPokemonByName(name);
      const types = p.types.map(t => t.type.name).join(', ');
      const stats = p.stats.map(s => `${s.stat.name}: ${s.base_stat}`).join(', ');
      const abilities = p.abilities.map(a => a.ability.name).join(', ');
      results.push(`${p.name} (#${p.id}): tipos=${types}, habilidades=${abilities}, stats=[${stats}], altura=${p.height/10}m, peso=${p.weight/10}kg`);
    } catch (e) {
      // skip
    }
  }
  return results.join('\n');
}
