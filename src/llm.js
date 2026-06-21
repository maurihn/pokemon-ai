// v1.0.1 - analytics enabled
import { pipeline } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

let generator = null;

export async function initLLM(onProgress) {
  onProgress('Cargando Gemma 4...', 0);

  generator = await pipeline('text-generation', MODEL_ID, {
    device: 'webgpu',
    dtype: 'q4',
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
  const result = await generator(messages, {
    max_new_tokens: isMobile ? 256 : 512,
    temperature: 0.7,
    do_sample: true,
    return_full_text: false,
  });
  const output = result[0]?.generated_text;
  if (Array.isArray(output)) {
    const last = output[output.length - 1];
    return last?.content || String(last || '');
  }
  return String(output || '');
}

// Tool-calling version — returns the full last message object so caller can inspect tool_calls
export async function chatWithTools(messages, tools) {
  if (!generator) throw new Error('Model not initialized');
  const result = await generator(messages, {
    max_new_tokens: isMobile ? 256 : 512,
    temperature: 0.7,
    do_sample: true,
    return_full_text: false,
    tools: tools || null,
  });
  const output = result[0]?.generated_text;
  if (Array.isArray(output)) {
    return output[output.length - 1]; // return full message object {role, content, tool_calls?}
  }
  return { role: 'assistant', content: String(output || '') };
}

export function isReady() {
  return generator !== null;
}
