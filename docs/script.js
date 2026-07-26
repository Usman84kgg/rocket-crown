const { db, formatMoney, errorText } = window.rocketCrown;

const GAMES = [
  { key: 'mines',        name: 'Jackpot Mines',     art: 'assets/games/mines.jpg' },
  { key: 'crash',        name: 'Crash X',            art: 'assets/games/crash.jpg' },
  { key: 'coinflip',     name: 'Coin Flip',          art: 'assets/games/coinflip.jpg' },
  { key: 'plinko',       name: 'Plinko+',            art: 'assets/games/plinko.jpg' },
  { key: 'sweet_bonanza',name: 'Sweet Bonanza 1000x',art: 'assets/games/sweet_bonanza.jpg' }
];

const PROMOS = [
  { title: 'Welcome Boost', value: '100% on first deposit', text: 'Boost your first deposit instantly.' },
  { title: 'VIP Reload',    value: '50% every Friday',      text: 'Use on every Friday reload.' }
];

const CANDY = ['🍬','🍭','🍰','🎂','🍎','🍇','🍋','🍊','💎','🌟'];

// ── DOM refs ──────────────────────────────────────────────────────────
const menuButton  = document.getElementById('menuButton');
const menuPanel   = document.getElementById('menuPanel');
const navButtons  = document.querySelectorAll('.nav-btn');
const screens     = document.querySelectorAll('.screen');
const gameModal   = document.getElementById('gameModal');

// ── State ─────────────────────────────────────────────────────────────
const state = {
  profile: null,
  requests: [],
  liveWins: [],
  settings: { deposits_enabled: true, games: {} },
  authMode: 'register'
};
let profileChannel = null;

// ── Helpers ───────────────────────────────────────────────────────────
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function gameEnabled(key) {
  const g = state.settings.games;
  if (!g || key.startsWith('_')) return false;
  return g[key] !== false;
}
function metaSettings() {
  return state.settings.games?._meta || {};
}

// ── Navigation ────────────────────────────────────────────────────────
function showScreen(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  navButtons.forEach(b => {
    b.classList.toggle('active', id.replace('Screen','') === b.dataset.screen);
  });
  menuPanel.classList.remove('open');
}

// ── Toasts ────────────────────────────────────────────────────────────
function toastStack() {
  let s = document.getElementById('toastStack');
  if (!s) {
    s = document.createElement('div');
    s.id = 'toastStack';
    s.className = 'toast-stack';
    document.body.appendChild(s);
  }
  return s;
}

