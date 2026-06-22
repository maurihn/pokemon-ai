# Pokémon AI 🤖⚡

> Powered by **[FusionAI Agents](https://agents.fusionai.now)**

Chat inteligente sobre Pokémon que corre **100% en tu navegador** — sin servidores, sin APIs de pago.

## ¿Qué puede hacer?

- 💬 **Chat en español** sobre cualquier Pokémon
- 🃏 **Cards visuales** automáticas con stats por cada Pokémon mencionado
- ⚔️ **Batallas animadas** — escribe "¿quién gana, Charizard vs Mewtwo?" y verás la batalla completa (VS flash, barras animadas, pantalla de ganador con confetti)
- 🎙️ **Entrada por voz** — habla directamente (Chrome/Edge, STT nativo)
- 🔊 **Voz del asistente** — el bot lee sus respuestas en voz alta con Kokoro TTS (local, voz en español)
- 🔴 **Modo Live** — conversación por voz continua: escucha → responde → habla → vuelve a escuchar
- 🔍 **Detalle completo** — toca cualquier card para ver stats, habilidades, evolución y descripción

## Stack

| Capa | Tecnología |
|---|---|
| LLM local | **Transformers.js** + Gemma 4 E2B via WebGPU |
| Tools / function calling | Gemma 4 tool calls parseados localmente (search_pokemon, battle) |
| Datos Pokémon | **PokéAPI** en tiempo real |
| Voz (entrada) | **Web Speech API** (Chrome STT) |
| Voz (salida) | **Kokoro-82M** TTS via WebGPU (kokoro-js) |
| Build | **Vite** + ES Modules |
| Paquetes | **pnpm** |

## Instalación

```bash
git clone https://github.com/maurihn/pokemon-ai.git
cd pokemon-ai
pnpm install
pnpm dev
```

Abre **http://localhost:5173** en Chrome/Edge 113+.

## Build

```bash
pnpm build && pnpm preview
```

## Requisitos

- Chrome 113+ o Edge 113+ (WebGPU)
- ~2 GB RAM libre
- Internet la primera vez (descarga modelo Gemma 4 ~300 MB + voz Kokoro ~92 MB, quedan en caché)

## Cómo funciona

1. `src/llm.js` carga el modelo **Gemma 4 E2B** con Transformers.js (corre 100% local via WebGPU).
2. `src/chat.js` orquesta cada turno con **tool calling**: Gemma decide cuándo llamar `search_pokemon` o `battle`, las tools consultan PokéAPI y devuelven datos reales que el modelo usa para responder.
3. `src/pokeapi.js` envuelve PokéAPI con caché en memoria y construye las cards.
4. `src/tts.js` carga **Kokoro-82M** (lazy, solo al activar voz/Live) para leer las respuestas en voz alta.
5. `src/main.js` cablea el DOM, voz (entrada/salida), Modo Live, cards y los modales (detalle + batalla animada).

---
*Built with ❤️ by [FusionAI Agents](https://agents.fusionai.now)*
