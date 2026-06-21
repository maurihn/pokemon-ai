import { pipeline, TextStreamer } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

let generator = null;

export async function initLLM(onProgress) {
  // onProgress(text, fraction) — same signature as before
  onProgress('Cargando Gemma 4...', 0);

  generator = await pipeline('text-generation', MODEL_ID, {
    device: 'webgpu',
    dtype: isMobile ? 'q4' : 'q4',
    progress_callback: (progress) => {
      if (progress.status === 'downloading') {
        const pct = progress.total ? progress.loaded / progress.total : 0;
        const mb = progress.loaded ? (progress.loaded / 1024 / 1024).toFixed(1) : '?';
        const total = progress.total ? (progress.total / 1024 / 1024).toFixed(1) : '?';
        onProgress(`Descargando ${progress.file || 'modelo'}... ${mb}MB / ${total}MB`, pct);
      } else if (progress.status === 'loading') {
        onProgress(`Cargando ${progress.file || 'modelo'}...`, 0.9);
      } else if (progress.status === 'ready') {
        onProgress('¡Modelo listo!', 1);
      }
    }
  });

  return generator;
}

export async function chat(messages) {
  if (!generator) throw new Error('Model not initialized');

  // Transformers.js expects messages in the same OpenAI format
  const result = await generator(messages, {
    max_new_tokens: isMobile ? 256 : 512,
    temperature: 0.7,
    do_sample: true,
    return_full_text: false,
  });

  // Extract the generated text from the result
  const output = result[0]?.generated_text;
  if (Array.isArray(output)) {
    // If it returns the full conversation array, get the last assistant message
    const last = output[output.length - 1];
    return last?.content || last || '';
  }
  return String(output || '');
}

export function isReady() {
  return generator !== null;
}