function showNotice(message, type = 'info') {
  const icons = { win: '🏆', lose: '💔', info: '💬' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'💬'}</span><span class="toast-text">${escapeHtml(message)}</span>`;
  const stack = toastStack();
  stack.prepend(t);
  setTimeout(() => t.style.opacity = '0', 2800);
  setTimeout(() => t.remove(), 3200);
}

function showGameResult(data) {
  showNotice(data.message + ' · Balance: ' + formatMoney(data.balance),
    data.won ? 'win' : 'lose');
}

// ── Loading data ──────────────────────────────────────────────────────
async function loadSettings() {
  const { data } = await db.from('casino_settings').select('deposits_enabled,games').maybeSingle();
  if (data) state.settings = data;
}

async function loadProfile() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { state.profile = null; return; }
  const { data, error } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) showNotice(errorText(error));
  state.profile = data || null;
}

async function loadRequests() {
  if (!state.profile) { state.requests = []; return; }
  const { data } = await db.from('payment_requests')
    .select('*').order('created_at', { ascending: false }).limit(20);
  state.requests = data || [];
}

async function loadLiveWins() {
  const { data } = await db.from('live_wins').select('*').limit(8);
  state.liveWins = data || [];
}

function watchProfile() {
  if (profileChannel) db.removeChannel(profileChannel);
  if (!state.profile) return;
  profileChannel = db.channel('profile-sync')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles',
      filter: `id=eq.${state.profile.id}` }, payload => {
      state.profile = payload.new;
      renderBalance();
      renderProfile();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests',
      filter: `user_id=eq.${state.profile.id}` }, async () => {
      await loadRequests();
      renderWallet();
    })
    .subscribe();
}

async function refreshAll() {
  await Promise.all([loadSettings(), loadProfile(), loadLiveWins()]);
  await loadRequests();
  watchProfile();
  render();
}

// ── Betting ───────────────────────────────────────────────────────────
async function placeBet(gameKey, amount, choice) {
  const { data, error } = await db.rpc('place_bet', {
    p_game: gameKey, p_amount: Number(amount), p_choice: choice ?? null
  });
  if (error) { showNotice(errorText(error), 'info'); return null; }
  state.profile.balance = data.balance;
  await loadLiveWins();
  render();
  return data;
}

// ── Game modals ───────────────────────────────────────────────────────
function openModal(html) {
  gameModal.innerHTML = html;
  gameModal.hidden = false;
}
function closeModal() {
  gameModal.innerHTML = '';
  gameModal.hidden = true;
}

function stakeFormHtml(label = 'Your stake') {
  return `
    <div class="stake-row">
      <input type="number" id="stakeInput" min="1" step="1" placeholder="${label}" required />
    </div>
    <div class="stake-quick">
      <button type="button" data-quick="5">$5</button>
      <button type="button" data-quick="10">$10</button>
      <button type="button" data-quick="25">$25</button>
      <button type="button" data-quick="50">$50</button>
      <button type="button" data-quick="100">$100</button>
    </div>
  `;
}

function bindQuickStake(modal) {
  modal.querySelectorAll('[data-quick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = modal.querySelector('#stakeInput');
      if (inp) inp.value = btn.dataset.quick;
    });
  });
}

// ── CRASH ─────────────────────────────────────────────────────────────
function openCrashModal() {
  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">🚀 Crash X</div>
      <div class="modal-subtitle">Rounds resolve on the server — provably fair.</div>
      <div class="crash-display">
        <div class="crash-multiplier" id="crashMult">1.00×</div>
        <div class="crash-label" id="crashLabel">Place your bet to start</div>
      </div>
      <form id="crashForm" class="game-form">
        ${stakeFormHtml('Stake ($)')}
        <label style="font-size:13px;color:var(--muted);">Cash out at multiplier</label>
        <input type="number" id="targetInput" min="1.1" step="0.1" value="2.0" required />
        <button type="submit" id="crashPlayBtn">Bet & Watch</button>
      </form>
    </div>
  `);
  const card = gameModal.querySelector('.modal-card');
  bindQuickStake(card);
  card.querySelector('#closeModal').addEventListener('click', closeModal);

  card.querySelector('#crashForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = card.querySelector('#crashPlayBtn');
    const amount = card.querySelector('#stakeInput').value;
    const target = card.querySelector('#targetInput').value;
    if (!amount || amount <= 0) return;
    btn.disabled = true;

    // Animate rising multiplier (optimistic)
    const multEl = card.querySelector('#crashMult');
    const labelEl = card.querySelector('#crashLabel');
    multEl.textContent = '1.00×';
    multEl.className = 'crash-multiplier';
    labelEl.textContent = '🚀 Flying…';

    let current = 1.0;
    const rise = setInterval(() => {
      current += current * 0.015;
      multEl.textContent = current.toFixed(2) + '×';
    }, 80);

    const data = await placeBet('crash', amount, target);
    clearInterval(rise);

    if (!data) { btn.disabled = false; return; }

    // Animate to final crash point
    const crashPoint = data.multiplier;
    const animTo = data.won ? Number(target) : crashPoint;
    let anim = 1.0;
    const finalAnim = setInterval(() => {
      anim += (animTo - anim) * 0.12;
      multEl.textContent = anim.toFixed(2) + '×';
      if (Math.abs(anim - animTo) < 0.02) {
        clearInterval(finalAnim);
        multEl.textContent = animTo.toFixed(2) + '×';
        if (!data.won) {
          multEl.classList.add('crashed');
          labelEl.textContent = '💥 Crashed!';
        } else {
          labelEl.textContent = '✅ Cashed out!';
        }
        card.insertAdjacentHTML('beforeend', `
          <div class="game-result-banner ${data.won ? 'win' : 'lose'}">
            <div class="result-title">${data.won ? '🏆 You Won ' + formatMoney(data.payout) : '💔 You Lost'}</div>
            <div class="result-sub">${escapeHtml(data.message)}</div>
          </div>
        `);
        showGameResult(data);
        btn.disabled = false;
      }
    }, 50);
  });
}

