# Pokémon AI 🤖

Chat con inteligencia artificial sobre Pokémon, ejecutándose **100% localmente en tu navegador** usando WebLLM.

## ¿Cómo funciona?
- Usa **WebLLM** para ejecutar un LLM (Llama 3.2 1B) directamente en el navegador via WebGPU
- Consulta la **PokéAPI** en tiempo real para obtener datos precisos de Pokémon
- El modelo se descarga una vez (~800MB) y queda en caché del navegador

## Requisitos
- Navegador con soporte WebGPU (Chrome 113+, Edge 113+)
- ~2GB de RAM disponible para el modelo
- Conexión a internet la primera vez (para descargar el modelo)

## Instalación

```bash
npm install
npm run dev
```

Abre http://localhost:5173

## Build para producción

```bash
npm run build
npm run preview
```

## Stack
- [WebLLM](https://github.com/mlc-ai/web-llm) — LLM en el browser via WebGPU
- [Vite](https://vitejs.dev/) — build tool
- [PokéAPI](https://pokeapi.co/) — datos de Pokémon
