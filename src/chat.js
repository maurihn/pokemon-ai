import { chat } from './llm.js';
import {
  extractPokemonNames,
  getPokemonCard,
  getComparisonData
} from './pokeapi.js';

const SYSTEM_PROMPT = `You are a Pokémon expert called "Professor AI".

CRITICAL RULE: Always respond in the EXACT same language the user writes in. Spanish → Spanish. English → English. Auto-detect and match perfectly, no exceptions.

You are an expert on all Pokémon: types, stats, evolutions, abilities, weaknesses and battle strategies. ONLY answer Pokémon-related questions. If asked something unrelated, kindly redirect back to Pokémon.

When you receive [TOOL RESULT] data in the conversation, use those exact numbers and facts in your response. Be concise (max 2-3 short paragraphs) and enthusiastic.`;

const history = [{ role: 'system', content: SYSTEM_PROMPT }];

// ── Comparison keywords ──────────────────────────────────────
const COMPARE_KEYWORDS = [
  'compara','comparar','comparación','vs','versus','contra',
  'mejor entre','quien gana','quién gana','más fuerte','mas fuerte',
  'ganaría','ganaria','batalla','pelea','duelo','enfrentamiento',
  'cual es mejor','cuál es mejor','quien es más poderoso','quien es mas poderoso',
  'quien vence','quién vence','quien puede más','quien puede mas',
  'who wins','who would win','who is stronger','who is better',
  'compare','comparison','battle','fight','which is better',
  'which is stronger','who beats','can beat','stronger than','better than','beat','defeat'
];

// ── Intent detection using LLM ───────────────────────────────
async function detectComparisonIntent(userText) {
  const lower = userText.toLowerCase();
  if (COMPARE_KEYWORDS.some(k => lower.includes(k))) return true;
  try {
    const result = await chat([
      { role: 'system', content: 'You are a classifier. Answer ONLY "yes" or "no".' },
      { role: 'user', content: `Does this message ask to compare/battle two Pokémon? "${userText}"` }
    ]);
    return result.toLowerCase().includes('yes');
  } catch { return false; }
}

// ── TOOLS — each tool EXECUTES and returns data ──────────────
const TOOLS = {
  search_pokemon: {
    description: 'Fetch real data for a Pokémon from PokéAPI',
    shouldRun: (names) => names.length >= 1,
    execute: async (names) => {
      const results = [];
      for (const name of names.slice(0, 3)) {
        try {
          const card = await getPokemonCard(name);
          const statsStr = card.stats.map(s => `${s.name}:${s.value}`).join(', ');
          const typesStr = card.types.join(', ');
          const abilitiesStr = card.abilities.map(a => a.name).join(', ');
          const bst = card.stats.reduce((sum, s) => sum + s.value, 0);
          results.push(
            `${card.name}(#${String(card.id).padStart(3,'0')}): ` +
            `types=${typesStr}, abilities=${abilitiesStr}, ` +
            `stats=[${statsStr}], BST=${bst}, ` +
            `height=${card.height}m, weight=${card.weight}kg`
          );
        } catch { /* skip failed */ }
      }
      return results.length ? results.join('\n') : null;
    }
  },
  battle: {
    description: 'Fetch data for two Pokémon to compare them',
    shouldRun: (names, isComparison) => names.length >= 2 && isComparison,
    execute: async (names) => {
      try {
        const { a, b } = await getComparisonData(names[0], names[1]);
        const fmt = (p) => {
          const stats = p.stats.map(s => `${s.stat.name}:${s.base_stat}`).join(', ');
          const bst = p.stats.reduce((sum, s) => sum + s.base_stat, 0);
          const types = p.types.map(t => t.type.name).join(', ');
          return `${p.name}(#${String(p.id).padStart(3,'0')}): types=${types}, stats=[${stats}], BST=${bst}`;
        };
        return `${fmt(a)}\n${fmt(b)}`;
      } catch { return null; }
    }
  }
};

// ── Main sendMessage ─────────────────────────────────────────
export async function sendMessage(userText) {
  // 1. Extract Pokémon names from the current message
  const mentionedInUser = await extractPokemonNames(userText);

  // 2. Detect intent
  const isComparison = mentionedInUser.length >= 2
    ? await detectComparisonIntent(userText)
    : COMPARE_KEYWORDS.some(k => userText.toLowerCase().includes(k));

  // 3. Determine which tool to run
  let activeTool = null;
  let toolData = null;

  if (TOOLS.battle.shouldRun(mentionedInUser, isComparison)) {
    activeTool = 'battle';
    toolData = await TOOLS.battle.execute(mentionedInUser);
  } else if (TOOLS.search_pokemon.shouldRun(mentionedInUser)) {
    activeTool = 'search_pokemon';
    toolData = await TOOLS.search_pokemon.execute(mentionedInUser);
  }

  // 4. Push user message
  history.push({ role: 'user', content: userText });

  // 5. If tool ran and got data, inject it as a system message BEFORE the LLM responds
  if (toolData) {
    history.push({
      role: 'user',
      content: `[TOOL RESULT — ${activeTool}]\n${toolData}\n[Use the above data to answer the previous question accurately]`
    });
  }

  // 6. Call LLM with full history
  let reply;
  try {
    reply = await chat(history);
  } catch (err) {
    console.error('LLM error', err);
    reply = 'Ups / Oops — there was a problem. Try again?';
  }
  history.push({ role: 'assistant', content: reply });

  // 7. Extract Pokémon names from reply for card rendering
  const mentionedInReply = await extractPokemonNames(reply);
  const allMentioned = [...new Set([...mentionedInUser, ...mentionedInReply])].slice(0, 4);

  // 8. Fetch comparison data for battle modal (UI layer)
  let comparison = null;
  if ((activeTool === 'battle' || isComparison) && mentionedInUser.length >= 2) {
    try {
      comparison = await getComparisonData(mentionedInUser[0], mentionedInUser[1]);
    } catch { comparison = null; }
  }

  return { reply, pokemonInReply: allMentioned, comparison, tool: activeTool };
}

export { TOOLS };
export function clearHistory() { history.splice(1); }