// ── MINES ─────────────────────────────────────────────────────────────
function openMinesModal() {
  const cells = Array.from({ length: 25 }, (_, i) => `
    <div class="mine-cell" data-idx="${i}">💎</div>
  `).join('');

  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">💣 Jackpot Mines</div>
      <div class="modal-subtitle">Avoid the mine — pick your stake and go!</div>
      <form id="minesForm" class="game-form">
        ${stakeFormHtml('Stake ($)')}
        <button type="submit" id="minesPlayBtn">Play</button>
      </form>
      <div class="mines-grid" id="minesGrid" style="display:none;">${cells}</div>
      <div id="minesResult"></div>
    </div>
  `);
  const card = gameModal.querySelector('.modal-card');
  bindQuickStake(card);
  card.querySelector('#closeModal').addEventListener('click', closeModal);

  card.querySelector('#minesForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = card.querySelector('#minesPlayBtn');
    const amount = card.querySelector('#stakeInput').value;
    if (!amount || amount <= 0) return;
    btn.disabled = true;

    const data = await placeBet('mines', amount, null);
    if (!data) { btn.disabled = false; return; }

    // Show grid, animate reveal
    const grid = card.querySelector('#minesGrid');
    grid.style.display = 'grid';
    const cellEls = grid.querySelectorAll('.mine-cell');
    const mineIdx = Math.floor(Math.random() * 25);

    cellEls.forEach(c => { c.textContent = '?'; c.className = 'mine-cell'; });

    let revealed = 0;
    const revealInterval = setInterval(() => {
      const idx = revealed;
      revealed++;
      const cell = cellEls[idx];
      if (!cell) { clearInterval(revealInterval); return; }

      setTimeout(() => {
        if (data.won) {
          if (idx === mineIdx) {
            cell.textContent = '💣';
            cell.classList.add('revealed-mine');
          } else {
            cell.textContent = '💎';
            cell.classList.add('revealed-gem');
          }
        } else {
          if (idx === mineIdx) {
            cell.textContent = '💥';
            cell.classList.add('revealed-mine');
          } else {
            cell.textContent = '⬜';
            cell.classList.add('revealed-safe');
          }
        }
      }, idx * 40);

      if (revealed >= 25) {
        clearInterval(revealInterval);
        setTimeout(() => {
          card.querySelector('#minesResult').innerHTML = `
            <div class="game-result-banner ${data.won ? 'win' : 'lose'}" style="margin-top:12px;">
              <div class="result-title">${data.won ? '🏆 ' + formatMoney(data.payout) : '💔 Mine Hit!'}</div>
              <div class="result-sub">${escapeHtml(data.message)}</div>
            </div>
          `;
          showGameResult(data);
          btn.disabled = false;
        }, 25 * 40 + 200);
      }
    }, 40);
  });
}

// ── COINFLIP ──────────────────────────────────────────────────────────
function openCoinflipModal() {
  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">🪙 Coin Flip</div>
      <div class="modal-subtitle">1.95× payout · Pick heads or tails.</div>
      <div class="coin-container"><div class="coin" id="coin">🪙</div></div>
      <form id="coinForm" class="game-form">
        ${stakeFormHtml('Stake ($)')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label style="display:flex;align-items:center;gap:8px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.06);border:2px solid transparent;cursor:pointer;" id="lblHeads">
            <input type="radio" name="side" value="heads" required style="display:none;"> 🟡 Heads
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.06);border:2px solid transparent;cursor:pointer;" id="lblTails">
            <input type="radio" name="side" value="tails" style="display:none;"> ⚫ Tails
          </label>
        </div>
        <button type="submit" id="coinPlayBtn">Flip!</button>
      </form>
      <div id="coinResult"></div>
    </div>
  `);
  const card = gameModal.querySelector('.modal-card');
  bindQuickStake(card);
  card.querySelector('#closeModal').addEventListener('click', closeModal);

  // Highlight selected radio
  card.querySelectorAll('[name="side"]').forEach(r => {
    r.addEventListener('change', () => {
      card.querySelector('#lblHeads').style.borderColor = r.value === 'heads' ? 'var(--accent)' : 'transparent';
      card.querySelector('#lblTails').style.borderColor = r.value === 'tails' ? 'var(--accent)' : 'transparent';
    });
  });

  card.querySelector('#coinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = card.querySelector('#coinPlayBtn');
    const amount = card.querySelector('#stakeInput').value;
    const side = card.querySelector('[name="side"]:checked')?.value;
    if (!amount || !side) return;
    btn.disabled = true;

    const coinEl = card.querySelector('#coin');
    coinEl.classList.add('flipping');

    const data = await placeBet('coinflip', amount, side);
    if (!data) { coinEl.classList.remove('flipping'); btn.disabled = false; return; }

    setTimeout(() => {
      coinEl.classList.remove('flipping');
      const landed = data.message.toLowerCase().includes('heads') ? 'heads' : 'tails';
      coinEl.textContent = landed === 'heads' ? '🟡' : '⚫';
      card.querySelector('#coinResult').innerHTML = `
        <div class="game-result-banner ${data.won ? 'win' : 'lose'}" style="margin-top:12px;">
          <div class="result-title">${data.won ? '🏆 You Won ' + formatMoney(data.payout) : '💔 You Lost'}</div>
          <div class="result-sub">Landed: <strong>${landed}</strong> · ${escapeHtml(data.message)}</div>
        </div>
      `;
      showGameResult(data);
      btn.disabled = false;
    }, 1500);
  });
}

