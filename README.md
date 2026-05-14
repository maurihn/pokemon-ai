# Pokémon AI 🤖

Chat con inteligencia artificial sobre Pokémon, ejecutándose **100% localmente en tu navegador** usando WebLLM.

## ¿Cómo funciona?
- Usa **WebLLM** para ejecutar un LLM (Llama 3.2 1B) directamente en el navegador via WebGPU
- Consulta la **PokéAPI** en tiempo real para obtener datos precisos de Pokémon
- El modelo se descarga una vez (~800MB) y queda en caché del navegador
- Renderiza **cards interactivas** con artwork, stats y tipos cuando se mencionan Pokémon

## Requisitos
- Navegador con soporte WebGPU (Chrome 113+, Edge 113+)
- ~2GB de RAM disponible para el modelo
- Conexión a internet la primera vez (para descargar el modelo)
- [pnpm](https://pnpm.io/) instalado (`npm i -g pnpm`)

## Instalación

```bash
pnpm install
pnpm dev
```

Abre http://localhost:5173

> Este proyecto usa **pnpm** como gestor de paquetes (ver `packageManager` en `package.json`). El archivo `.npmrc` con `shamefully-hoist=true` asegura compatibilidad con dependencias que esperan un layout plano de `node_modules`. Se commitea `pnpm-lock.yaml` para builds reproducibles.

## Build para producción

```bash
pnpm build
pnpm preview
```

## Stack
- [WebLLM](https://github.com/mlc-ai/web-llm) — LLM en el browser via WebGPU
- [Vite](https://vitejs.dev/) — build tool
- [PokéAPI](https://pokeapi.co/) — datos de Pokémon
- [pnpm](https://pnpm.io/) — gestor de paquetes

---

⚡ Powered by **FusionAI Agents**
