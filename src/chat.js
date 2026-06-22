import { chat, chatStream } from './llm.js';
import { getPokemonCard, getComparisonData } from './pokeapi.js';

// ── System prompt with tool instructions ─────────────────────
const SYSTEM_PROMPT = `You are a Pokémon expert called "Professor AI".

LANGUAGE RULE: Always respond in the EXACT same language the user writes in. Spanish → Spanish. English → English. Auto-detect and match, no exceptions.

You have access to these tools:
1. search_pokemon — get real data (types, stats, abilities) for one or more Pokémon
2. battle — compare two Pokémon to determine which is stronger

WHEN TO USE TOOLS:
- If the user asks about a specific Pokémon you don't have data for yet, call search_pokemon.
- If the user wants to compare or battle two Pokémon, call battle.
- If you already have the needed data in the conversation, just answer directly WITHOUT calling a tool.
- For greetings or general questions, just answer directly.

HOW TO CALL A TOOL: Output ONLY this exact format on its own, nothing else:
[[TOOL:search_pokemon|pikachu]]
or for multiple pokemon:
[[TOOL:search_pokemon|pikachu,charizard]]
or for battle:
[[TOOL:battle|pikachu|charizard]]

After you receive [TOOL RESULT], use those exact numbers to give a concise (2-3 paragraph) enthusiastic answer in the user's language. Never show the tool call format to the user in your final answer.`;

const history = [{ role: 'system', content: SYSTEM_PROMPT }];

// ── Parse tool calls from model output ───────────────────────
function parseToolCall(text) {
  if (!text) return null;
  // Primary format: [[TOOL:name|arg1|arg2]]
  let m = text.match(/\[\[TOOL:\s*(\w+)\s*((?:\|[^\]]*)*)\]\]/i);
  if (m) {
    const name = m[1].toLowerCase();
    const args = m[2].split('|').filter(s => s.trim().length > 0).map(s => s.trim());
    return { name, args };
  }
  // Fallback: Gemma native format call:name{...} or <|tool_call>...
  m = text.match(/call:\s*(\w+)\s*\{([^}]*)\}/i);
  if (m) {
    const name = m[1].toLowerCase();
    // extract values from {names:[pikachu]} or {pokemon_a:pikachu, pokemon_b:charizard}
    const inner = m[2];
    const values = [];
    // grab anything that looks like a pokemon name (word chars, hyphens)
    const nameMatches = inner.match(/[a-z][a-z0-9-]+/gi) || [];
    // filter out the keys like 'names', 'pokemon_a', etc
    const keys = ['names', 'name', 'pokemon_a', 'pokemon_b', 'pokemon', 'a', 'b'];
    for (const nm of nameMatches) {
      if (!keys.includes(nm.toLowerCase())) values.push(nm.toLowerCase());
    }
    return { name, args: values };
  }
  return null;
}

// ── Clean tool-call syntax out of any text shown to user ─────
function stripToolSyntax(text) {
  if (!text) return '';
  return text
    .replace(/\[\[TOOL:[^\]]*\]\]/gi, '')
    .replace(/<\|?tool_call\|?>[\s\S]*?<\/?tool_call\|?>/gi, '')
    .replace(/call:\s*\w+\s*\{[^}]*\}/gi, '')
    .replace(/<\|?"\|?>/g, '')
    .trim();
}

// ── Tool executors ───────────────────────────────────────────
async function execSearch(names) {
  const cards = [];
  const lines = [];
  for (const name of names.slice(0, 3)) {
    try {
      const card = await getPokemonCard(name);
      cards.push(card);
      const statsStr = card.stats.map(s => `${s.name}:${s.value}`).join(', ');
      const bst = card.stats.reduce((sum, s) => sum + s.value, 0);
      lines.push(`${card.name}(#${String(card.id).padStart(3,'0')}): types=${card.types.join(', ')}, abilities=${card.abilities.map(a=>a.name).join(', ')}, stats=[${statsStr}], BST=${bst}, height=${card.height}m, weight=${card.weight}kg`);
    } catch { lines.push(`${name}: not found`); }
  }
  return { text: lines.join('\n') || 'No data found', cards };
}