// ── PLINKO ────────────────────────────────────────────────────────────
function openPlinkoModal() {
  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">🎯 Plinko+</div>
      <div class="modal-subtitle">2× payout · Watch the ball drop!</div>
      <canvas id="plinkoCanvas" class="plinko-canvas" width="320" height="180"></canvas>
      <div class="plinko-result" id="plinkoResult"></div>
      <form id="plinkoForm" class="game-form">
        ${stakeFormHtml('Stake ($)')}
        <button type="submit" id="plinkoPlayBtn">Drop Ball</button>
      </form>
      <div id="plinkoResultBanner"></div>
    </div>
  `);
  const card = gameModal.querySelector('.modal-card');
  bindQuickStake(card);
  card.querySelector('#closeModal').addEventListener('click', closeModal);
  drawPlinkoBoard(card.querySelector('#plinkoCanvas'));

  card.querySelector('#plinkoForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = card.querySelector('#plinkoPlayBtn');
    const amount = card.querySelector('#stakeInput').value;
    if (!amount || amount <= 0) return;
    btn.disabled = true;

    animatePlinkoBall(card.querySelector('#plinkoCanvas'));
    const data = await placeBet('plinko', amount, null);
    if (!data) { btn.disabled = false; return; }

    setTimeout(() => {
      card.querySelector('#plinkoResult').textContent = data.won ? '🎉 Win pocket!' : '❌ Loss pocket';
      card.querySelector('#plinkoResultBanner').innerHTML = `
        <div class="game-result-banner ${data.won ? 'win' : 'lose'}">
          <div class="result-title">${data.won ? '🏆 ' + formatMoney(data.payout) : '💔 Missed'}</div>
          <div class="result-sub">${escapeHtml(data.message)}</div>
        </div>
      `;
      showGameResult(data);
      btn.disabled = false;
    }, 1800);
  });
}

function drawPlinkoBoard(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 320, 180);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  const rows = 5, cols = 7;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c <= r + cols - rows; c++) {
      const x = (320 / (r + cols - rows + 1)) * (c + 0.5) + (320 / (r + cols - rows + 1)) * 0.5;
      const y = 30 + r * 28;
      ctx.beginPath();
      ctx.arc(Math.min(x, 310), y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function animatePlinkoBall(canvas) {
  const ctx = canvas.getContext('2d');
  let x = 160, y = 5, vy = 2, vx = 0;
  const anim = setInterval(() => {
    drawPlinkoBoard(canvas);
    vy += 0.4;
    vx += (Math.random() - 0.5) * 0.8;
    x += vx; y += vy;
    if (x < 10) x = 10;
    if (x > 310) x = 310;
    ctx.fillStyle = '#f5c842';
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    if (y > 175) clearInterval(anim);
  }, 30);
}

// ── SWEET BONANZA ─────────────────────────────────────────────────────
function openSweetBonanzaModal() {
  const emptyGrid = Array(30).fill('').map(() =>
    `<div class="sb-cell">${CANDY[Math.floor(Math.random() * CANDY.length)]}</div>`
  ).join('');

  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">🍭 Sweet Bonanza 1000x</div>
      <div class="modal-subtitle">Scatter pays · Tumble wins · Up to 1000×!</div>
      <div class="sb-grid" id="sbGrid">${emptyGrid}</div>
      <div id="sbMultiplier" style="text-align:center;font-family:Rajdhani,sans-serif;font-size:18px;color:var(--accent);min-height:28px;margin-bottom:8px;"></div>
      <form id="sbForm" class="game-form">
        ${stakeFormHtml('Stake ($)')}
        <button type="submit" id="sbPlayBtn" style="background:linear-gradient(135deg,#ec4899,#be123c);color:#fff;font-family:Rajdhani,sans-serif;font-size:18px;font-weight:700;border:none;border-radius:999px;padding:14px;">🍬 SPIN</button>
      </form>
      <div id="sbResult"></div>
    </div>
  `);
  const card = gameModal.querySelector('.modal-card');
  bindQuickStake(card);
  card.querySelector('#closeModal').addEventListener('click', closeModal);

  card.querySelector('#sbForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = card.querySelector('#sbPlayBtn');
    const amount = card.querySelector('#stakeInput').value;
    if (!amount || amount <= 0) return;
    btn.disabled = true;
    btn.textContent = '🌀 Spinning…';

    // Spin animation
    const cells = card.querySelectorAll('.sb-cell');
    cells.forEach(c => c.classList.add('spinning'));
    const spinInterval = setInterval(() => {
      cells.forEach(c => { c.textContent = CANDY[Math.floor(Math.random() * CANDY.length)]; });
    }, 80);

    const data = await placeBet('sweet_bonanza', amount, null);

    // Stop after 1.5s
    setTimeout(() => {
      clearInterval(spinInterval);
      cells.forEach(c => c.classList.remove('spinning'));

      // Fill grid with final symbols
      const winSymbol = data?.won ? CANDY[Math.floor(Math.random() * 6)] : null;
      cells.forEach((c, i) => {
        const rand = CANDY[Math.floor(Math.random() * CANDY.length)];
        if (data?.won && Math.random() < 0.35) {
          c.textContent = winSymbol;
          c.classList.add('win');
        } else {
          c.textContent = rand;
        }
      });

      if (data) {
        const multEl = card.querySelector('#sbMultiplier');
        if (data.won) {
          multEl.textContent = `✨ ${data.multiplier}× Multiplier!`;
          multEl.style.color = data.multiplier >= 10 ? '#f472b6' : 'var(--accent)';
        }
        card.querySelector('#sbResult').innerHTML = `
          <div class="game-result-banner ${data.won ? 'win' : 'lose'}">
            <div class="result-title">${data.won ? '🍭 ' + formatMoney(data.payout) + ' WIN!' : '💔 No match'}</div>
            <div class="result-sub">${escapeHtml(data.message)}</div>
          </div>
        `;
        showGameResult(data);
      }
      btn.textContent = '🍬 SPIN';
      btn.disabled = false;
    }, 1600);
  });
}

