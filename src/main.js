// ===========================================================
// main.js — wires DOM, voice, LLM init, cards, modals, battle
// ===========================================================

import { initLLM } from './llm.js';
import { sendMessage, clearHistory } from './chat.js';
import { initTTS, speakAndPlay, ttsReady, voiceForLang, createSpeechStream, unlockAudio } from './tts.js';
import {
  TYPE_COLORS, STAT_LABELS, STAT_LABELS_ES, MAX_STAT,
  capitalize, pad3, officialArt, fallbackSprite, hexToRgba,
  getPokemonByName, getPokemonCard, getEvolutionText, getFlavorText
} from './pokeapi.js';

// ----------------- DOM refs -----------------
const loadingScreen   = document.getElementById('loadingScreen');
const loadingBar      = document.getElementById('loadingBar');
const loadingStatus   = document.getElementById('loadingStatus');
const chatContainer   = document.getElementById('chatContainer');
const messagesEl      = document.getElementById('messages');
const userInput       = document.getElementById('userInput');
const sendBtn         = document.getElementById('sendBtn');
const voiceBtn        = document.getElementById('voiceBtn');
const voiceStatus     = document.getElementById('voiceStatus');
const liveToggle      = document.getElementById('liveToggle');
const liveStatus      = document.getElementById('liveStatus');

const detailBackdrop  = document.getElementById('detailBackdrop');
const detailModal     = document.getElementById('detailModal');
const detailClose     = document.getElementById('detailClose');
const modalLeft       = document.getElementById('modalLeft');
const modalRight      = document.getElementById('modalRight');

const battleModal     = document.getElementById('battleModal'); // .cmp-backdrop
const cmpModalEl      = document.getElementById('cmpModal');
const cmpCloseBtn     = document.getElementById('cmpClose');
const cmpColsEl       = document.getElementById('cmpCols');
const cmpStatsEl      = document.getElementById('cmpStats');
const cmpVsOverlay    = document.getElementById('cmpVsOverlay');
const cmpVsFlash      = document.getElementById('cmpVsFlash');
const cmpWinnerScr    = document.getElementById('cmpWinnerScreen');
const cmpWinnerIn     = document.getElementById('cmpWinnerInner');
const cmpConfettiC    = document.getElementById('cmpConfetti');

// ----------------- Util -----------------
const cap = s => capitalize(s);
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

function typeBadge(type) {
  const color = TYPE_COLORS[type] || '#888';
  return `<span class="type-badge t-${type}" style="background:${color}">${type}</span>`;
}

// ----------------- Messages -----------------
function addMessage(text, role) {
  const col = document.createElement('div');
  col.className = `message-col ${role}`;

  const row = document.createElement('div');
  row.className = 'bubble-row';

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? '🧑' : '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;

  if (role === 'user') {
    row.appendChild(bubble);
    row.appendChild(avatar);
  } else {
    row.appendChild(avatar);
    row.appendChild(bubble);
    // 🔊 speak button on bot messages
    const speakBtn = document.createElement('button');
    speakBtn.className = 'speak-btn';
    speakBtn.title = 'Escuchar';
    speakBtn.textContent = '🔊';
    speakBtn.addEventListener('click', () => playTTS(bubble.textContent || text, speakBtn));
    row.appendChild(speakBtn);
  }
  col.appendChild(row);
  messagesEl.appendChild(col);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return col;
}

function addTypingIndicator() {
  const col = document.createElement('div');
  col.className = 'message-col bot typing';
  col.innerHTML = `
    <div class="bubble-row">
      <div class="avatar">🤖</div>
      <div class="bubble"><div class="dots"><span></span><span></span><span></span></div></div>
    </div>`;
  messagesEl.appendChild(col);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return col;
}
function removeTypingIndicator(el) { el && el.remove(); }

// ----------------- Pokémon cards in chat -----------------
// Normalize a raw PokéAPI object (battle path) into the flattened card shape
// that getPokemonCard() produces, so this function works with either input.
function normalizeCard(p) {
  if (!p) return null;
  // Already a flattened card (types is a string array)
  if (Array.isArray(p.types) && typeof p.types[0] === 'string') return p;
  // Raw PokéAPI shape (types[i].type.name)
  return {
    id: p.id,
    name: p.name,
    types: p.types.map(t => t.type.name),
    stats: p.stats.map(s => ({ name: s.stat.name, value: s.base_stat })),
    abilities: p.abilities.map(a => ({ name: a.ability.name, hidden: a.is_hidden })),
    height: p.height / 10,
    weight: p.weight / 10,
    sprite: p.sprites?.front_default,
    artwork: officialArt(p.id),
    raw: p
  };
}

