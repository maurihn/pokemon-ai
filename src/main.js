import { initLLM } from './llm.js';
import { sendMessage } from './chat.js';

const loadingScreen = document.getElementById('loadingScreen');
const loadingBar = document.getElementById('loadingBar');
const loadingStatus = document.getElementById('loadingStatus');
const chatContainer = document.getElementById('chatContainer');
const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const chips = document.querySelectorAll('.chip');

const POKEBALL_SVG = '/favicon.svg';
let isSending = false;

/* ---------- UI helpers ---------- */
function addMessage(text, role = 'bot') {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;

  if (role === 'bot') {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    const img = document.createElement('img');
    img.src = POKEBALL_SVG;
    img.alt = 'Bot';
    avatar.appendChild(img);
    wrap.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  wrap.appendChild(bubble);

  messagesEl.appendChild(wrap);
  scrollToBottom();
  return wrap;
}

function addTypingIndicator() {
  const wrap = document.createElement('div');
  wrap.className = 'message bot typing';
  wrap.id = 'typingIndicator';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  const img = document.createElement('img');
  img.src = POKEBALL_SVG;
  avatar.appendChild(img);
  wrap.appendChild(avatar);

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
  wrap.appendChild(bubble);

  messagesEl.appendChild(wrap);
  scrollToBottom();
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setSending(state) {
  isSending = state;
  sendBtn.disabled = state;
  userInput.disabled = state;
}

/* ---------- Send flow ---------- */
async function handleSend() {
  if (isSending) return;
  const text = userInput.value.trim();
  if (!text) return;

  userInput.value = '';
  addMessage(text, 'user');
  addTypingIndicator();
  setSending(true);

  try {
    const reply = await sendMessage(text);
    removeTypingIndicator();
    addMessage(reply, 'bot');
  } catch (err) {
    console.error(err);
    removeTypingIndicator();
    addMessage('⚠️ Ups, hubo un error procesando tu mensaje. Intenta de nuevo.', 'bot');
  } finally {
    setSending(false);
    userInput.focus();
  }
}

/* ---------- Event listeners ---------- */
sendBtn.addEventListener('click', handleSend);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

chips.forEach(chip => {
  chip.addEventListener('click', () => {
    const text = chip.dataset.text;
    userInput.value = text;
    handleSend();
  });
});

/* ---------- Bootstrap ---------- */
async function boot() {
  try {
    await initLLM((status, progress) => {
      const pct = Math.round((progress || 0) * 100);
      loadingBar.style.width = `${pct}%`;
      loadingStatus.textContent = status || `Cargando... ${pct}%`;
    });

    // Loaded -> hide loading, show chat
    loadingScreen.style.display = 'none';
    chatContainer.classList.remove('hidden');
    addMessage('¡Hola! Soy el Professor AI 🧪 Estoy aquí para responder todas tus preguntas sobre Pokémon. ¿En qué puedo ayudarte?', 'bot');
    userInput.focus();
  } catch (err) {
    console.error(err);
    loadingStatus.textContent = `❌ Error: ${err.message || err}. Asegúrate de usar un navegador con WebGPU (Chrome/Edge 113+).`;
    loadingBar.style.background = '#c1121f';
  }
}

document.addEventListener('DOMContentLoaded', boot);
