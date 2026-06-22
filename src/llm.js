// v1.0.1 - analytics enabled
import { pipeline, TextStreamer } from '@huggingface/transformers';

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

let generator = null;

export async function initLLM(onProgress) {
  onProgress('Cargando Gemma 4...', 0);

  // Aggregate download progress across all model files ourselves, because
  // Transformers.js v4 emits per-file 'progress' events (status 'progress',
  // with loaded/total bytes), not a single 'downloading' event.
  const files = {}; // file -> { loaded, total }

  const report = () => {
    let loaded = 0, total = 0;
    for (const f of Object.values(files)) {
      loaded += f.loaded || 0;
      total  += f.total  || 0;
    }
    if (total > 0) {
      const pct = Math.min(0.99, loaded / total);
      const mb = (loaded / 1048576).toFixed(0);
      const tot = (total / 1048576).toFixed(0);
      onProgress(`Descargando modelo... ${mb} / ${tot} MB`, pct);
    }
  };

  generator = await pipeline('text-generation', MODEL_ID, {
    device: 'webgpu',
    dtype: 'q4',
    progress_callback: (p) => {
      switch (p.status) {
        case 'initiate':
        case 'download':
          if (p.file && !files[p.file]) files[p.file] = { loaded: 0, total: 0 };
          break;
        case 'progress':
          if (p.file) {
            files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
            report();
          }
          break;
        case 'progress_total':
          // aggregate event (when available) — use directly
          if (p.total) {
            const pct = Math.min(0.99, (p.loaded || 0) / p.total);
            const mb = ((p.loaded || 0) / 1048576).toFixed(0);
            const tot = (p.total / 1048576).toFixed(0);
            onProgress(`Descargando modelo... ${mb} / ${tot} MB`, pct);
          }
          break;
        case 'done':
          if (p.file && files[p.file]) files[p.file].loaded = files[p.file].total;
          report();
          break;
        case 'ready':
          onProgress('¡Modelo listo!', 1);
          break;
        default:
          break;
      }
    }
  });

  // Compiling/warming up the WebGPU kernels happens after download — show near-complete
  onProgress('Preparando modelo en WebGPU...', 0.99);
  return generator;
}

function extractText(result) {
  const output = result[0]?.generated_text;
  if (Array.isArray(output)) {
    const last = output[output.length - 1];
    return last?.content || String(last || '');
  }
  return String(output || '');
}

// Standard non-streaming generation
export async function chat(messages) {
  if (!generator) throw new Error('Model not initialized');
  const result = await generator(messages, {
    max_new_tokens: isMobile ? 300 : 600,
    temperature: 0.7,
    do_sample: true,
    return_full_text: false,
  });
  return extractText(result);
}

// Streaming generation — onToken(textChunk) fires for each new piece of text.
// Returns the full final text when done.
export async function chatStream(messages, onToken) {
  if (!generator) throw new Error('Model not initialized');

  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text) => {
      if (text && onToken) onToken(text);
    },
  });

  const result = await generator(messages, {
    max_new_tokens: isMobile ? 300 : 600,
    temperature: 0.7,
    do_sample: true,
    return_full_text: false,
    streamer,
  });
  return extractText(result);
}

export function isReady() {
  return generator !== null;
}
