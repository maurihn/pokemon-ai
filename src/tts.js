// ===========================================================
// tts.js — Kokoro TTS (local text-to-speech via WebGPU)
// ===========================================================
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';

let tts = null;
let loadingPromise = null;
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// NOTE: the Kokoro-82M-v1.0-ONNX build bundled by kokoro-js only ships ENGLISH
// voices (af_/am_ American, bf_/bm_ British). Spanish voices (ef_dora) are NOT
// included in this model, so we use a clear English voice that reads both EN and
// ES text intelligibly. af_heart = highest-quality female voice.
const VOICE_ES = 'af_heart';
const VOICE_EN = 'af_heart';
const DEFAULT_VOICE = 'af_heart';

// Voices that actually exist in this model build
const VALID_VOICES = new Set([
  'af_heart','af_alloy','af_aoede','af_bella','af_jessica','af_kore','af_nicole',
  'af_nova','af_river','af_sarah','af_sky','am_adam','am_echo','am_eric','am_fenrir',
  'am_liam','am_michael','am_onyx','am_puck','am_santa','bf_emma','bf_isabella',
  'bm_george','bm_lewis','bf_alice','bf_lily','bm_daniel','bm_fable'
]);
function safeVoice(v) { return VALID_VOICES.has(v) ? v : DEFAULT_VOICE; }

// ── Shared AudioContext (must be unlocked by a user gesture) ──
let audioCtx = null;
export function unlockAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Play a RawAudio (Float32 PCM) via Web Audio. Returns a promise that
// resolves when playback ends. Bypasses HTMLAudioElement autoplay limits.
function playRawAudio(raw) {
  return new Promise((resolve) => {
    try {
      const ctx = unlockAudio();
      if (!ctx || !raw) return resolve();

      // RawAudio exposes the samples either via the `.data` getter or the
      // `.audio` field (Float32Array, or Float32Array[] of chunks).
      let data = raw.data;
      if (!data) {
        const a = raw.audio;
        if (Array.isArray(a)) {
          // concat chunks
          const len = a.reduce((n, c) => n + (c?.length || 0), 0);
          data = new Float32Array(len);
          let off = 0;
          for (const c of a) { if (c) { data.set(c, off); off += c.length; } }
        } else {
          data = a;
        }
      }
      if (!data || !data.length) return resolve();

      const rate = raw.sampling_rate || raw.sampleRate || 24000;
      const buffer = ctx.createBuffer(1, data.length, rate);
      buffer.getChannelData(0).set(data);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.onended = () => resolve();
      src.start();
    } catch (e) {
      console.error('playRawAudio error', e);
      resolve();
    }
  });
}

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

  const chosen = safeVoice(voice || voiceForLang(clean));
  let audio;
  try {
    audio = await tts.generate(clean, { voice: chosen });
  } catch (e) {
    audio = await tts.generate(clean, { voice: VOICE_EN });
  }

  if (!audio || typeof audio.toBlob !== 'function') return null;
  return URL.createObjectURL(audio.toBlob());
}

// Generate + play via Web Audio (reliable, no autoplay block). Resolves when done.
export async function speakAndPlay(text, voice) {
  if (!tts) await initTTS();
  if (!text || !text.trim()) return;
  const clean = text
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[#*_`>~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return;
  const chosen = safeVoice(voice || voiceForLang(clean));
  let audio;
  try { audio = await tts.generate(clean, { voice: chosen }); }
  catch { audio = await tts.generate(clean, { voice: VOICE_EN }); }
  if (audio) await playRawAudio(audio);
}

// ===========================================================
// Streaming speak — feed text chunks as the LLM generates them,
// speak each complete sentence as soon as it's ready.
// ===========================================================
export function createSpeechStream(voice) {
  const splitter = new TextSplitterStream();
  const audioQueue = [];   // RawAudio objects
  let playing = false;
  let stopped = false;
  let streamDone = false;
  const chosen = safeVoice(voice || DEFAULT_VOICE);

  // Play queued RawAudio one after another via Web Audio
  async function playNext() {
    if (playing || stopped) return;
    const next = audioQueue.shift();
    if (!next) return;
    playing = true;
    await playRawAudio(next);
    playing = false;
    if (!stopped) playNext();
  }

  // Consume Kokoro's sentence stream → enqueue RawAudio
  (async () => {
    try {
      for await (const chunk of tts.stream(splitter, { voice: chosen })) {
        if (stopped) break;
        if (chunk && chunk.audio) {
          audioQueue.push(chunk.audio);
          playNext();
        }
      }
    } catch (e) {
      if (!stopped) console.error('TTS stream error', e);
    } finally {
      streamDone = true;
    }
  })();

  return {
    push(text) {
      if (stopped || !text) return;
      const clean = text
        .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
        .replace(/[#*_`>~|]/g, '');
      if (clean) splitter.push(clean);
    },
    done() { try { splitter.close(); } catch {} },
    stop() {
      stopped = true;
      audioQueue.length = 0;
      try { splitter.close(); } catch {}
    },
    // resolves when stream finished generating AND queue is drained
    async waitUntilDone() {
      while (!stopped && (!streamDone || playing || audioQueue.length > 0)) {
        await new Promise(r => setTimeout(r, 120));
      }
    }
  };
}
