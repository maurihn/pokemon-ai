import * as webllm from '@mlc-ai/web-llm';

let engine = null;

const MODEL_ID = 'Llama-3.2-1B-Instruct-q4f32_1-MLC';

export async function initLLM(onProgress) {
  const initProgressCallback = (report) => {
    onProgress(report.text, report.progress);
  };

  engine = await webllm.CreateMLCEngine(MODEL_ID, {
    initProgressCallback,
  });

  return engine;
}

export async function chat(messages) {
  if (!engine) throw new Error('Engine not initialized');

  const response = await engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: 512,
  });

  return response.choices[0].message.content;
}

export function isReady() {
  return engine !== null;
}
