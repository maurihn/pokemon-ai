// ===========================================================
// chat.js — high-level conversation orchestration
// ===========================================================

import { chat } from './llm.js';
import {
  extractPokemonNames,
  getPokemonContext,
  getComparisonData
} from './pokeapi.js';

const SYSTEM_PROMPT = `Eres un experto Pokémon llamado "Professor AI". REGLA ABSOLUTA: SIEMPRE responde en el MISMO idioma que usa el usuario. Si el usuario escribe en español, responde ÚNICAMENTE en español. Si el usuario escribe en inglés, responde ÚNICAMENTE en inglés. NUNCA cambies de idioma sin que el usuario lo pida.

Eres un experto en todos los Pokémon: tipos, estadísticas, evoluciones, habilidades, debilidades y estrategias de batalla. SOLO responde preguntas relacionadas con Pokémon. Si te preguntan algo que no es sobre Pokémon, redirige la conversación amablemente de vuelta al mundo Pokémon.

Cuando tengas datos de PokéAPI en el contexto, úsalos para dar respuestas precisas. Sé conciso (máximo 2-3 párrafos cortos) y entusiasta.`;

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

function detectLanguage(text) {
  // Simple heuristic: check for common Spanish words
  const spanishWords = ['que', 'qué', 'como', 'cómo', 'cuál', 'cual', 'es', 'son', 'los', 'las', 'del', 'con', 'para', 'tiene', 'puedo', 'dame', 'dime', 'explicame', 'explícame'];
  const lower = text.toLowerCase();
  const spanishCount = spanishWords.filter(w => lower.includes(` ${w} `) || lower.startsWith(`${w} `) || lower.endsWith(` ${w}`)).length;
  return spanishCount >= 1 ? 'es' : 'en';
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

  const lang = detectLanguage(userText);
  const langInstruction = lang === 'es'
    ? '[INSTRUCCIÓN OBLIGATORIA: El usuario está escribiendo en ESPAÑOL. Debes responder ÚNICAMENTE en español, sin excepción.]'
    : '[MANDATORY INSTRUCTION: The user is writing in ENGLISH. You MUST respond ONLY in English, no exceptions.]';

  // Detect which tool to use
  const tool = await detectTool(userText, mentionedInUser);
  
  let isComparison = tool === 'battle';
  
  // If battle tool but detectTool already confirmed, skip double-check
  // If not battle tool, still check keywords as fast path
  if (!isComparison) {
    const lower = userText.toLowerCase();
    isComparison = COMPARE_KEYWORDS.some(k => lower.includes(k)) && mentionedInUser.length >= 2;
  }

  const contextBlock = contextText ? `\n[PokéAPI data:\n${contextText}]` : '';
  
  // Add tool context to help the LLM understand what to do
  let toolHint = '';
  if (tool === 'battle' || isComparison) {
    toolHint = lang === 'es'
      ? '\n[HERRAMIENTA: battle — compara estos dos Pokémon y determina cuál es más fuerte y por qué]'
      : '\n[TOOL: battle — compare these two Pokémon and determine which is stronger and why]';
  } else if (tool === 'search_pokemon') {
    toolHint = lang === 'es'
      ? '\n[HERRAMIENTA: search_pokemon — proporciona información detallada sobre este Pokémon]'
      : '\n[TOOL: search_pokemon — provide detailed information about this Pokémon]';
  }

  const fullMsg = `${langInstruction}${toolHint}\n\n${userText}${contextBlock}`;

  history.push({ role: 'user', content: fullMsg });

  let reply;
  try {
    reply = await chat(history);
  } catch (err) {
    console.error('LLM error', err);
    reply = lang === 'es'
      ? 'Ups, tuve un problema procesando tu pregunta. ¿Podemos intentar otra vez?'
      : 'Oops, I had a problem processing your question. Can we try again?';
  }
  history.push({ role: 'assistant', content: reply });

  const mentionedInReply = await extractPokemonNames(reply);
  const allMentioned = [...new Set([...mentionedInUser, ...mentionedInReply])].slice(0, 4);

  let comparison = null;
  if (isComparison && mentionedInUser.length >= 2) {
    try {
      comparison = await getComparisonData(mentionedInUser[0], mentionedInUser[1]);
    } catch (err) {
      console.warn('Comparison fetch failed', err);
      comparison = null;
    }
  }

  return { reply, pokemonInReply: allMentioned, comparison, tool };
}

export { TOOLS };
export function clearHistory() { history.splice(1); }
