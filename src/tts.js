// ===========================================================
// tts.js — Kokoro TTS (local text-to-speech via WebGPU)
// ===========================================================
import { KokoroTTS } from 'kokoro-js';

let tts = null;
let loadingPromise = null;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Spanish voices exist in kokoro: ef_dora (female ES), em_alex (male ES)
const VOICE_ES = 'ef_dora';
const VOICE_EN = 'af_heart';

// Lazy init — only loads the ~92MB model when first needed
export async function initTTS(onProgress) {
  if (tts) return tts;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
    tts = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: isMobile ? 'q8' : 'fp32',
      device: 'webgpu',
      progress_callback: onProgress || (() => {}),
    });
    return tts;
  })();

  return loadingPromise;
}

export function ttsReady() {
  return tts !== null;
}

// Pick a voice based on the text language (Spanish accents → ES voice)
export function voiceForLang(text) {
  const spanishHints = /[áéíóúñ¿¡]/i;
  // common Spanish words for ascii-only text
  const spWords = /\b(que|cómo|como|cuál|cual|qué|tiene|poder|gana|hola|tipos|es|son|los|las|para|con|más|mas)\b/i;
  if (spanishHints.test(text) || spWords.test(text)) return VOICE_ES;
  return VOICE_EN;
}

// Generate audio and return a playable Blob URL
export async function speak(text, voice) {
  if (!tts) await initTTS();
  if (!text || !text.trim()) return null;

  // Strip emojis & markdown that distort TTS pronunciation
  const clean = text
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[#*_`>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return null;

  const chosen = voice || voiceForLang(clean);
  let audio;
  try {
    audio = await tts.generate(clean, { voice: chosen });
  } catch (e) {
    audio = await tts.generate(clean, { voice: VOICE_EN });
  }

  if (!audio || typeof audio.toBlob !== 'function') return null;
  return URL.createObjectURL(audio.toBlob());
}
