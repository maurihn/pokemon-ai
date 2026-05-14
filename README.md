# Pokémon AI 🤖⚡

> Powered by **[FusionAI Agents](https://agents.fusionai.now)**

Chat inteligente sobre Pokémon que corre **100% en tu navegador** — sin servidores, sin APIs de pago.

## ¿Qué puede hacer?

- 💬 **Chat en español** sobre cualquier Pokémon
- 🃏 **Cards visuales** automáticas con stats por cada Pokémon mencionado
- ⚔️ **Batallas animadas** — escribe "¿quién gana, Charizard vs Mewtwo?" y verás la batalla completa (VS flash, barras animadas, pantalla de ganador con confetti)
- 🎙️ **Entrada por voz** — habla directamente (Chrome/Edge, STT nativo)
- 🔍 **Detalle completo** — toca cualquier card para ver stats, habilidades, evolución y descripción

## Stack

| Capa | Tecnología |
|---|---|
| LLM local | **WebLLM** + Llama 3.2 1B via WebGPU |
| Datos Pokémon | **PokéAPI** en tiempo real |
| Voz | **Web Speech API** (Chrome STT) |
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
- Internet la primera vez (descarga modelo ~800 MB, queda en caché)

## Cómo funciona

1. `src/llm.js` carga el modelo Llama 3.2 1B con WebLLM (corre 100% local).
2. `src/pokeapi.js` envuelve PokéAPI con caché en memoria + detecta nombres de Pokémon en texto libre.
3. `src/chat.js` orquesta cada turno: detecta menciones, inyecta datos de PokéAPI al contexto, y detecta intención de comparación.
4. `src/main.js` cablea el DOM, voz, cards y los tres modales (detalle + batalla animada).

---
*Built with ❤️ by [FusionAI Agents](https://agents.fusionai.now)*
