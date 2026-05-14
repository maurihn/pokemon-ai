import { chat } from './llm.js';
import {
  searchPokemonInText,
  getPokemonContext,
  extractPokemonNames,
} from './pokeapi.js';

const SYSTEM_PROMPT = `Eres un experto Pokémon llamado "Professor AI". Solo respondes preguntas relacionadas con Pokémon.
Tienes conocimiento profundo sobre todos los Pokémon, sus tipos, estadísticas, evoluciones, habilidades, debilidades y estrategias de batalla.
Respondes siempre en español, de forma amigable y entusiasta.
Si te preguntan algo que no es sobre Pokémon, redirige amablemente la conversación de vuelta al mundo Pokémon.
Cuando tengas datos concretos de la PokéAPI disponibles en el contexto, úsalos para dar respuestas precisas.
Menciona los nombres de los Pokémon claramente (en español o inglés) para que se puedan resaltar visualmente.
Mantén las respuestas concisas pero informativas (máximo 3-4 párrafos).`;

const history = [{ role: 'system', content: SYSTEM_PROMPT }];

export async function sendMessage(userText) {
  // Search for Pokémon names mentioned in the user's message → context for LLM
  const mentionedPokemon = await searchPokemonInText(userText);

  let contextMsg = '';
  if (mentionedPokemon.length > 0) {
    const pokeContext = await getPokemonContext(mentionedPokemon);
    if (pokeContext) {
      contextMsg = `\n[Datos de PokéAPI para contexto:\n${pokeContext}]`;
    }
  }

  const fullUserMessage = userText + contextMsg;
  history.push({ role: 'user', content: fullUserMessage });

  const reply = await chat(history);
  history.push({ role: 'assistant', content: reply });

  // Extract Pokémon mentioned in the reply (also include those from the
  // user's message so cards still render when the bot is laconic).
  let pokemonInReply = [];
  try {
    const inReply = await extractPokemonNames(reply);
    const merged = new Set([...inReply, ...mentionedPokemon]);
    pokemonInReply = Array.from(merged).slice(0, 4);
  } catch (e) {
    pokemonInReply = mentionedPokemon.slice(0, 4);
  }

  return { reply, pokemonInReply };
}

export function clearHistory() {
  history.splice(1); // keep system prompt
}
