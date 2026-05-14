import { initLLM } from './llm.js';
import { sendMessage } from './chat.js';
import {
  getPokemonCard,
  getEvolutionText,
  getFlavorText,
  capitalize,
  TYPE_COLORS,
  STAT_LABELS,
  MAX_STAT,
} from './pokeapi.js';

const loadingScreen = document.getElementById('loadingScreen');
const loadingBar = document.getElementById('loadingBar');
const loadingStatus = document.getElementById('loadingStatus');
const chatContainer = document.getElementById('chatContainer');
const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const chips = document.querySelectorAll('.suggestions .chip');

const detailPanel = document.getElementById('detailPanel');
const detailContent = document.getElementById('detailContent');
const detailClose = document.getElementById('detailClose');
const detailBackdrop = document.getElementById('detailBackdrop');

const POKEBALL_SVG = '/favicon.svg';
let isSending = false;

/* ---------- Utility ---------- */
function pad(n) { return String(n).padStart(3, '0'); }
function scrollToBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

function setSending(state) {
  isSending = state;
  sendBtn.disabled = state;
  userInput.disabled = state;
}

/* ---------- Message rendering ---------- */
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

  const col = document.createElement('div');
  col.className = 'message-col';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  col.appendChild(bubble);

  wrap.appendChild(col);
  messagesEl.appendChild(wrap);
  scrollToBottom();
  return col; // return the column so caller can append cards / actions
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

