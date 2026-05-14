// ===========================================================
// chat.js — high-level conversation orchestration
// ===========================================================

import { chat } from './llm.js';
import {
  extractPokemonNames,
  getPokemonContext,
  getComparisonData
} from './pokeapi.js';

const SYSTEM_PROMPT = `Eres un experto Pokémon llamado "Professor AI". Solo respondes preguntas relacionadas con Pokémon.
Tienes conocimiento profundo sobre todos los Pokémon: tipos, estadísticas, evoluciones, habilidades, debilidades y estrategias.
Respondes siempre en español, de forma amigable y entusiasta.
Si te preguntan algo que no es sobre Pokémon, redirige amablemente la conversación de vuelta al mundo Pokémon.
Cuando tengas datos de PokéAPI en el contexto, úsalos para dar respuestas precisas.
Mantén las respuestas concisas pero informativas (máximo 3 párrafos).
Sé muy conciso en tus respuestas, máximo 2 párrafos cortos.`;

const history = [{ role: 'system', content: SYSTEM_PROMPT }];

const COMPARE_KEYWORDS = [
  'compara', 'comparar', 'comparación',
  ' vs ', 'vs.', 'versus', 'contra',
  'mejor entre', 'quien gana', 'quién gana',
  'más fuerte', 'mas fuerte',
  'ganaría', 'ganaria', 'ganaria entre',
  'batalla', 'battle', 'enfrentamiento'
];

function looksLikeComparison(text) {
  const t = ' ' + text.toLowerCase() + ' ';
  return COMPARE_KEYWORDS.some(k => t.includes(k));
}

export async function sendMessage(userText) {
  const isComparison = looksLikeComparison(userText);

  const mentionedInUser = await extractPokemonNames(userText);
  const contextText = mentionedInUser.length
    ? await getPokemonContext(mentionedInUser)
    : '';
  const fullMsg = contextText
    ? `${userText}\n[Datos PokéAPI:\n${contextText}]`
    : userText;

  history.push({ role: 'user', content: fullMsg });

  let reply;
  try {
    reply = await chat(history);
  } catch (err) {
    console.error('LLM error', err);
    reply = 'Ups, tuve un problema procesando tu pregunta. ¿Podemos intentar otra vez?';
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