async function renderPokemonCard(nameOrCard) {
  let card;
  try {
    card = typeof nameOrCard === 'string'
      ? await getPokemonCard(nameOrCard)
      : normalizeCard(nameOrCard);
  } catch { return null; }
  if (!card) return null;

  const primary = card.types[0];
  const color = TYPE_COLORS[primary] || '#888';
  const el = document.createElement('div');
  el.className = 'poke-card';
  el.style.setProperty('--type-color', color);

  const statsKeys = ['hp', 'attack', 'defense', 'speed'];
  const statsMap = Object.fromEntries(card.stats.map(s => [s.name, s.value]));

  el.innerHTML = `
    <div class="poke-card-art">
      <img alt="${escapeHtml(card.name)}" src="${card.artwork}"
           onerror="this.onerror=null;this.src='${fallbackSprite(card.id)}';" />
    </div>
    <div class="poke-card-body">
      <div class="poke-card-num">#${pad3(card.id)}</div>
      <div class="poke-card-name">${escapeHtml(card.name)}</div>
      <div class="poke-card-types">${card.types.map(typeBadge).join('')}</div>
      <div class="poke-card-stats">
        ${statsKeys.map(k => {
          const v = statsMap[k] ?? 0;
          const pct = Math.min(100, (v / MAX_STAT) * 100);
          return `
            <div class="mini-stat-row">
              <span class="mini-stat-label">${STAT_LABELS[k]}</span>
              <div class="mini-stat-bar-wrap"><div class="mini-stat-bar-fill" style="width:${pct}%"></div></div>
              <span class="mini-stat-val">${v}</span>
            </div>`;
        }).join('')}
      </div>
      <button class="see-more-btn">Ver detalle →</button>
    </div>
  `;
  el.querySelector('.see-more-btn').addEventListener('click', e => {
    e.stopPropagation();
    openDetailModal(card);
  });
  el.addEventListener('click', () => openDetailModal(card));
  return el;
}

function renderQuickActions(container, names) {
  if (!names || names.length === 0) return;
  const wrap = document.createElement('div');
  wrap.className = 'quick-actions';
  const first = names[0];
  const suggestions = [
    { label: `📊 Stats de ${capitalize(first)}`, text: `Dame las estadísticas de ${first}` },
    { label: `🔍 Debilidades`, text: `¿Cuáles son las debilidades de ${first}?` },
    { label: `🌱 Evolución`, text: `¿Cómo evoluciona ${first}?` },
  ];
  if (names.length >= 2) {
    suggestions.push({ label: `⚔️ ${capitalize(names[0])} vs ${capitalize(names[1])}`, text: `¿Quién gana, ${names[0]} vs ${names[1]}?` });
  }
  suggestions.forEach(s => {
    const b = document.createElement('button');
    b.className = 'quick-action';
    b.textContent = s.label;
    b.addEventListener('click', () => {
      userInput.value = s.text;
      handleSend();
    });
    wrap.appendChild(b);
  });
  container.appendChild(wrap);
}

// ----------------- Detail modal -----------------
async function openDetailModal(card) {
  const primary = card.types[0];
  const color = TYPE_COLORS[primary] || '#888';

  modalLeft.style.setProperty('--type-color', color);
  modalRight.style.setProperty('--type-color', color);

  modalLeft.innerHTML = `
    <img alt="${escapeHtml(card.name)}" src="${card.artwork}"
         onerror="this.onerror=null;this.src='${fallbackSprite(card.id)}';" />
    <div class="poke-card-types">${card.types.map(typeBadge).join('')}</div>
  `;

  // Show right side with placeholders while we fetch flavor + evo
  modalRight.innerHTML = `
    <h2>${escapeHtml(card.name)}</h2>
    <div class="modal-num">#${pad3(card.id)}</div>
    <div class="modal-meta">
      <div class="meta-chip"><div class="val">${card.height.toFixed(1)} m</div><div class="lbl">Altura</div></div>
      <div class="meta-chip"><div class="val">${card.weight.toFixed(1)} kg</div><div class="lbl">Peso</div></div>
      <div class="meta-chip"><div class="val">${card.stats.reduce((s,x)=>s+x.value,0)}</div><div class="lbl">BST</div></div>
    </div>

    <div class="modal-section">
      <h3>Stats base</h3>
      ${card.stats.map(s => {
        const pct = Math.min(100, (s.value / MAX_STAT) * 100);
        return `
          <div class="modal-stat-row">
            <span class="modal-stat-label">${STAT_LABELS[s.name] || s.name}</span>
            <div class="modal-stat-bar-wrap">
              <div class="modal-stat-fill" data-w="${pct}"></div>
            </div>
            <span class="modal-stat-val">${s.value}</span>
          </div>`;
      }).join('')}
    </div>

    <div class="modal-section">
      <h3>Habilidades</h3>
      <div class="ability-chips">
        ${card.abilities.map(a => `<span class="ability-chip ${a.hidden?'hidden-ability':''}">${a.name.replace(/-/g,' ')}${a.hidden?' ✦':''}</span>`).join('')}
      </div>
    </div>

    <div class="modal-section" id="modalEvoSection" style="display:none;">
      <h3>Línea evolutiva</h3>
      <div class="modal-evo" id="modalEvo"></div>
    </div>

    <div class="modal-section" id="modalFlavorSection" style="display:none;">
      <h3>Descripción</h3>
      <p class="modal-flavor" id="modalFlavor"></p>
    </div>
  `;

  detailBackdrop.classList.remove('hidden');
  detailModal.classList.remove('hidden');

  // Animate bars
  requestAnimationFrame(() => {
    modalRight.querySelectorAll('.modal-stat-fill').forEach(f => {
      f.style.width = f.dataset.w + '%';
    });
  });

  // Fetch flavor + evolution in parallel
  try {
    const [flavor, evo] = await Promise.all([
      getFlavorText(card.name, 'es'),
      getEvolutionText(card.name)
    ]);
    if (flavor) {
      const sec = document.getElementById('modalFlavorSection');
      document.getElementById('modalFlavor').textContent = flavor;
      if (sec) sec.style.display = '';
    }
    if (evo) {
      const sec = document.getElementById('modalEvoSection');
      document.getElementById('modalEvo').textContent = evo;
      if (sec) sec.style.display = '';
    }
  } catch { /* ignore */ }
}

