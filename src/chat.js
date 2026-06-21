// ===========================================================
// chat.js — high-level conversation orchestration
// ===========================================================

import { chat } from './llm.js';
import {
  extractPokemonNames,
  getPokemonContext,
  getComparisonData
} from './pokeapi.js';

const SYSTEM_PROMPT = `You are a Pokémon expert called "Professor AI". 

CRITICAL RULE: Always respond in the EXACT same language the user writes in. If they write in Spanish → respond in Spanish. If they write in English → respond in English. If they write in French → respond in French. Detect the language automatically and match it perfectly, no exceptions.

You are an expert on all Pokémon: types, stats, evolutions, abilities, weaknesses and battle strategies. ONLY answer Pokémon-related questions. If asked something unrelated, kindly redirect back to Pokémon.

When you have PokéAPI data in the context, use it for precise answers. Be concise (max 2-3 short paragraphs) and enthusiastic.`;

const history = [{ role: 'system', content: SYSTEM_PROMPT }];

const COMPARE_KEYWORDS = [
  // Spanish
  'compara', 'comparar', 'comparación', 'vs', 'versus', 'contra',
  'mejor entre', 'quien gana', 'quién gana', 'más fuerte', 'mas fuerte',
  'ganaría', 'ganaria', 'batalla', 'pelea', 'duelo', 'enfrentamiento',
  'cual es mejor', 'cuál es mejor', 'quien es más poderoso', 'quien es mas poderoso',
  'quien vence', 'quién vence', 'quien puede más', 'quien puede mas',
  // English
  'who wins', 'who would win', 'who is stronger', 'who is better',
  'compare', 'comparison', 'battle', 'fight', 'versus', 'vs',
  'which is better', 'which is stronger', 'who beats', 'can beat',
  'stronger than', 'better than', 'beat', 'defeat'
];

async function detectComparisonIntent(userText) {
  // First check keywords (fast path)
  const lower = userText.toLowerCase();
  const hasKeyword = COMPARE_KEYWORDS.some(k => lower.includes(k));
  if (hasKeyword) return true;

  // Use LLM to detect intent (only if 2+ pokemon names found)
  // Ask the LLM with a simple classification prompt
  try {
    const classifyMessages = [
      {
        role: 'system',
        content: 'You are a classifier. Answer ONLY with "yes" or "no". No explanations.'
      },
      {
        role: 'user',
        content: `Does this message ask to compare, battle, or determine which Pokémon is stronger/better? Message: "${userText}"`
      }
    ];
    const result = await chat(classifyMessages);
    return result.toLowerCase().includes('yes');
  } catch {
    return false;
  }
}

// ============================================================
// TOOL SYSTEM — LLM-powered structured intent detection
// ============================================================

// Tool definitions (shown to LLM for intent classification)
const TOOLS = [
  {
    name: 'search_pokemon',
    description: 'Search for information about a specific Pokémon (types, stats, abilities, evolution, weaknesses)',
    trigger: async (text, names) => names.length >= 1,
  },
  {
    name: 'battle',
    description: 'Compare two Pokémon in battle to determine which one is stronger',
    trigger: async (text, names) => {
      if (names.length < 2) return false;
      return detectComparisonIntent(text);
    },
  },
];

async function detectTool(userText, pokemonNames) {
  for (const tool of TOOLS) {
    if (await tool.trigger(userText, pokemonNames)) {
      return tool.name;
    }
  }
  return 'chat'; // default
}

export async function sendMessage(userText) {
  const mentionedInUser = await extractPokemonNames(userText);
  const contextText = mentionedInUser.length ? await getPokemonContext(mentionedInUser) : '';

  // Detect which tool to use
  const tool = await detectTool(userText, mentionedInUser);
  const isComparison = tool === 'battle' || 
    (COMPARE_KEYWORDS.some(k => userText.toLowerCase().includes(k)) && mentionedInUser.length >= 2);

  // Build tool hint for LLM (language-neutral — LLM will respond in user's language)
  let toolHint = '';
  if (tool === 'battle' || isComparison) {
    toolHint = '\n[TOOL: battle — compare these two Pokémon and determine which is stronger and why]';
  } else if (tool === 'search_pokemon') {
    toolHint = '\n[TOOL: search_pokemon — provide detailed information about this Pokémon]';
  }

  const contextBlock = contextText ? `\n[PokéAPI data:\n${contextText}]` : '';
  const fullMsg = `${userText}${toolHint}${contextBlock}`;

  history.push({ role: 'user', content: fullMsg });

  let reply;
  try {
    reply = await chat(history);
  } catch (err) {
    console.error('LLM error', err);
    reply = 'Ups / Oops — there was a problem processing your question. Try again?';
  }
  history.push({ role: 'assistant', content: reply });

  const mentionedInReply = await extractPokemonNames(reply);
  const allMentioned = [...new Set([...mentionedInUser, ...mentionedInReply])].slice(0, 4);

  let comparison = null;
  if (isComparison && mentionedInUser.length >= 2) {
    try {
      comparison = await getComparisonData(mentionedInUser[0], mentionedInUser[1]);
    } catch (err) {
      comparison = null;
    }
  }

  return { reply, pokemonInReply: allMentioned, comparison, tool };
}

export { TOOLS };
export function clearHistory() { history.splice(1); }