// ── Route modal by game key ───────────────────────────────────────────
function openGameModalByKey(key) {
  if (!state.profile) {
    showNotice('Please sign in first to play.', 'info');
    showScreen('profileScreen');
    return;
  }
  if (!gameEnabled(key)) {
    showNotice('This game is under maintenance.', 'info');
    return;
  }
  if (state.profile.balance <= 0) {
    showNotice('Top up your balance to play.', 'info');
    showScreen('walletScreen');
    return;
  }
  const openers = {
    crash: openCrashModal,
    mines: openMinesModal,
    coinflip: openCoinflipModal,
    plinko: openPlinkoModal,
    sweet_bonanza: openSweetBonanzaModal
  };
  (openers[key] || openCrashModal)();
}

// ── Rendering ─────────────────────────────────────────────────────────
function gameCards(container, template) {
  if (!container) return;
  const list = GAMES.filter(g => !g.key.startsWith('_'));
  container.innerHTML = list.map(g => template(g, !gameEnabled(g.key))).join('');
  container.querySelectorAll('[data-game]').forEach(el => {
    el.addEventListener('click', () => openGameModalByKey(el.dataset.game));
  });
}

function renderGames() {
  gameCards(document.getElementById('gamesCarousel'), (g, disabled) => `
    <button class="game-card ${disabled ? 'disabled' : ''}" data-game="${g.key}" style="border:none;text-align:left;">
      <img src="${g.art}" alt="${g.name}" />
      <span class="game-title">${g.name}</span>
      <small>${disabled ? 'Soon' : 'Play'}</small>
    </button>
  `);
}