function closeDetailModal() {
  detailBackdrop.classList.add('hidden');
  detailModal.classList.add('hidden');
}

// ===========================================================
// BATTLE / COMPARISON MODAL — ported from pokedex-reference.html
// ===========================================================

let cmpAnimTimers = [];
let cmpConfettiRAF = 0;
let _confettiState = null;

function cmpClearTimers() {
  cmpAnimTimers.forEach(id => clearTimeout(id));
  cmpAnimTimers = [];
  if (cmpConfettiRAF) cancelAnimationFrame(cmpConfettiRAF);
  cmpConfettiRAF = 0;
}
function cmpDelay(ms) {
  return new Promise(res => cmpAnimTimers.push(setTimeout(res, ms)));
}

// raw PokéAPI shape is used here (a.types[i].type.name, a.stats[i].stat.name etc.)
function renderComparison(a, b) {
  const totalA = a.stats.reduce((s, x) => s + x.base_stat, 0);
  const totalB = b.stats.reduce((s, x) => s + x.base_stat, 0);
  const winner = totalA > totalB ? 'a' : (totalB > totalA ? 'b' : 'tie');

  function colHtml(p, isWinner) {
    const primary = p.types[0].type.name;
    const color = TYPE_COLORS[primary] || '#6890F0';
    const glowStrong = hexToRgba(color, 0.30);
    return `
      <div class="cmp-col" style="--col-glow:${hexToRgba(color, 0.18)};--col-glow-strong:${glowStrong};">
        <div class="cmp-img-wrap">
          <img alt="${p.name}" src="${officialArt(p.id)}"
               onerror="this.onerror=null;this.src='${fallbackSprite(p.id)}';" />
        </div>
        <div class="cmp-name-row">
          <div>
            <div class="cmp-num">#${pad3(p.id)}</div>
            <div class="cmp-name">${cap(p.name)}</div>
          </div>
          <div class="types">
            ${p.types.map(t => `<span class="type-badge t-${t.type.name}" style="background:${TYPE_COLORS[t.type.name]||'#888'}">${t.type.name}</span>`).join('')}
          </div>
        </div>
        ${isWinner ? `<div class="cmp-winner-badge">🏆 Total BST winner</div>` : ''}
        <div class="cmp-info">
          <div class="info-chip"><div class="label">Altura</div><div class="value">${(p.height/10).toFixed(1)} m</div></div>
          <div class="info-chip"><div class="label">Peso</div><div class="value">${(p.weight/10).toFixed(1)} kg</div></div>
        </div>
        <div>
          <div class="section-title">Habilidades</div>
          <div class="abilities">
            ${p.abilities.map(ab => `<span class="ability-pill ${ab.is_hidden?'hidden-ability':''}" title="${ab.is_hidden?'Habilidad oculta':'Habilidad'}">${ab.ability.name.replace(/-/g,' ')}${ab.is_hidden?' ✦':''}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

  cmpColsEl.innerHTML = colHtml(a, winner === 'a') + colHtml(b, winner === 'b');

  // Stats rows
  const statKeys = ['hp','attack','defense','special-attack','special-defense','speed'];
  const statsA = Object.fromEntries(a.stats.map(s => [s.stat.name, s.base_stat]));
  const statsB = Object.fromEntries(b.stats.map(s => [s.stat.name, s.base_stat]));
  const MAX_STAT_VIS = 200;

  let rowsHtml = `<h3>Comparación de stats</h3>`;
  statKeys.forEach(k => {
    const va = statsA[k] ?? 0;
    const vb = statsB[k] ?? 0;
    const clsA = va > vb ? 'winner' : (va < vb ? 'loser' : 'tie');
    const clsB = vb > va ? 'winner' : (vb < va ? 'loser' : 'tie');
    const pctA = Math.max(4, Math.min(100, (va / MAX_STAT_VIS) * 100));
    const pctB = Math.max(4, Math.min(100, (vb / MAX_STAT_VIS) * 100));
    rowsHtml += `
      <div class="cmp-stat-row">
        <div class="cmp-bar-wrap left">
          <div class="cmp-bar-fill ${clsA}" data-w="${pctA}" style="width:0">${va}</div>
        </div>
        <div class="cmp-stat-label">${STAT_LABELS_ES[k] || k}</div>
        <div class="cmp-bar-wrap right">
          <div class="cmp-bar-fill ${clsB}" data-w="${pctB}" style="width:0">${vb}</div>
        </div>
      </div>
    `;
  });

  const clsTA = totalA > totalB ? 'winner' : (totalA < totalB ? 'loser' : 'tie');
  const clsTB = totalB > totalA ? 'winner' : (totalB < totalA ? 'loser' : 'tie');
  const MAX_TOTAL_VIS = 800;
  const pctTA = Math.max(4, Math.min(100, (totalA / MAX_TOTAL_VIS) * 100));
  const pctTB = Math.max(4, Math.min(100, (totalB / MAX_TOTAL_VIS) * 100));
  rowsHtml += `
    <div class="cmp-stat-row cmp-total-row">
      <div class="cmp-bar-wrap left">
        <div class="cmp-bar-fill ${clsTA}" data-w="${pctTA}" style="width:0">${totalA}</div>
      </div>
      <div class="cmp-stat-label">Total <span class="cmp-total-badge">BST</span></div>
      <div class="cmp-bar-wrap right">
        <div class="cmp-bar-fill ${clsTB}" data-w="${pctTB}" style="width:0">${totalB}</div>
      </div>
    </div>
  `;
  cmpStatsEl.innerHTML = rowsHtml;

  runComparisonSequence(a, b, { totalA, totalB, winner, statKeys, statsA, statsB });
}

async function runComparisonSequence(a, b, ctx) {
  cmpClearTimers();

  cmpModalEl.classList.remove('phase-intro', 'show-winner');
  cmpWinnerScr.classList.remove('show', 'tie');
  cmpWinnerScr.setAttribute('aria-hidden', 'true');
  cmpVsOverlay.classList.remove('run');
  cmpVsFlash.classList.remove('run');
  cmpStatsEl.classList.remove('phase-stats');

  void cmpModalEl.offsetWidth;

  // Phase 1: VS intro
  cmpModalEl.classList.add('phase-intro');
  cmpVsFlash.classList.add('run');
  cmpVsOverlay.classList.add('run');
  await cmpDelay(1200);
  cmpVsOverlay.classList.remove('run');
  cmpVsFlash.classList.remove('run');

  // Phase 2: stat bars staggered
  cmpStatsEl.classList.add('phase-stats');
  const rows = cmpStatsEl.querySelectorAll('.cmp-stat-row:not(.cmp-total-row)');
  const STAGGER = 280;
  rows.forEach((row, i) => {
    cmpAnimTimers.push(setTimeout(() => {
      row.classList.add('revealed');
      const fills = row.querySelectorAll('.cmp-bar-fill');
      const wraps = row.querySelectorAll('.cmp-bar-wrap');
      fills.forEach(f => {
        f.style.width = f.dataset.w + '%';
        f.classList.add('charging');
        setTimeout(() => f.classList.remove('charging'), 1000);
      });
      cmpAnimTimers.push(setTimeout(() => {
        fills.forEach((f, idx) => {
          const wrap = wraps[idx];
          if (!wrap) return;
          if (f.classList.contains('winner')) wrap.classList.add('flash-win');
          else if (f.classList.contains('loser')) wrap.classList.add('flash-lose');
          setTimeout(() => wrap.classList.remove('flash-win', 'flash-lose'), 600);
        });
      }, 350));
    }, i * STAGGER));
  });

  await cmpDelay(rows.length * STAGGER + 600);

  // Phase 3: total reveal
  const totalRow = cmpStatsEl.querySelector('.cmp-total-row');
  if (totalRow) {
    totalRow.classList.add('revealed');
    const fills = totalRow.querySelectorAll('.cmp-bar-fill');
    fills.forEach(f => {
      f.style.width = f.dataset.w + '%';
      f.classList.add('charging');
      setTimeout(() => f.classList.remove('charging'), 1000);
    });
  }
  await cmpDelay(700);

  // Phase 4: winner
  await cmpDelay(500);
  showWinnerScreen(a, b, ctx);
}

function showWinnerScreen(a, b, ctx) {
  const { totalA, totalB, winner, statKeys, statsA, statsB } = ctx;
  const isTie = winner === 'tie';
  const W = winner === 'a' ? a : (winner === 'b' ? b : null);
  const L = winner === 'a' ? b : (winner === 'b' ? a : null);

  const statWinsHtml = [];
  if (!isTie && W && L) {
    const wStats = Object.fromEntries(W.stats.map(s => [s.stat.name, s.base_stat]));
    const lStats = Object.fromEntries(L.stats.map(s => [s.stat.name, s.base_stat]));
    const ICONS = {
      'hp':'❤️','attack':'⚡','defense':'🛡️',
      'special-attack':'✨','special-defense':'🔮','speed':'💨'
    };
    statKeys.forEach(k => {
      const wv = wStats[k] ?? 0;
      const lv = lStats[k] ?? 0;
      if (wv > lv) {
        statWinsHtml.push(`<li>${ICONS[k]} <strong>${STAT_LABELS_ES[k]}:</strong> ${wv} vs ${lv} — ventaja de +${wv - lv}</li>`);
      }
    });
  }

  const totalLine = isTie
    ? `<li>📊 <strong>Total:</strong> ${totalA} vs ${totalB} — ¡mismo BST!</li>`
    : (winner === 'a'
        ? `<li>📊 <strong>Total:</strong> ${totalA} vs ${totalB} — diferencia de +${totalA - totalB}</li>`
        : `<li>📊 <strong>Total:</strong> ${totalB} vs ${totalA} — diferencia de +${totalB - totalA}</li>`);

  let summary;
  if (isTie) {
    summary = `${cap(a.name)} y ${cap(b.name)} están perfectamente igualados con un BST de ${totalA} puntos. ¡Un duelo épico sin un claro vencedor!`;
  } else {
    const wStats = Object.fromEntries(W.stats.map(s => [s.stat.name, s.base_stat]));
    const lStats = Object.fromEntries(L.stats.map(s => [s.stat.name, s.base_stat]));
    const advantages = statKeys
      .map(k => ({ k, diff: (wStats[k] ?? 0) - (lStats[k] ?? 0) }))
      .filter(x => x.diff > 0)
      .sort((x, y) => y.diff - x.diff)
      .slice(0, 2)
      .map(x => STAT_LABELS_ES[x.k]);
    const bstDiff = Math.abs(totalA - totalB);
    const advText = advantages.length === 0
      ? 'varias estadísticas clave'
      : (advantages.length === 1 ? advantages[0] : advantages.join(' y '));
    summary = `${cap(W.name)} domina en ${advText}, con un BST superior de ${bstDiff} puntos.`;
  }

  if (isTie) {
    cmpWinnerScr.classList.add('tie');
    cmpWinnerIn.innerHTML = `
      <div class="cmp-winner-title">🤝 ¡EMPATE!</div>
      <div style="display:flex;gap:18px;align-items:center;justify-content:center;flex-wrap:wrap;">
        <div class="cmp-winner-art">
          <img alt="${a.name}" src="${officialArt(a.id)}"
               onerror="this.onerror=null;this.src='${fallbackSprite(a.id)}';" />
        </div>
        <div class="cmp-winner-art">
          <img alt="${b.name}" src="${officialArt(b.id)}"
               onerror="this.onerror=null;this.src='${fallbackSprite(b.id)}';" />
        </div>
      </div>
      <div class="cmp-winner-name">${cap(a.name)} = ${cap(b.name)}</div>
      <div class="cmp-winner-types">
        ${a.types.map(t => `<span class="type-badge t-${t.type.name}" style="background:${TYPE_COLORS[t.type.name]||'#888'}">${t.type.name}</span>`).join('')}
        <span style="opacity:.6;align-self:center;">vs</span>
        ${b.types.map(t => `<span class="type-badge t-${t.type.name}" style="background:${TYPE_COLORS[t.type.name]||'#888'}">${t.type.name}</span>`).join('')}
      </div>
      <div class="cmp-winner-why">
        <h4>¿Por qué empatan?</h4>
        <ul>${totalLine}</ul>
        <div class="cmp-winner-summary">${summary}</div>
      </div>
      <div class="cmp-winner-actions">
        <button type="button" class="primary" id="cmpBackToStats">🔄 Ver comparación completa</button>
        <button type="button" id="cmpWinnerClose">✕ Cerrar</button>
      </div>
    `;
  } else {
    cmpWinnerScr.classList.remove('tie');
    cmpWinnerIn.innerHTML = `
      <div class="cmp-winner-title">🏆 GANADOR</div>
      <div class="cmp-winner-art">
        <img alt="${W.name}" src="${officialArt(W.id)}"
             onerror="this.onerror=null;this.src='${fallbackSprite(W.id)}';" />
      </div>
      <div class="cmp-winner-name">${cap(W.name)}</div>
      <div class="cmp-winner-types">
        ${W.types.map(t => `<span class="type-badge t-${t.type.name}" style="background:${TYPE_COLORS[t.type.name]||'#888'}">${t.type.name}</span>`).join('')}
      </div>
      <div class="cmp-winner-why">
        <h4>¿Por qué gana?</h4>
        <ul>
          ${statWinsHtml.join('')}
          ${totalLine}
        </ul>
        <div class="cmp-winner-summary">${summary}</div>
      </div>
      <div class="cmp-winner-actions">
        <button type="button" class="primary" id="cmpBackToStats">🔄 Ver comparación completa</button>
        <button type="button" id="cmpWinnerClose">✕ Cerrar</button>
      </div>
    `;
  }

  cmpModalEl.classList.add('show-winner');
  cmpWinnerScr.classList.add('show');
  cmpWinnerScr.setAttribute('aria-hidden', 'false');
  startConfetti(cmpConfettiC, isTie);

  const backBtn  = document.getElementById('cmpBackToStats');
  const closeBtn = document.getElementById('cmpWinnerClose');
  if (backBtn)  backBtn.addEventListener('click', backToStatsView);
  if (closeBtn) closeBtn.addEventListener('click', closeBattleModal);
}

function backToStatsView() {
  stopConfetti();
  cmpWinnerScr.classList.remove('show');
  cmpWinnerScr.setAttribute('aria-hidden', 'true');
  cmpModalEl.classList.remove('show-winner');
}

// ---- Confetti ----
function startConfetti(canvas, isTie) {
  stopConfetti();
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  function resize() {
    const r = canvas.getBoundingClientRect();
    canvas.width  = Math.max(1, Math.floor(r.width  * (window.devicePixelRatio || 1)));
    canvas.height = Math.max(1, Math.floor(r.height * (window.devicePixelRatio || 1)));
  }
  resize();
  const palette = isTie
    ? ['#8c7aff','#b3a8ff','#6a52d6','#c4baff','#ffffff','#5fa8ff']
    : ['#ffd24c','#ee7a00','#ff5e5e','#2ecc71','#5fa8ff','#ffffff','#ffb347'];
  const COUNT = 110;
  const particles = [];
  for (let i = 0; i < COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: 4 + Math.random() * 6,
      h: 6 + Math.random() * 10,
      vy: 1.2 + Math.random() * 2.2,
      vx: -0.8 + Math.random() * 1.6,
      rot: Math.random() * Math.PI * 2,
      vr: -0.15 + Math.random() * 0.3,
      color: palette[Math.floor(Math.random() * palette.length)],
      shape: Math.random() < 0.4 ? 'circle' : 'rect'
    });
  }
  const onResize = () => resize();
  window.addEventListener('resize', onResize);

  function step() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dpr = window.devicePixelRatio || 1;
    particles.forEach(p => {
      p.x += p.vx * dpr;
      p.y += p.vy * dpr;
      p.rot += p.vr;
      if (p.y > canvas.height + 20) {
        p.y = -20;
        p.x = Math.random() * canvas.width;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, (p.w / 2) * dpr, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-(p.w/2) * dpr, -(p.h/2) * dpr, p.w * dpr, p.h * dpr);
      }
      ctx.restore();
    });
    cmpConfettiRAF = requestAnimationFrame(step);
  }
  _confettiState = { canvas, onResize };
  cmpConfettiRAF = requestAnimationFrame(step);
}
function stopConfetti() {
  if (cmpConfettiRAF) cancelAnimationFrame(cmpConfettiRAF);
  cmpConfettiRAF = 0;
  if (_confettiState) {
    window.removeEventListener('resize', _confettiState.onResize);
    const c = _confettiState.canvas;
    if (c) {
      const x = c.getContext('2d');
      x && x.clearRect(0, 0, c.width, c.height);
    }
    _confettiState = null;
  }
}

