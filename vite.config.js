import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: ['@huggingface/transformers', 'kokoro-js']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'esnext'
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    }
  }
})