/* ---------- Pokémon card ---------- */
function renderPokemonCard(card) {
  const primaryType = card.types[0] || 'normal';
  const borderColor = TYPE_COLORS[primaryType] || '#888';

  const el = document.createElement('div');
  el.className = 'poke-card';
  el.style.borderColor = borderColor;
  el.style.setProperty('--type-color', borderColor);

  const typesHtml = card.types.map(t => {
    const c = TYPE_COLORS[t] || '#888';
    return `<span class="type-badge" style="background:${c}">${t}</span>`;
  }).join('');

  const statsHtml = card.stats.map(s => {
    const pct = Math.min(100, Math.round((s.value / MAX_STAT) * 100));
    const label = STAT_LABELS[s.name] || s.name;
    return `
      <div class="stat-row">
        <span class="stat-label">${label}</span>
        <div class="stat-bar"><div class="stat-fill" style="width:${pct}%;background:${borderColor}"></div></div>
        <span class="stat-val">${s.value}</span>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="poke-card-header">
      <div class="poke-card-art">
        <img src="${card.artwork}" alt="${card.name}" loading="lazy"
             onerror="this.onerror=null;this.src='${card.sprite || POKEBALL_SVG}'" />
      </div>
      <div class="poke-card-info">
        <div class="poke-card-num">#${pad(card.id)}</div>
        <div class="poke-card-name">${capitalize(card.name)}</div>
        <div class="poke-card-types">${typesHtml}</div>
        <div class="poke-card-meta">
          <span>📏 ${card.height} m</span>
          <span>⚖️ ${card.weight} kg</span>
        </div>
      </div>
    </div>
    <div class="poke-card-stats">${statsHtml}</div>
    <div class="poke-card-footer">
      <button class="see-more-btn" type="button">Ver más →</button>
    </div>
  `;

  el.querySelector('.see-more-btn').addEventListener('click', () => openDetail(card));
  return el;
}

/* ---------- Quick action buttons ---------- */
function renderQuickActions(col, pokemonInReply) {
  const wrap = document.createElement('div');
  wrap.className = 'quick-actions';

  let actions;
  if (pokemonInReply.length > 0) {
    const name = capitalize(pokemonInReply[0]);
    actions = [
      `¿Cuáles son las debilidades de ${name}?`,
      `¿Cómo evoluciona ${name}?`,
      `Compara ${name} con otro Pokémon`,
    ];
  } else {
    actions = [
      'Cuéntame más',
      'Dame otro ejemplo',
      'Recomiéndame un Pokémon legendario',
    ];
  }

  actions.forEach(text => {
    const btn = document.createElement('button');
    btn.className = 'quick-action';
    btn.type = 'button';
    btn.textContent = text;
    btn.addEventListener('click', () => {
      if (isSending) return;
      userInput.value = text;
      handleSend();
    });
    wrap.appendChild(btn);
  });

  col.appendChild(wrap);
  scrollToBottom();
}

/* ---------- Detail panel ---------- */
async function openDetail(card) {
  detailContent.innerHTML = `
    <div class="detail-loading">Cargando detalles de ${capitalize(card.name)}...</div>
  `;
  detailPanel.classList.add('open');
  detailPanel.setAttribute('aria-hidden', 'false');
  detailBackdrop.hidden = false;

  const primaryType = card.types[0] || 'normal';
  const borderColor = TYPE_COLORS[primaryType] || '#888';

  let evolutionText = '';
  let flavor = '';
  try {
    [evolutionText, flavor] = await Promise.all([
      getEvolutionText(card.name),
      getFlavorText(card.name, 'es'),
    ]);
  } catch (e) {
    // ignore
  }

  const typesHtml = card.types.map(t => {
    const c = TYPE_COLORS[t] || '#888';
    return `<span class="type-badge" style="background:${c}">${t}</span>`;
  }).join('');

  const statsHtml = card.stats.map(s => {
    const pct = Math.min(100, Math.round((s.value / MAX_STAT) * 100));
    const label = STAT_LABELS[s.name] || s.name;
    return `
      <div class="detail-stat-row">
        <span class="detail-stat-label">${label}</span>
        <div class="detail-stat-bar">
          <div class="detail-stat-fill" style="width:${pct}%;background:${borderColor}"></div>
        </div>
        <span class="detail-stat-val">${s.value}</span>
      </div>`;
  }).join('');

  const abilitiesHtml = (card.abilities || []).map(a => `<span class="ability-chip">${capitalize(a)}</span>`).join('');

  detailContent.innerHTML = `
    <div class="detail-art" style="--type-color:${borderColor}">
      <img src="${card.artwork}" alt="${card.name}"
           onerror="this.onerror=null;this.src='${card.sprite || POKEBALL_SVG}'" />
    </div>
    <div class="detail-title">
      <div class="detail-num">#${pad(card.id)}</div>
      <h2>${capitalize(card.name)}</h2>
      <div class="detail-types">${typesHtml}</div>
    </div>

    ${flavor ? `<p class="detail-flavor">${flavor}</p>` : ''}

    <div class="detail-section">
      <h3>Estadísticas base</h3>
      <div class="detail-stats">${statsHtml}</div>
    </div>

    <div class="detail-section">
      <h3>Habilidades</h3>
      <div class="abilities">${abilitiesHtml || '<span class="muted">—</span>'}</div>
    </div>

    <div class="detail-section">
      <h3>Línea evolutiva</h3>
      <div class="evolution-text">${evolutionText || '<span class="muted">Sin evolución conocida</span>'}</div>
    </div>

    <div class="detail-section detail-meta">
      <span>📏 Altura: <strong>${card.height} m</strong></span>
      <span>⚖️ Peso: <strong>${card.weight} kg</strong></span>
    </div>
  `;

  // Animate stat bars in
  requestAnimationFrame(() => {
    detailContent.querySelectorAll('.detail-stat-fill').forEach(el => {
      el.classList.add('animate-in');
    });
  });
}

function closeDetail() {
  detailPanel.classList.remove('open');
  detailPanel.setAttribute('aria-hidden', 'true');
  detailBackdrop.hidden = true;
}
detailClose.addEventListener('click', closeDetail);
detailBackdrop.addEventListener('click', closeDetail);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
});

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
    const { reply, pokemonInReply } = await sendMessage(text);
    removeTypingIndicator();

    const col = addMessage(reply, 'bot');

    // Render cards for each pokémon mentioned
    if (pokemonInReply && pokemonInReply.length > 0) {
      const cardsWrap = document.createElement('div');
      cardsWrap.className = 'poke-cards';
      col.appendChild(cardsWrap);

      // Fetch cards in parallel, render in order, skip silently on error
      const results = await Promise.allSettled(pokemonInReply.map(getPokemonCard));
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
          try {
            cardsWrap.appendChild(renderPokemonCard(r.value));
          } catch (e) { /* skip */ }
        }
      });
      scrollToBottom();
    }

    renderQuickActions(col, pokemonInReply || []);
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