// ---- Open/Close battle modal ----
function openBattleModal(a, b) {
  // a, b can be raw PokéAPI shape (preferred) or have .raw
  const pa = a?.types?.[0]?.type ? a : a.raw;
  const pb = b?.types?.[0]?.type ? b : b.raw;
  cmpColsEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-dim);padding:30px 0;">Cargando...</div>';
  cmpStatsEl.innerHTML = '';
  battleModal.classList.add('open');
  battleModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  // Small RAF so opening transition plays before heavy DOM gets injected
  requestAnimationFrame(() => renderComparison(pa, pb));
}
function closeBattleModal() {
  battleModal.classList.remove('open');
  battleModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  cmpClearTimers();
  stopConfetti();
  cmpModalEl.classList.remove('phase-intro', 'show-winner');
  cmpWinnerScr.classList.remove('show', 'tie');
  cmpWinnerScr.setAttribute('aria-hidden', 'true');
  cmpVsOverlay.classList.remove('run');
  cmpVsFlash.classList.remove('run');
  cmpStatsEl.classList.remove('phase-stats');
}

// ===========================================================
// TTS + Live mode
// ===========================================================
let liveMode = false;
let currentAudio = null;

// Play a bot message via Kokoro TTS. `btn` is the optional 🔊 button to animate.
async function playTTS(text, btn) {
  try {
    // stop anything currently playing
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }

    if (!ttsReady()) {
      if (btn) btn.textContent = '⏳';
      liveStatus.textContent = '🔊 Cargando voz (una sola vez)...';
      await initTTS((p) => {
        if (p && p.status === 'progress' && p.total) {
          const pct = ((p.loaded / p.total) * 100).toFixed(0);
          liveStatus.textContent = `🔊 Cargando voz... ${pct}%`;
        }
      });
      liveStatus.textContent = '';
    }

    if (btn) btn.textContent = '🔈';
    unlockAudio(); // ensure AudioContext is running (called from a click)
    const voice = voiceForLang(text);
    await speakAndPlay(text, voice);
    if (btn) btn.textContent = '🔊';
  } catch (err) {
    console.error('TTS error', err);
    if (btn) btn.textContent = '🔊';
    liveStatus.textContent = '';
  }
}