async function execBattle(a, b) {
  try {
    const { a: pa, b: pb } = await getComparisonData(a, b);
    const fmt = (p) => {
      const stats = p.stats.map(s => `${s.stat.name}:${s.base_stat}`).join(', ');
      const bst = p.stats.reduce((sum, s) => sum + s.base_stat, 0);
      return `${p.name}(#${String(p.id).padStart(3,'0')}): types=${p.types.map(t=>t.type.name).join(', ')}, stats=[${stats}], BST=${bst}`;
    };
    return { text: `${fmt(pa)}\n${fmt(pb)}`, comparison: { a: pa, b: pb }, cards: [pa, pb] };
  } catch (e) {
    return { text: 'Battle data unavailable', comparison: null, cards: [] };
  }
}

// ── Main sendMessage ─────────────────────────────────────────
// opts.onChunk(textChunk) — optional. When provided, the FINAL answer is
// streamed token-by-token through this callback (for live TTS + typing UI).
export async function sendMessage(userText, opts = {}) {
  const onChunk = typeof opts.onChunk === 'function' ? opts.onChunk : null;
  history.push({ role: 'user', content: userText });

  let cards = [];
  let comparison = null;
  let activeTool = null;

  try {
    // First call — model may emit a tool call (non-streaming, short)
    let raw = await chat([...history]);
    const toolCall = parseToolCall(raw);

    if (toolCall) {
      activeTool = toolCall.name;
      let toolResultText = '';

      if (toolCall.name === 'search_pokemon') {
        let names = toolCall.args;
        if (names.length === 1 && names[0].includes(',')) {
          names = names[0].split(',').map(s => s.trim());
        }
        const r = await execSearch(names);
        toolResultText = r.text;
        cards = r.cards;
      } else if (toolCall.name === 'battle') {
        let a = toolCall.args[0];
        let b = toolCall.args[1];
        if (!b && a && a.includes(',')) {
          [a, b] = a.split(',').map(s => s.trim());
        }
        const r = await execBattle(a, b);
        toolResultText = r.text;
        comparison = r.comparison;
        cards = r.cards;
      }

      history.push({ role: 'assistant', content: raw });
      history.push({ role: 'user', content: `[TOOL RESULT]\n${toolResultText}\n[Now answer the user's question using this data, in their language. Do not mention the tool.]` });

      // Final answer — streamed if onChunk provided
      const reply = await generateFinalAnswer([...history], onChunk);
      history.push({ role: 'assistant', content: reply });

      return { reply, pokemonInReply: cards.map(c => c.name), comparison, tool: activeTool, cards };
    } else {
      // No tool — the first response IS the answer.
      // If streaming requested, the non-streamed text was already produced;
      // emit it as a single chunk so live mode still speaks it.
      const reply = stripToolSyntax(raw) || raw;
      if (onChunk && reply) onChunk(reply);
      history.push({ role: 'assistant', content: reply });
      return { reply, pokemonInReply: [], comparison: null, tool: null, cards: [] };
    }
  } catch (err) {
    console.error('sendMessage error:', err);
    const fallback = 'Ups / Oops — there was a problem. Try again?';
    history.push({ role: 'assistant', content: fallback });
    return { reply: fallback, pokemonInReply: [], comparison: null, tool: null, cards: [] };
  }
}

// Generate the final answer. Streams chunks through onChunk if provided,
// while filtering any stray tool-call syntax out of the visible text.
async function generateFinalAnswer(messages, onChunk) {
  if (!onChunk) {
    const finalRaw = await chat(messages);
    return stripToolSyntax(finalRaw) || finalRaw;
  }
  // Streaming path — forward clean chunks as they arrive
  const finalRaw = await chatStream(messages, (chunk) => {
    // light cleanup per-chunk (don't strip across chunk boundaries aggressively)
    const clean = chunk.replace(/\[\[TOOL:[^\]]*\]\]/gi, '');
    if (clean) onChunk(clean);
  });
  return stripToolSyntax(finalRaw) || finalRaw;
}

export function clearHistory() { history.splice(1); }
