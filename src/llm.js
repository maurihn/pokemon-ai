// analytics enabled
import * as webllm from '@mlc-ai/web-llm';

let engine = null;

// Lighter quantization = less RAM, better for mobile (iPhone/Safari)
const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

// Detect mobile to reduce token usage and avoid OOM crashes
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export async function initLLM(onProgress) {
  engine = await webllm.CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (report) => {
      onProgress(report.text, report.progress);
    },
  });
  return engine;
}

export async function chat(messages) {
  if (!engine) throw new Error('Engine not initialized');
  const response = await engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: isMobile ? 256 : 512,
  });
  return response.choices[0].message.content;
}

export function isReady() {
  return engine !== null;
}