async function toggleLiveMode() {
  liveMode = !liveMode;
  if (liveMode) {
    unlockAudio(); // unlock AudioContext within this user gesture (click)
    liveToggle.classList.add('active');
    liveToggle.textContent = '🟢 Live activo';
    liveStatus.textContent = '🔊 Preparando voz...';
    try {
      await initTTS((p) => {
        if (p && p.status === 'progress' && p.total) {
          const pct = ((p.loaded / p.total) * 100).toFixed(0);
          liveStatus.textContent = `🔊 Cargando voz... ${pct}%`;
        }
      });
      // Start listening immediately — this triggers the mic permission prompt
      if (recognition && !recording) {
        liveStatus.textContent = '🎙️ Habla ahora...';
        try { recognition.start(); }
        catch { /* already running */ }
      } else if (!recognition) {
        liveStatus.textContent = '⚠️ Tu navegador no soporta voz';
      }
    } catch (err) {
      console.error(err);
      liveStatus.textContent = '⚠️ No se pudo cargar la voz';
      liveMode = false;
      liveToggle.classList.remove('active');
      liveToggle.textContent = '🔴 Modo Live';
    }
  } else {
    liveToggle.classList.remove('active');
    liveToggle.textContent = '🔴 Modo Live';
    liveStatus.textContent = '';
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if (recognition && recording) { try { recognition.stop(); } catch {} }
  }
}

