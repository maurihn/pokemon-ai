// ===========================================================
// chat.js — high-level conversation orchestration
// ===========================================================

import { chat } from './llm.js';
import {
  extractPokemonNames,
  getPokemonContext,
  getComparisonData
} from './pokeapi.js';

const SYSTEM_PROMPT = `You are a Pokémon expert assistant called "Professor AI". You ONLY answer questions about Pokémon.
You have deep knowledge of all Pokémon: types, stats, evolutions, abilities, weaknesses, and battle strategies.
You respond in the same language the user writes in — Spanish or English.
If asked something unrelated to Pokémon, kindly redirect the conversation back to Pokémon.
When you have PokéAPI data in the context, use it to give precise answers.
Keep responses concise (max 2-3 short paragraphs). Be friendly and enthusiastic.`;

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

export async function sendMessage(userText) {
  const mentionedInUser = await extractPokemonNames(userText);
  const contextText = mentionedInUser.length ? await getPokemonContext(mentionedInUser) : '';

  // Detect language
  const lang = detectLanguage(userText);
  const langInstruction = lang === 'en'
    ? 'The user is writing in English. Respond in English.'
    : 'El usuario escribe en español. Responde en español.';

  // Detect comparison intent (keyword fast path + LLM fallback if 2 pokemon found)
  let isComparison = false;
  if (mentionedInUser.length >= 2) {
    isComparison = await detectComparisonIntent(userText);
  } else {
    const lower = userText.toLowerCase();
    isComparison = COMPARE_KEYWORDS.some(k => lower.includes(k));
  }

  const contextBlock = contextText ? `\n[PokéAPI data:\n${contextText}]` : '';
  const fullMsg = `${langInstruction}\n${userText}${contextBlock}`;

  history.push({ role: 'user', content: fullMsg });

  let reply;
  try {
    reply = await chat(history);
  } catch (err) {
    console.error('LLM error', err);
    reply = lang === 'en'
      ? 'Oops, I had a problem processing your question. Can we try again?'
      : 'Ups, tuve un problema procesando tu pregunta. ¿Podemos intentar otra vez?';
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

  return { reply, pokemonInReply: allMentioned, comparison };
}

export function clearHistory() {
  history.splice(1);
}