function renderCasino() {
  gameCards(document.getElementById('casinoGrid'), (g, disabled) => `
    <div class="casino-card ${disabled ? 'disabled' : ''}" data-game="${g.key}">
      <img src="${g.art}" alt="${g.name}" />
      <div class="casino-card__meta">
        <strong>${g.name}</strong>
        <span>${disabled ? 'Maintenance' : 'Live now · Fair random'}</span>
      </div>
    </div>
  `);
}

function renderPromoList() {
  const el = document.getElementById('promoList');
  if (!el) return;
  el.innerHTML = PROMOS.map(p => `
    <div class="promo-card">
      <strong>${p.title}</strong>
      <p>${p.value}</p>
      <span>${p.text}</span>
    </div>
  `).join('');
}

function renderLiveWins() {
  const el = document.getElementById('liveWinsList');
  if (!el) return;
  if (!state.liveWins.length) {
    el.innerHTML = '<li style="color:var(--muted);text-align:center;padding:16px;">Be the first to win today!</li>';
    return;
  }
  const ago = d => {
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    return Math.floor(s / 3600) + 'h ago';
  };
  el.innerHTML = state.liveWins.map(w => `
    <li>
      <div>
        <strong>${escapeHtml(w.player)}</strong>
        <span class="win-game"> · ${escapeHtml(w.game)}</span>
      </div>
      <div style="text-align:right;">
        <div class="win-amount">+${formatMoney(w.amount)}</div>
        <div style="font-size:11px;color:var(--muted);">${ago(w.created_at)}</div>
      </div>
    </li>
  `).join('');
}

function renderBalance() {
  const b = document.getElementById('balanceLabel');
  const w = document.getElementById('walletBalance');
  const v = formatMoney(state.profile?.balance || 0);
  if (b) b.textContent = v;
  if (w) w.textContent = v;
}

function renderHome() {
  const g = document.getElementById('statGames');
  const d = document.getElementById('statDeposits');
  const u = document.getElementById('statUsers');
  if (g) g.textContent = `${GAMES.filter(x => gameEnabled(x.key)).length} Games`;
  if (d) d.textContent = state.settings.deposits_enabled ? 'Deposits ✓' : 'Deposits ✗';
  if (u) u.textContent = state.profile ? `@${state.profile.nickname}` : 'Sign in to play';
}