// ===========================================================
// Send flow
// ===========================================================
let sending = false;

// Render Pokémon cards + quick-action chips under a bot message column
async function renderCardsAndActions(botCol, cards, pokemonInReply) {
  const cardResults = cards && cards.length > 0
    ? cards.map(c => ({ status: 'fulfilled', value: c }))
    : await Promise.allSettled((pokemonInReply || []).map(name => getPokemonCard(name)));

  if (!cardResults.length) return;

  const cardsWrap = document.createElement('div');
  cardsWrap.className = 'poke-cards';
  botCol.appendChild(cardsWrap);
  for (const r of cardResults) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const card = await renderPokemonCard(r.value);
    if (card) cardsWrap.appendChild(card);
  }
  const names = cardResults
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value.name);
  if (names.length) renderQuickActions(botCol, names);
}

async function handleSend() {
  const text = userInput.value.trim();
  if (!text || sending) return;
  sending = true;
  sendBtn.disabled = true;
  userInput.value = '';

  addMessage(text, 'user');
  const typing = addTypingIndicator();

  try {
    // ── LIVE MODE: stream tokens → speak sentence-by-sentence + type live ──
    if (liveMode && ttsReady()) {
      let botCol = null;
      let bubble = null;
      let typingRemoved = false;
      let liveText = '';
      const voice = voiceForLang(text); // best guess; refined when first chunk arrives
      let speech = null;

      const onChunk = (chunk) => {
        if (!typingRemoved) { removeTypingIndicator(typing); typingRemoved = true; }
        if (!botCol) {
          botCol = addMessage('', 'bot');
          bubble = botCol.querySelector('.bubble');
          // start the streaming voice once we know roughly the language
          speech = createSpeechStream(voiceForLang(chunk) || voice);
          liveStatus.textContent = '🔊 Hablando...';
        }
        liveText += chunk;
        if (bubble) bubble.textContent = liveText;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        if (speech) speech.push(chunk);
      };

      const { reply, pokemonInReply, comparison, cards } =
        await sendMessage(text, { onChunk });

      if (!typingRemoved) removeTypingIndicator(typing);
      if (!botCol) { botCol = addMessage(reply, 'bot'); }
      else if (bubble) bubble.textContent = reply; // ensure final clean text

      if (speech) { speech.done(); }

      await renderCardsAndActions(botCol, cards, pokemonInReply);
      if (comparison && comparison.a && comparison.b) {
        setTimeout(() => openBattleModal(comparison.a, comparison.b), 350);
      }

      // wait for the spoken audio to finish, then hand the mic back
      if (speech) await speech.waitUntilDone();
      liveStatus.textContent = '';
      if (liveMode && recognition && !recording) {
        liveStatus.textContent = '🎙️ Tu turno...';
        try { recognition.start(); } catch { /* already running */ }
      }
      return;
    }

    // ── NORMAL MODE (no streaming) ──
    const { reply, pokemonInReply, comparison, cards } = await sendMessage(text);
    removeTypingIndicator(typing);

    const botCol = addMessage(reply, 'bot');
    await renderCardsAndActions(botCol, cards, pokemonInReply);

    if (comparison && comparison.a && comparison.b) {
      setTimeout(() => openBattleModal(comparison.a, comparison.b), 350);
    }

    // Live mode without TTS preloaded → speak after the fact (fallback)
    if (liveMode && reply) {
      liveStatus.textContent = '🔊 Hablando...';
      await playTTS(reply);
      liveStatus.textContent = '';
      if (liveMode && recognition && !recording) {
        liveStatus.textContent = '🎙️ Tu turno...';
        try { recognition.start(); } catch { /* already running */ }
      }
    }
  } catch (err) {
    console.error(err);
    removeTypingIndicator(typing);
    addMessage('Algo salió mal. Intenta de nuevo en un momento.', 'bot');
  } finally {
    sending = false;
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// ===========================================================
// Voice input (Web Speech API — Chrome / Edge)
// ===========================================================
let recognition = null;
let recording = false;

function setupVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    voiceBtn.style.display = 'none';
    return;
  }
  recognition = new SR();
  recognition.lang = 'es-ES';
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    recording = true;
    voiceBtn.classList.add('recording');
    voiceStatus.textContent = '🎙️ Escuchando...';
  };
  recognition.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      liveStatus.textContent = '🎙️ Permiso de micrófono denegado';
      liveMode = false;
      liveToggle.classList.remove('active');
      liveToggle.textContent = '🔴 Modo Live';
      return;
    }
    voiceStatus.textContent = e.error === 'no-speech' ? 'No te escuché 😅' : `Error: ${e.error}`;
    setTimeout(() => { voiceStatus.textContent = ''; }, 2500);
  };
  recognition.onend = () => {
    recording = false;
    voiceBtn.classList.remove('recording');
    setTimeout(() => { voiceStatus.textContent = ''; }, 1500);
    // Live mode: if nothing is being processed/spoken, keep listening
    if (liveMode && !sending && !currentAudio) {
      liveStatus.textContent = '🎙️ Te escucho...';
      setTimeout(() => {
        if (liveMode && !recording && !sending && !currentAudio) {
          try { recognition.start(); } catch {}
        }
      }, 400);
    }
  };
  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (interim) {
      userInput.value = interim;
      voiceStatus.textContent = `📝 ${interim}`;
    }
    if (final) {
      userInput.value = final.trim();
      voiceStatus.textContent = '';
      // auto-send when we have a final result
      handleSend();
    }
  };

  voiceBtn.addEventListener('click', () => {
    if (!recognition) return;
    if (recording) {
      recognition.stop();
    } else {
      try { recognition.start(); }
      catch { /* already running */ }
    }
  });
}

