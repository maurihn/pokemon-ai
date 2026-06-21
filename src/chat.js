import { chatWithTools, chat } from './llm.js';
import { getPokemonCard, getComparisonData } from './pokeapi.js';

// ── System prompt ────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a Pokémon expert called "Professor AI".

CRITICAL RULE: Always respond in the EXACT same language the user writes in. Spanish → Spanish. English → English. Auto-detect and match perfectly, no exceptions.

You are an expert on all Pokémon: types, stats, evolutions, abilities, weaknesses and battle strategies. ONLY answer Pokémon-related questions. If asked something unrelated, kindly redirect back to Pokémon.

When you receive tool results, use those exact numbers and facts to give precise answers. Be concise (max 2-3 short paragraphs) and enthusiastic.`;

const history = [{ role: 'system', content: SYSTEM_PROMPT }];

// ── Tool definitions (JSON schema for Gemma 4 function calling) ──
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_pokemon',
      description: 'Get real data for one or more Pokémon from PokéAPI. Use this whenever the user asks about a specific Pokémon.',
      parameters: {
        type: 'object',
        properties: {
          names: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of Pokémon names to look up (lowercase, e.g. ["pikachu", "charizard"])'
          }
        },
        required: ['names']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'battle',
      description: 'Compare two Pokémon and determine which is stronger. Use this when the user asks who wins, wants a battle, or asks to compare two Pokémon.',
      parameters: {
        type: 'object',
        properties: {
          pokemon_a: { type: 'string', description: 'First Pokémon name (lowercase)' },
          pokemon_b: { type: 'string', description: 'Second Pokémon name (lowercase)' }
        },
        required: ['pokemon_a', 'pokemon_b']
      }
    }
  }
];

// ── Tool executors ───────────────────────────────────────────
async function executeSearchPokemon(names) {
  const results = [];
  const cards = [];
  for (const name of (names || []).slice(0, 3)) {
    try {
      const card = await getPokemonCard(name);
      cards.push(card);
      const statsStr = card.stats.map(s => `${s.name}:${s.value}`).join(', ');
      const bst = card.stats.reduce((sum, s) => sum + s.value, 0);
      results.push(
        `${card.name}(#${String(card.id).padStart(3,'0')}): ` +
        `types=${card.types.join(', ')}, ` +
        `abilities=${card.abilities.map(a=>a.name).join(', ')}, ` +
        `stats=[${statsStr}], BST=${bst}, ` +
        `height=${card.height}m, weight=${card.weight}kg`
      );
    } catch (e) { results.push(`${name}: not found`); }
  }
  return { text: results.join('\n'), cards };
}

async function executeBattle(pokemonA, pokemonB) {
  try {
    const { a, b } = await getComparisonData(pokemonA, pokemonB);
    const fmt = (p) => {
      const stats = p.stats.map(s => `${s.stat.name}:${s.base_stat}`).join(', ');
      const bst = p.stats.reduce((sum, s) => sum + s.base_stat, 0);
      return `${p.name}(#${String(p.id).padStart(3,'0')}): types=${p.types.map(t=>t.type.name).join(', ')}, stats=[${stats}], BST=${bst}`;
    };
    return {
      text: `${fmt(a)}\n${fmt(b)}`,
      comparisonData: { a, b },
      cards: [a, b]
    };
  } catch (e) {
    return { text: `Could not fetch battle data: ${e.message}`, comparisonData: null, cards: [] };
  }
}

// ── Main sendMessage ─────────────────────────────────────────
export async function sendMessage(userText) {
  // Push user message
  history.push({ role: 'user', content: userText });

  let pokemonCards = [];
  let comparison = null;
  let activeTool = null;

  try {
    // First LLM call — with tools so model can decide what to call
    const assistantMsg = await chatWithTools([...history], TOOL_DEFINITIONS);

    // Check if model wants to call a tool
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      // Push assistant's tool call decision into history
      history.push(assistantMsg);

      // Execute each tool call
      for (const toolCall of assistantMsg.tool_calls) {
        const fnName = toolCall.function?.name || toolCall.name;
        const fnArgs = typeof toolCall.function?.arguments === 'string'
          ? JSON.parse(toolCall.function.arguments)
          : (toolCall.function?.arguments || toolCall.arguments || {});

        let toolResult = '';
        activeTool = fnName;

        if (fnName === 'search_pokemon') {
          const result = await executeSearchPokemon(fnArgs.names || []);
          toolResult = result.text;
          pokemonCards = result.cards;
        } else if (fnName === 'battle') {
          const result = await executeBattle(fnArgs.pokemon_a, fnArgs.pokemon_b);
          toolResult = result.text;
          comparison = result.comparisonData;
          pokemonCards = result.cards;
        }

        // Inject tool result into history
        history.push({
          role: 'tool',
          tool_call_id: toolCall.id || fnName,
          content: toolResult
        });
      }

      // Second LLM call — now model has tool results and generates final reply
      const finalMsg = await chatWithTools([...history], null); // no tools on second call
      const reply = typeof finalMsg === 'string' ? finalMsg : (finalMsg?.content || '');
      history.push({ role: 'assistant', content: reply });

      return {
        reply,
        pokemonInReply: pokemonCards.map(c => c.name || c.name),
        comparison,
        tool: activeTool,
        cards: pokemonCards
      };

    } else {
      // Model answered directly without tool call
      const reply = typeof assistantMsg === 'string'
        ? assistantMsg
        : (assistantMsg?.content || '');
      history.push({ role: 'assistant', content: reply });

      return {
        reply,
        pokemonInReply: [],
        comparison: null,
        tool: null,
        cards: []
      };
    }

  } catch (err) {
    console.error('sendMessage error:', err);
    const fallback = 'Ups / Oops — there was a problem. Try again?';
    history.push({ role: 'assistant', content: fallback });
    return { reply: fallback, pokemonInReply: [], comparison: null, tool: null, cards: [] };
  }
}

export { TOOL_DEFINITIONS as TOOLS };
export function clearHistory() { history.splice(1); }
