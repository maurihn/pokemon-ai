import { chat } from './llm.js';
import { searchPokemonInText, getPokemonContext } from './pokeapi.js';

const SYSTEM_PROMPT = `Eres un experto Pokémon llamado "Professor AI". Solo respondes preguntas relacionadas con Pokémon. 
Tienes conocimiento profundo sobre todos los Pokémon, sus tipos, estadísticas, evoluciones, habilidades, debilidades y estrategias de batalla.
Respondes siempre en español, de forma amigable y entusiasta. 
Si te preguntan algo que no es sobre Pokémon, redirige amablemente la conversación de vuelta al mundo Pokémon.
Cuando tengas datos concretos de la PokéAPI disponibles en el contexto, úsalos para dar respuestas precisas.
Mantén las respuestas concisas pero informativas (máximo 3-4 párrafos).`;

const history = [{ role: 'system', content: SYSTEM_PROMPT }];

export async function sendMessage(userText) {
  // Search for Pokémon names in the user's message
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

  return reply;
}

export function clearHistory() {
  history.splice(1); // keep system prompt
}