// ===========================================================
// Boot
// ===========================================================
async function boot() {
  // Wire event listeners early so suggestions work even before load
  sendBtn.addEventListener('click', handleSend);
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  document.querySelectorAll('.suggestions .chip').forEach(c => {
    c.addEventListener('click', () => {
      userInput.value = c.dataset.text || c.textContent;
      handleSend();
    });
  });

  detailClose.addEventListener('click', closeDetailModal);
  detailBackdrop.addEventListener('click', closeDetailModal);
  cmpCloseBtn.addEventListener('click', closeBattleModal);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!detailModal.classList.contains('hidden')) closeDetailModal();
      if (battleModal.classList.contains('open')) closeBattleModal();
    }
  });

  setupVoice();

  if (liveToggle) liveToggle.addEventListener('click', toggleLiveMode);

  // Init LLM
  try {
    await initLLM((text, progress) => {
      loadingStatus.textContent = text || 'Cargando...';
      const pct = Math.max(0, Math.min(1, progress || 0));
      loadingBar.style.width = (pct * 100) + '%';
    });
  } catch (err) {
    console.error(err);
    loadingStatus.innerHTML = `<span style="color:var(--accent)">⚠️ Error: ${err.message || err}</span>`;
    return;
  }

  // Hide loading, show chat
  loadingScreen.classList.add('hidden');
  chatContainer.classList.remove('hidden');

  // Welcome message
  const welcome = addMessage(
    '¡Hola entrenador! 👋 Soy Professor AI, tu Pokédex con inteligencia artificial. ' +
    'Puedes preguntarme sobre cualquier Pokémon, comparar dos para ver quién gana, ' +
    'o usar el botón 🎙️ para hablarme. ¡Empecemos!',
    'bot'
  );

  userInput.focus();
}

boot();