function renderWallet() {
  renderBalance();

  // Deposit addresses block
  const addrBlock = document.getElementById('depositAddressesBlock');
  if (addrBlock) {
    const deps = metaSettings().deposit_addresses || {};
    const keys = Object.keys(deps).filter(k => deps[k]);
    if (keys.length) {
      addrBlock.innerHTML = `
        <div class="section-title-row" style="margin-top:0;"><h2>💳 Deposit Addresses</h2></div>
        ${keys.map(k => `
          <div class="deposit-address-card">
            <div class="addr-label">${escapeHtml(k)}</div>
            <div class="addr-value" id="addr_${k}">${escapeHtml(deps[k])}</div>
            <button class="copy-btn" onclick="navigator.clipboard.writeText('${escapeHtml(deps[k])}');this.textContent='Copied!';setTimeout(()=>this.textContent='Copy Address',1500)">Copy Address</button>
          </div>
        `).join('')}
        <p class="hint" style="margin-bottom:14px;">After sending, create a deposit request below. Processing: 5–15 min.</p>
      `;
    } else {
      addrBlock.innerHTML = '';
    }
  }

  const container = document.getElementById('walletRequests');
  if (!container) return;
  if (!state.requests.length) {
    container.innerHTML = '<p class="hint">No requests yet.</p>';
    return;
  }
  const labels = { pending: 'Processing…', approved: 'Completed ✓', rejected: 'Rejected' };
  const statusClass = { pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected' };
  container.innerHTML = state.requests.map(r => `
    <div class="request-item">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <strong>${r.kind === 'deposit' ? '⬇ Deposit' : '⬆ Withdraw'}</strong>
          · ${formatMoney(r.amount)}
          <div style="font-size:12px;color:var(--muted);">${escapeHtml(r.method || r.address || 'manual')}</div>
        </div>
        <div style="text-align:right;">
          <span class="status-badge ${statusClass[r.status] || ''}">${labels[r.status] || r.status}</span>
          ${r.status === 'pending' ? '<div class="processing-indicator" style="margin-top:6px;"><div class="processing-dot"></div><span>5–15 min</span></div>' : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function renderAuthPanel() {
  const el = document.getElementById('authPanel');
  const reg = state.authMode === 'register';
  el.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:14px;">${reg ? 'Create Account' : 'Welcome Back'}</h3>
    <form id="authForm" class="auth-form">
      <select id="authModeSelect" style="border-radius:12px;padding:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#fff;">
        <option value="register" ${reg ? 'selected' : ''}>New account</option>
        <option value="login"    ${reg ? '' : 'selected'}>Sign in</option>
      </select>
      <input id="authEmail"    type="email"    placeholder="Email"    autocomplete="email" required />
      <input id="authPassword" type="password" placeholder="Password (min 6 chars)"
        autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="6" required />
      ${reg ? '<input id="authNickname" placeholder="Nickname" required />' : ''}
      <button type="submit">Continue →</button>
    </form>
    <p class="hint" style="margin-top:10px;">Your balance is stored securely in the casino database.</p>
  `;
  el.querySelector('#authModeSelect').addEventListener('change', ev => {
    state.authMode = ev.target.value;
    renderAuthPanel();
  });
  el.querySelector('#authForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    btn.disabled = true;
    const email = el.querySelector('#authEmail').value.trim();
    const pass  = el.querySelector('#authPassword').value;
    if (reg) {
      const nick = el.querySelector('#authNickname').value.trim();
      const { data, error } = await db.auth.signUp({ email, password: pass, options: { data: { nickname: nick } } });
      if (error) showNotice(errorText(error), 'info');
      else if (!data.session) showNotice('Account created! Check your email to confirm, then log in.', 'info');
      else showNotice('Welcome to Rocket Crown! 🎉', 'win');
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password: pass });
      if (error) showNotice(errorText(error), 'info');
      else showNotice('Welcome back! 🚀', 'win');
    }
    btn.disabled = false;
  });
}

function renderProfile() {
  const authPanel    = document.getElementById('authPanel');
  const profilePanel = document.getElementById('profilePanel');
  const settingsPanel = document.getElementById('settingsPanel');
  if (!authPanel || !profilePanel || !settingsPanel) return;

  if (!state.profile) {
    renderAuthPanel();
    profilePanel.innerHTML = '<h3 style="font-family:Rajdhani,sans-serif;">Profile</h3><p class="hint" style="margin-top:8px;">Please sign in to access your profile.</p>';
    settingsPanel.innerHTML = '';
    return;
  }
  const p = state.profile;
  authPanel.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:14px;">👤 Signed In</h3>
    <p style="font-size:17px;font-weight:700;font-family:Rajdhani,sans-serif;">${escapeHtml(p.nickname)}</p>
    <p class="hint">Personal ID: ${escapeHtml(p.personal_id)}</p>
    ${p.banned ? '<p style="color:var(--red);margin-top:8px;font-weight:600;">⚠ Your account is banned.</p>' : ''}
    <button id="logoutBtn" class="secondary-btn" style="margin-top:14px;">Logout</button>
  `;
  authPanel.querySelector('#logoutBtn').addEventListener('click', () => db.auth.signOut());

  profilePanel.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:14px;">Edit Profile</h3>
    <form id="profileForm" class="profile-form">
      <div class="profile-grid">
        <label>Nickname<input name="nickname" value="${escapeHtml(p.nickname)}" required /></label>
        <label>Phone<input name="phone" value="${escapeHtml(p.phone || '')}" /></label>
        <label>Email<input value="${escapeHtml(p.email || '')}" disabled /></label>
        <label>Personal ID<input value="${escapeHtml(p.personal_id)}" disabled /></label>
      </div>
      <button type="submit" style="margin-top:6px;">Save Profile</button>
    </form>
  `;
  profilePanel.querySelector('#profileForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const updates = Object.fromEntries(new FormData(ev.target).entries());
    const { error } = await db.from('profiles').update(updates).eq('id', p.id);
    if (error) { showNotice(errorText(error), 'info'); return; }
    await loadProfile(); render();
    showNotice('Profile saved!', 'win');
  });

  settingsPanel.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:10px;">Casino Access</h3>
    <p class="hint">${p.is_admin ? '👑 You are the casino owner.' : 'Payments confirmed manually by the owner.'}</p>
    ${p.is_admin ? '<a class="secondary-btn" href="admin/" style="display:inline-block;margin-top:12px;">⚙️ Open Admin Panel</a>' : ''}
  `;

  // Update menu auth label
  const menuLabel = document.getElementById('menuAuthLabel');
  if (menuLabel) menuLabel.textContent = `Signed in: ${p.nickname}`;
  const menuLogin = document.getElementById('menuLoginBtn');
  if (menuLogin) {
    menuLogin.querySelector('.menu-icon').textContent = '👤';
    menuLogin.onclick = e => { e.preventDefault(); showScreen('profileScreen'); menuPanel.classList.remove('open'); };
  }
  const adminLink = document.getElementById('menuAdminLink');
  if (adminLink) adminLink.style.display = p.is_admin ? 'flex' : 'none';
}

function renderMenu() {
  // Contact info from admin settings
  const meta = metaSettings();
  const email = meta.contact_email || 'support@rocketcrown.com';
  const tg    = meta.contact_telegram || '';
  const emailEl = document.getElementById('menuContactEmail');
  if (emailEl) { emailEl.textContent = email; emailEl.href = `mailto:${email}`; }

  const supportBtn = document.getElementById('menuSupportBtn');
  if (supportBtn && tg) {
    supportBtn.onclick = e => { e.preventDefault(); window.open(`https://t.me/${tg.replace('@','')}`, '_blank'); };
  }
}

function render() {
  renderHome();
  renderGames();
  renderCasino();
  renderPromoList();
  renderLiveWins();
  renderWallet();
  renderProfile();
  renderMenu();
}

// ── Event bindings ────────────────────────────────────────────────────
function bindNavigation() {
  menuButton?.addEventListener('click', () => menuPanel.classList.toggle('open'));
  document.addEventListener('click', ev => {
    if (!menuPanel.contains(ev.target) && ev.target !== menuButton)
      menuPanel.classList.remove('open');
  });

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => showScreen(`${btn.dataset.screen}Screen`));
  });

  document.getElementById('claimBonusBtn')?.addEventListener('click', () => {
    showNotice('Bonus activated! Your next deposit gets a 100% boost. 🎁', 'win');
  });

  // Menu: login button when not signed in
  document.getElementById('menuLoginBtn')?.addEventListener('click', e => {
    e.preventDefault();
    showScreen('profileScreen');
    menuPanel.classList.remove('open');
  });
}

async function createRequest(kind, amount, extra) {
  if (!state.profile) { showNotice('Please sign in first.', 'info'); return false; }
  if (!(amount > 0)) { showNotice('Enter a valid amount.', 'info'); return false; }
  const { error } = await db.from('payment_requests')
    .insert({ user_id: state.profile.id, kind, amount, ...extra });
  if (error) { showNotice(errorText(error), 'info'); return false; }
  await Promise.all([loadProfile(), loadRequests()]);
  renderWallet();
  return true;
}

function bindWalletForms() {
  document.getElementById('depositForm')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!state.settings.deposits_enabled) { showNotice('Deposits are temporarily disabled.', 'info'); return; }
    const amount = Number(document.getElementById('depositAmount').value);
    const method = document.getElementById('depositMethod').value;
    if (await createRequest('deposit', amount, { method })) {
      showNotice('Deposit request created! Processing in 5–15 minutes. ⏱', 'win');
      document.getElementById('depositAmount').value = '';
    }
  });

  document.getElementById('withdrawForm')?.addEventListener('submit', async ev => {
    ev.preventDefault();
    const amount  = Number(document.getElementById('withdrawAmount').value);
    const address = document.getElementById('withdrawAddress').value.trim();
    if (await createRequest('withdraw', amount, { address })) {
      showNotice('Withdraw request created! Funds on hold until paid out. ✅', 'win');
      document.getElementById('withdrawAmount').value = '';
      document.getElementById('withdrawAddress').value = '';
    }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────
db.auth.onAuthStateChange(() => refreshAll());
bindNavigation();
bindWalletForms();
showScreen('homeScreen');

// Refresh live wins every 20s
setInterval(async () => { await loadLiveWins(); renderLiveWins(); }, 20000);
