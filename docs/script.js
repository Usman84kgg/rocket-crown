const { db, formatMoney, errorText } = window.rocketCrown;

// ── Constants ─────────────────────────────────────────────────────────
const GAMES = [
  { key:'mines',        name:'Jackpot Mines',      art:'assets/games/mines.jpg' },
  { key:'crash',        name:'Crash X',             art:'assets/games/crash.jpg' },
  { key:'coinflip',     name:'Coin Flip',           art:'assets/games/coinflip.jpg' },
  { key:'plinko',       name:'Plinko+',             art:'assets/games/plinko.jpg' },
  { key:'sweet_bonanza',name:'Sweet Bonanza 1000x', art:'assets/games/sweet_bonanza.jpg' }
];

const GAME_ICONS = { mines:'💣', crash:'🚀', coinflip:'🪙', plinko:'🎯', sweet_bonanza:'🍭' };
const CANDY = ['🍬','🍭','🍰','🎂','🍎','🍇','🍋','🍊','💎','🌟'];

// Crypto currencies (key must match admin address keys)
const CRYPTOS = [
  { key:'TON',      name:'Gram (TON)',    net:'Toncoin',        icon:'TON', cls:'ci-ton',  bonus:'+7%' },
  { key:'USDT_BEP', name:'USDT (BEP20)', net:'BNB Smart Chain',icon:'USDT',cls:'ci-usdt', bonus:'+5%' },
  { key:'USDT_TRC', name:'USDT (TRC20)', net:'Tron Network',   icon:'USDT',cls:'ci-usdt', bonus:'+5%' },
  { key:'SOL',      name:'SOL',          net:'Solana',         icon:'SOL', cls:'ci-sol',  bonus:'+5%' },
  { key:'USDT_SOL', name:'USDT (SOL)',   net:'Solana',         icon:'USDT',cls:'ci-usdt', bonus:'+5%' },
  { key:'USDC_BEP', name:'USDC (BEP20)',net:'BNB Smart Chain', icon:'USDC',cls:'ci-usdc', bonus:'+5%' },
  { key:'LTC',      name:'Litecoin',     net:'LTC Network',    icon:'LTC', cls:'ci-ltc',  bonus:'+5%' },
  { key:'BNB',      name:'BNB',          net:'Binance Chain',  icon:'BNB', cls:'ci-bnb',  bonus:'+5%' },
];

// ── DOM refs ──────────────────────────────────────────────────────────
const menuButton = document.getElementById('menuButton');
const menuPanel  = document.getElementById('menuPanel');
const navButtons = document.querySelectorAll('.nav-btn');
const screens    = document.querySelectorAll('.screen');
const gameModal  = document.getElementById('gameModal');

// ── State ─────────────────────────────────────────────────────────────
const state = {
  profile:    null,
  requests:   [],
  bets:       [],
  settings:   { deposits_enabled: true, games: {} },
  authMode:   'register',
  walletTab:  'deposit',
  betsTab:    'recent',
  betsLoaded: false,
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
function metaSettings() { return state.settings.games?._meta || {}; }
function depositAddresses() { return metaSettings().deposit_addresses || {}; }

// ── Navigation ────────────────────────────────────────────────────────
function showScreen(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  navButtons.forEach(b => b.classList.toggle('active', id.replace('Screen','') === b.dataset.screen));
  menuPanel.classList.remove('open');
  if (id === 'homeScreen' && !state.betsLoaded) loadAndRenderBets();
}

// ── Toasts ────────────────────────────────────────────────────────────
function toastStack() {
  let s = document.getElementById('toastStack');
  if (!s) {
    s = document.createElement('div');
    s.id = 'toastStack'; s.className = 'toast-stack';
    document.body.appendChild(s);
  }
  return s;
}
function showNotice(message, type = 'info') {
  const icons = { win:'🏆', lose:'💔', info:'💬' };
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type]||'💬'}</span><span class="toast-text">${escapeHtml(message)}</span>`;
  const stack = toastStack();
  stack.prepend(t);
  setTimeout(() => t.style.opacity = '0', 2800);
  setTimeout(() => t.remove(), 3200);
}
function showGameResult(data) {
  showNotice(data.message + ' · Balance: ' + formatMoney(data.balance), data.won ? 'win' : 'lose');
}

// ── Loading ───────────────────────────────────────────────────────────
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
    .select('*').order('created_at', { ascending: false }).limit(30);
  state.requests = data || [];
}
async function loadAndRenderBets() {
  state.betsLoaded = true;
  const tab = state.betsTab;
  let rows = [];
  if (tab === 'recent') {
    const { data } = await db.rpc('get_recent_bets', { p_limit: 20 });
    rows = data || [];
  } else {
    const period = tab === 'topweek' ? 'week' : 'month';
    const { data } = await db.rpc('get_top_wins', { p_period: period, p_limit: 20 });
    rows = data || [];
  }
  state.bets = rows;
  renderBetsTable();
}

function watchProfile() {
  if (profileChannel) db.removeChannel(profileChannel);
  if (!state.profile) return;
  profileChannel = db.channel('profile-sync')
    .on('postgres_changes', { event:'UPDATE', schema:'public', table:'profiles',
      filter:`id=eq.${state.profile.id}` }, payload => {
      state.profile = payload.new; renderBalance(); renderProfile();
    })
    .on('postgres_changes', { event:'*', schema:'public', table:'payment_requests',
      filter:`user_id=eq.${state.profile.id}` }, async () => {
      await loadRequests(); renderWallet();
    })
    .subscribe();
}

async function refreshAll() {
  await Promise.all([loadSettings(), loadProfile()]);
  await loadRequests();
  watchProfile();
  render();
  if (state.betsLoaded) loadAndRenderBets();
}

// ── Betting ───────────────────────────────────────────────────────────
async function placeBet(gameKey, amount, choice) {
  const { data, error } = await db.rpc('place_bet', {
    p_game: gameKey, p_amount: Number(amount), p_choice: choice ?? null
  });
  if (error) { showNotice(errorText(error), 'info'); return null; }
  state.profile.balance = data.balance;
  renderBalance();
  // Refresh live bets async
  if (state.betsLoaded) loadAndRenderBets();
  return data;
}

// ── Game modals ───────────────────────────────────────────────────────
function openModal(html)  { gameModal.innerHTML = html; gameModal.hidden = false; }
function closeModal()     { gameModal.innerHTML = ''; gameModal.hidden = true; }

function stakeFormHtml(label = 'Stake ($)') {
  return `
    <div class="stake-row">
      <input type="number" id="stakeInput" min="0.01" step="0.01" placeholder="${label}" required />
    </div>
    <div class="stake-quick">
      <button type="button" data-quick="1">$1</button>
      <button type="button" data-quick="5">$5</button>
      <button type="button" data-quick="10">$10</button>
      <button type="button" data-quick="25">$25</button>
      <button type="button" data-quick="50">$50</button>
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

// CRASH
function openCrashModal() {
  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">🚀 Crash X</div>
      <div class="modal-subtitle">House edge 3% · Provably fair crash point</div>
      <div class="crash-display">
        <div class="crash-multiplier" id="crashMult">1.00×</div>
        <div class="crash-label" id="crashLabel">Place your bet to start</div>
      </div>
      <form id="crashForm" class="game-form">
        ${stakeFormHtml()}
        <label style="font-size:13px;color:var(--muted);">Cash out at multiplier</label>
        <input type="number" id="targetInput" min="1.1" step="0.1" value="2.0" required />
        <button type="submit" id="crashPlayBtn">Bet &amp; Watch</button>
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
    const multEl  = card.querySelector('#crashMult');
    const labelEl = card.querySelector('#crashLabel');
    multEl.textContent = '1.00×'; multEl.className = 'crash-multiplier';
    labelEl.textContent = '🚀 Flying…';
    let current = 1.0;
    const rise = setInterval(() => { current += current * 0.015; multEl.textContent = current.toFixed(2) + '×'; }, 80);
    const data = await placeBet('crash', amount, target);
    clearInterval(rise);
    if (!data) { btn.disabled = false; return; }
    const animTo = data.won ? Number(target) : data.multiplier;
    let anim = 1.0;
    const fin = setInterval(() => {
      anim += (animTo - anim) * 0.12;
      multEl.textContent = anim.toFixed(2) + '×';
      if (Math.abs(anim - animTo) < 0.02) {
        clearInterval(fin);
        multEl.textContent = animTo.toFixed(2) + '×';
        if (!data.won) { multEl.classList.add('crashed'); labelEl.textContent = '💥 Crashed!'; }
        else labelEl.textContent = '✅ Cashed out!';
        card.insertAdjacentHTML('beforeend',`
          <div class="game-result-banner ${data.won?'win':'lose'}">
            <div class="result-title">${data.won?'🏆 You Won '+formatMoney(data.payout):'💔 You Lost'}</div>
            <div class="result-sub">${escapeHtml(data.message)}</div>
          </div>`);
        showGameResult(data); btn.disabled = false;
      }
    }, 50);
  });
}

// MINES
function openMinesModal() {
  const cells = Array.from({length:25},(_,i)=>`<div class="mine-cell" data-idx="${i}">💎</div>`).join('');
  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">💣 Jackpot Mines</div>
      <div class="modal-subtitle">48.7% win · 1.95× payout · RTP 95%</div>
      <form id="minesForm" class="game-form">
        ${stakeFormHtml()}
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
    const grid = card.querySelector('#minesGrid');
    grid.style.display = 'grid';
    const cellEls = grid.querySelectorAll('.mine-cell');
    const mineIdx = Math.floor(Math.random() * 25);
    cellEls.forEach(c => { c.textContent = '?'; c.className = 'mine-cell'; });
    let revealed = 0;
    const rev = setInterval(() => {
      const idx = revealed++;
      const cell = cellEls[idx];
      if (!cell) { clearInterval(rev); return; }
      setTimeout(() => {
        if (data.won) {
          cell.textContent = idx === mineIdx ? '💣' : '💎';
          cell.classList.add(idx === mineIdx ? 'revealed-mine' : 'revealed-gem');
        } else {
          cell.textContent = idx === mineIdx ? '💥' : '⬜';
          cell.classList.add(idx === mineIdx ? 'revealed-mine' : 'revealed-safe');
        }
      }, idx * 40);
      if (revealed >= 25) {
        clearInterval(rev);
        setTimeout(() => {
          card.querySelector('#minesResult').innerHTML = `
            <div class="game-result-banner ${data.won?'win':'lose'}" style="margin-top:12px;">
              <div class="result-title">${data.won?'🏆 '+formatMoney(data.payout):'💔 Mine Hit!'}</div>
              <div class="result-sub">${escapeHtml(data.message)}</div>
            </div>`;
          showGameResult(data); btn.disabled = false;
        }, 25*40+200);
      }
    }, 40);
  });
}

// COINFLIP
function openCoinflipModal() {
  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">🪙 Coin Flip</div>
      <div class="modal-subtitle">50/50 · 1.95× payout · RTP 97.5%</div>
      <div class="coin-container"><div class="coin" id="coin">🪙</div></div>
      <form id="coinForm" class="game-form">
        ${stakeFormHtml()}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <label style="display:flex;align-items:center;gap:8px;padding:12px;border-radius:12px;background:rgba(255,255,255,.06);border:2px solid transparent;cursor:pointer;" id="lblHeads">
            <input type="radio" name="side" value="heads" required style="display:none;"> 🟡 Heads
          </label>
          <label style="display:flex;align-items:center;gap:8px;padding:12px;border-radius:12px;background:rgba(255,255,255,.06);border:2px solid transparent;cursor:pointer;" id="lblTails">
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
  card.querySelectorAll('[name="side"]').forEach(r => {
    r.addEventListener('change', () => {
      card.querySelector('#lblHeads').style.borderColor = r.value==='heads'?'var(--accent)':'transparent';
      card.querySelector('#lblTails').style.borderColor = r.value==='tails'?'var(--accent)':'transparent';
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
        <div class="game-result-banner ${data.won?'win':'lose'}" style="margin-top:12px;">
          <div class="result-title">${data.won?'🏆 You Won '+formatMoney(data.payout):'💔 You Lost'}</div>
          <div class="result-sub">Landed: <strong>${landed}</strong> · ${escapeHtml(data.message)}</div>
        </div>`;
      showGameResult(data); btn.disabled = false;
    }, 1500);
  });
}

// PLINKO
function openPlinkoModal() {
  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">🎯 Plinko+</div>
      <div class="modal-subtitle">47% win · 2× payout · RTP 94%</div>
      <canvas id="plinkoCanvas" class="plinko-canvas" width="320" height="160"></canvas>
      <div class="plinko-result" id="plinkoResult"></div>
      <form id="plinkoForm" class="game-form">
        ${stakeFormHtml()}
        <button type="submit" id="plinkoPlayBtn">Drop Ball</button>
      </form>
      <div id="plinkoResultBanner"></div>
    </div>
  `);
  const card = gameModal.querySelector('.modal-card');
  bindQuickStake(card);
  card.querySelector('#closeModal').addEventListener('click', closeModal);
  const canvas = card.querySelector('#plinkoCanvas');
  drawPlinkoBoard(canvas);
  card.querySelector('#plinkoForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = card.querySelector('#plinkoPlayBtn');
    const amount = card.querySelector('#stakeInput').value;
    if (!amount || amount <= 0) return;
    btn.disabled = true;
    animatePlinkoBall(canvas);
    const data = await placeBet('plinko', amount, null);
    if (!data) { btn.disabled = false; return; }
    setTimeout(() => {
      card.querySelector('#plinkoResult').textContent = data.won ? '🎉 Win pocket!' : '❌ Loss pocket';
      card.querySelector('#plinkoResultBanner').innerHTML = `
        <div class="game-result-banner ${data.won?'win':'lose'}">
          <div class="result-title">${data.won?'🏆 '+formatMoney(data.payout):'💔 Missed'}</div>
          <div class="result-sub">${escapeHtml(data.message)}</div>
        </div>`;
      showGameResult(data); btn.disabled = false;
    }, 1800);
  });
}
function drawPlinkoBoard(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,320,160);
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  for (let r=0;r<5;r++) {
    for (let c=0;c<=r+4-5+3;c++) {
      const x = (320/(r+3+1))*(c+0.5)+(320/(r+3+1))*0.5;
      const y = 24+r*26;
      ctx.beginPath(); ctx.arc(Math.min(x,310),y,5,0,Math.PI*2); ctx.fill();
    }
  }
}
function animatePlinkoBall(canvas) {
  const ctx = canvas.getContext('2d');
  let x=160, y=4, vy=2, vx=0;
  const anim = setInterval(() => {
    drawPlinkoBoard(canvas);
    vy+=0.4; vx+=(Math.random()-.5)*.8; x+=vx; y+=vy;
    if (x<10) x=10; if (x>310) x=310;
    ctx.fillStyle='#f5c842'; ctx.beginPath(); ctx.arc(x,y,8,0,Math.PI*2); ctx.fill();
    if (y>155) clearInterval(anim);
  }, 30);
}

// SWEET BONANZA
function openSweetBonanzaModal() {
  const emptyGrid = Array(30).fill('').map(()=>`<div class="sb-cell">${CANDY[Math.floor(Math.random()*CANDY.length)]}</div>`).join('');
  openModal(`
    <div class="modal-card">
      <div class="modal-handle"></div>
      <button class="modal-close" id="closeModal">×</button>
      <div class="modal-title">🍭 Sweet Bonanza 1000x</div>
      <div class="modal-subtitle">Scatter pays · RTP ~96%</div>
      <div class="sb-grid" id="sbGrid">${emptyGrid}</div>
      <div id="sbMultiplier" style="text-align:center;font-family:Rajdhani,sans-serif;font-size:18px;color:var(--accent);min-height:28px;margin-bottom:8px;"></div>
      <form id="sbForm" class="game-form">
        ${stakeFormHtml()}
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
    btn.disabled = true; btn.textContent = '🌀 Spinning…';
    const cells = card.querySelectorAll('.sb-cell');
    cells.forEach(c => c.classList.add('spinning'));
    const spinInterval = setInterval(() => { cells.forEach(c => { c.textContent = CANDY[Math.floor(Math.random()*CANDY.length)]; }); }, 80);
    const data = await placeBet('sweet_bonanza', amount, null);
    setTimeout(() => {
      clearInterval(spinInterval);
      cells.forEach(c => c.classList.remove('spinning'));
      const winSym = data?.won ? CANDY[Math.floor(Math.random()*6)] : null;
      cells.forEach((c) => {
        const rand = CANDY[Math.floor(Math.random()*CANDY.length)];
        if (data?.won && Math.random()<.35) { c.textContent = winSym; c.classList.add('win'); }
        else c.textContent = rand;
      });
      if (data) {
        const multEl = card.querySelector('#sbMultiplier');
        if (data.won) { multEl.textContent = `✨ ${data.multiplier}× Multiplier!`; multEl.style.color = data.multiplier >= 10 ? '#f472b6' : 'var(--accent)'; }
        card.querySelector('#sbResult').innerHTML = `
          <div class="game-result-banner ${data.won?'win':'lose'}">
            <div class="result-title">${data.won?'🍭 '+formatMoney(data.payout)+' WIN!':'💔 No match'}</div>
            <div class="result-sub">${escapeHtml(data.message)}</div>
          </div>`;
        showGameResult(data);
      }
      btn.textContent = '🍬 SPIN'; btn.disabled = false;
    }, 1600);
  });
}

function openGameModalByKey(key) {
  if (!state.profile) {
    showNotice('Пожалуйста, войдите чтобы играть.', 'info');
    showScreen('profileScreen'); return;
  }
  if (!gameEnabled(key)) { showNotice('Игра на техническом обслуживании.', 'info'); return; }
  if (state.profile.balance < 0.01) {
    showNotice('Пополните баланс для игры.', 'info');
    showScreen('walletScreen'); return;
  }
  const openers = { crash:openCrashModal, mines:openMinesModal, coinflip:openCoinflipModal, plinko:openPlinkoModal, sweet_bonanza:openSweetBonanzaModal };
  (openers[key] || openCrashModal)();
}

// ── Rendering ─────────────────────────────────────────────────────────
function renderBalance() {
  const v = formatMoney(state.profile?.balance || 0);
  const b = document.getElementById('balanceLabel');
  const w = document.getElementById('walletBalance');
  if (b) b.textContent = v;
  if (w) w.textContent = v;
}

function renderHome() {
  const g = document.getElementById('statGames');
  const d = document.getElementById('statDeposits');
  const u = document.getElementById('statUsers');
  if (g) g.textContent = `${GAMES.filter(x=>gameEnabled(x.key)).length} Games`;
  if (d) d.textContent = state.settings.deposits_enabled ? 'Deposits ✓' : 'Deposits ✗';
  if (u) u.textContent = state.profile ? `@${state.profile.nickname}` : 'Sign in to play';
}

function renderGames() {
  const container = document.getElementById('gamesCarousel');
  if (!container) return;
  const list = GAMES.filter(g => !g.key.startsWith('_'));
  container.innerHTML = list.map(g => {
    const disabled = !gameEnabled(g.key);
    return `
      <button class="game-card ${disabled?'disabled':''}" data-game="${g.key}" style="border:none;text-align:left;">
        <img src="${g.art}" alt="${g.name}" loading="lazy" />
        <span class="game-title">${g.name}</span>
        <small>${disabled?'Soon':'Play'}</small>
      </button>`;
  }).join('');
  container.querySelectorAll('[data-game]').forEach(el => el.addEventListener('click', () => openGameModalByKey(el.dataset.game)));
}

function renderCasino() {
  const container = document.getElementById('casinoGrid');
  if (!container) return;
  const list = GAMES.filter(g => !g.key.startsWith('_'));
  container.innerHTML = list.map(g => {
    const disabled = !gameEnabled(g.key);
    return `
      <div class="casino-card ${disabled?'disabled':''}" data-game="${g.key}">
        <img src="${g.art}" alt="${g.name}" loading="lazy" />
        <div class="casino-card__meta">
          <strong>${g.name}</strong>
          <span>${disabled?'Maintenance':'Live now · Fair random'}</span>
        </div>
      </div>`;
  }).join('');
  container.querySelectorAll('[data-game]').forEach(el => el.addEventListener('click', () => openGameModalByKey(el.dataset.game)));
}

function renderPromoList() {
  const el = document.getElementById('promoList');
  if (!el) return;
  el.innerHTML = `
    <div class="promo-card">
      <strong>Welcome Boost</strong>
      <p>100% on first deposit</p>
      <span>Boost your first deposit instantly.</span>
    </div>
    <div class="promo-card">
      <strong>VIP Reload</strong>
      <p>50% every Friday</p>
      <span>Use on every Friday reload.</span>
    </div>`;
}

// ── LIVE BETS TABLE ───────────────────────────────────────────────────
function renderBetsTable() {
  const container = document.getElementById('liveBetsTable');
  if (!container) return;
  const rows = state.bets;
  if (!rows.length) {
    container.innerHTML = '<p class="hint" style="text-align:center;padding:16px;">No bets yet.</p>';
    return;
  }
  container.innerHTML = rows.map(row => {
    const icon = GAME_ICONS[row.game] || '🎮';
    const isWin = row.won;
    const amount = isWin ? '+'+formatMoney(row.payout) : '-'+formatMoney(row.amount);
    const ago = (() => {
      const s = Math.floor((Date.now() - new Date(row.created_at)) / 1000);
      if (s < 60) return 'just now';
      if (s < 3600) return Math.floor(s/60)+'m ago';
      return Math.floor(s/3600)+'h ago';
    })();
    return `
      <div class="bet-row">
        <div class="bet-row-icon">${icon}</div>
        <div class="bet-row-info">
          <div class="bet-player">${escapeHtml(row.player)}</div>
          <div class="bet-game">${escapeHtml(row.game.replace('_',' '))} · ${ago}</div>
        </div>
        <div class="bet-row-amount ${isWin?'won':'lost'}">${amount}</div>
      </div>`;
  }).join('');
}

function bindBetsTabs() {
  document.querySelectorAll('.bets-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.bets-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.betsTab = btn.dataset.betsTab;
      state.bets = [];
      renderBetsTable();
      loadAndRenderBets();
    });
  });
}

// ── WALLET ────────────────────────────────────────────────────────────
function renderWallet() {
  renderBalance();
  renderWalletPanel();
}

function switchWalletTab(tab) {
  state.walletTab = tab;
  document.querySelectorAll('.wallet-tab').forEach(b => b.classList.toggle('active', b.dataset.wtab === tab));
  document.getElementById('wPanelDeposit').style.display  = tab === 'deposit'  ? '' : 'none';
  document.getElementById('wPanelWithdraw').style.display = tab === 'withdraw' ? '' : 'none';
  document.getElementById('wPanelHistory').style.display  = tab === 'history'  ? '' : 'none';
}

function renderWalletPanel() {
  renderCryptoGrid('deposit');
  renderCryptoGrid('withdraw');
  renderHistory();
}

function cryptoIconHtml(c) {
  return `<div class="crypto-icon ${c.cls}">${c.icon}</div>`;
}

function renderCryptoGrid(mode) {
  const container = document.getElementById(`cryptoGrid${mode === 'deposit' ? 'Deposit' : 'Withdraw'}`);
  if (!container) return;
  const addrs = depositAddresses();
  container.innerHTML = CRYPTOS.map(c => {
    const addr = addrs[c.key];
    const disabled = !addr;
    return `
      <div class="crypto-card ${disabled?'disabled':''}" data-crypto="${c.key}" data-mode="${mode}">
        <div class="crypto-card-left">
          <div class="crypto-card-name">${c.name}</div>
          <div class="crypto-card-net">${c.net}</div>
          <div class="crypto-card-bonus">🎁 ${c.bonus}</div>
        </div>
        ${cryptoIconHtml(c)}
      </div>`;
  }).join('');
  container.querySelectorAll('.crypto-card:not(.disabled)').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.crypto-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      showCurrencyDetail(card.dataset.crypto, mode);
    });
  });
}

function showCurrencyDetail(cryptoKey, mode) {
  const c = CRYPTOS.find(x => x.key === cryptoKey);
  if (!c) return;
  const addrs = depositAddresses();
  const addr = addrs[cryptoKey] || '';
  const blockId = mode === 'deposit' ? 'depositCurrencyBlock' : 'withdrawCurrencyBlock';
  const block = document.getElementById(blockId);
  if (!block) return;

  if (mode === 'deposit') {
    block.style.display = '';
    block.innerHTML = `
      <div class="currency-detail">
        <h3>${cryptoIconHtml(c)} ${c.name} Deposit</h3>
        ${addr ? `
          <div class="addr-box">
            <div class="addr-label">Deposit Address</div>
            <div class="addr-value" id="addrVal_${cryptoKey}">${escapeHtml(addr)}</div>
          </div>
          <button class="copy-btn" onclick="
            navigator.clipboard.writeText('${escapeHtml(addr)}');
            this.textContent='✅ Copied!';
            setTimeout(()=>this.textContent='Copy Address',1800)
          ">Copy Address</button>
          <p class="hint" style="margin-top:10px;">After sending, create a deposit request below. Processing: 5–15 min.</p>
          <form id="depositForm_${cryptoKey}" class="wallet-form" style="margin-top:10px;">
            <input type="number" id="depAmt_${cryptoKey}" min="1" step="1" placeholder="Deposit amount ($)" required />
            <button type="submit">📥 Request Deposit</button>
          </form>` : `<p class="hint">Address not configured yet. Check back soon.</p>`}
      </div>`;
    if (addr) {
      document.getElementById(`depositForm_${cryptoKey}`)?.addEventListener('submit', async ev => {
        ev.preventDefault();
        if (!state.settings.deposits_enabled) { showNotice('Deposits temporarily disabled.', 'info'); return; }
        const amount = Number(document.getElementById(`depAmt_${cryptoKey}`).value);
        await createPaymentRequest('deposit', amount, { method: c.name });
      });
    }
  } else {
    block.style.display = '';
    block.innerHTML = `
      <div class="currency-detail">
        <h3>${cryptoIconHtml(c)} ${c.name} Withdraw</h3>
        <form id="withdrawForm_${cryptoKey}" class="wallet-form">
          <input type="number" id="wdAmt_${cryptoKey}"  min="10" step="1" placeholder="Amount ($)" required />
          <input type="text"   id="wdAddr_${cryptoKey}" placeholder="Your ${c.name} address" required />
          <button type="submit">⬆ Request Withdraw</button>
        </form>
        <p class="hint" style="margin-top:8px;">Minimum withdraw: $10. Processed manually within 24h.</p>
      </div>`;
    document.getElementById(`withdrawForm_${cryptoKey}`)?.addEventListener('submit', async ev => {
      ev.preventDefault();
      const amount  = Number(document.getElementById(`wdAmt_${cryptoKey}`).value);
      const address = document.getElementById(`wdAddr_${cryptoKey}`).value.trim();
      await createPaymentRequest('withdraw', amount, { address, method: c.name });
    });
  }
}

function renderHistory() {
  const container = document.getElementById('walletRequests');
  if (!container) return;
  if (!state.profile) { container.innerHTML = '<p class="hint">Sign in to see your history.</p>'; return; }
  if (!state.requests.length) { container.innerHTML = '<p class="hint">No transactions yet.</p>'; return; }
  const labels = { pending:'Processing…', approved:'Completed ✓', rejected:'Rejected ✗' };
  const statusClass = { pending:'status-pending', approved:'status-approved', rejected:'status-rejected' };
  container.innerHTML = state.requests.map(r => `
    <div class="request-item">
      <div>
        <strong>${r.kind === 'deposit' ? '⬇ Deposit' : '⬆ Withdraw'}</strong> · ${formatMoney(r.amount)}
        <div style="font-size:12px;color:var(--muted);">${escapeHtml(r.method || r.address || 'manual')} · ${new Date(r.created_at).toLocaleDateString()}</div>
      </div>
      <div style="text-align:right;">
        <span class="status-badge ${statusClass[r.status]||''}">${labels[r.status]||r.status}</span>
        ${r.status==='pending' ? '<div class="processing-indicator" style="margin-top:6px;"><div class="processing-dot"></div><span>5–15 min</span></div>' : ''}
      </div>
    </div>`).join('');
}

async function createPaymentRequest(kind, amount, extra) {
  if (!state.profile) { showNotice('Please sign in first.', 'info'); return; }
  if (!(amount > 0)) { showNotice('Enter a valid amount.', 'info'); return; }
  const { error } = await db.from('payment_requests')
    .insert({ user_id: state.profile.id, kind, amount, ...extra });
  if (error) { showNotice(errorText(error), 'info'); return; }
  await Promise.all([loadProfile(), loadRequests()]);
  renderWallet();
  showNotice(kind === 'deposit' ? 'Deposit request created! Processing in 5–15 min ⏱' : 'Withdraw request created! ✅', 'win');
}

// ── AUTH / PROFILE ────────────────────────────────────────────────────
function renderAuthPanel() {
  const el = document.getElementById('authPanel');
  if (!el) return;
  const reg = state.authMode === 'register';
  const meta = metaSettings();
  const tgBot = meta.telegram_bot || '';

  el.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:14px;">${reg ? 'Create Account' : 'Welcome Back'}</h3>
    ${tgBot ? `
      <button class="tg-btn" id="tgLoginBtn">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.941z"/></svg>
        Login with Telegram
      </button>
      <div class="or-divider">— or —</div>` : ''}
    <form id="authForm" class="auth-form">
      <select id="authModeSelect" style="border-radius:12px;padding:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:#fff;">
        <option value="register" ${reg?'selected':''}>New account</option>
        <option value="login"    ${reg?'':'selected'}>Sign in</option>
      </select>
      <input id="authEmail"    type="email"    placeholder="Email"    autocomplete="email" required />
      <input id="authPassword" type="password" placeholder="Password (min 6 chars)" autocomplete="${reg?'new-password':'current-password'}" minlength="6" required />
      ${reg ? `
        <input id="authNickname"  placeholder="Nickname (displayed in game)" required />
        <input id="authFirstName" placeholder="First name" />
        <input id="authLastName"  placeholder="Last name" />
        <input id="authPromo"     placeholder="Promo code (optional)" style="text-transform:uppercase;" />
      ` : ''}
      <button type="submit">Continue →</button>
    </form>
    <p class="hint" style="margin-top:10px;">Your balance is stored securely in the casino database.</p>
  `;

  // Telegram login
  if (tgBot) {
    el.querySelector('#tgLoginBtn')?.addEventListener('click', () => initTelegramAuth(tgBot));
  }

  el.querySelector('#authModeSelect').addEventListener('change', ev => {
    state.authMode = ev.target.value; renderAuthPanel();
  });

  el.querySelector('#authForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const btn = ev.target.querySelector('button');
    btn.disabled = true;
    const email = el.querySelector('#authEmail').value.trim();
    const pass  = el.querySelector('#authPassword').value;
    if (reg) {
      const nick      = el.querySelector('#authNickname').value.trim();
      const firstName = el.querySelector('#authFirstName').value.trim();
      const lastName  = el.querySelector('#authLastName').value.trim();
      const promoRaw  = el.querySelector('#authPromo').value.trim().toUpperCase();

      const { data, error } = await db.auth.signUp({
        email, password: pass,
        options: { data: { nickname: nick, first_name: firstName, last_name: lastName } }
      });
      if (error) { showNotice(errorText(error), 'info'); btn.disabled = false; return; }

      if (!data.session) {
        showNotice('Account created! Check your email to confirm, then log in.', 'info');
      } else {
        showNotice('Welcome to Rocket Crown! 🎉', 'win');
        // Try promo code
        if (promoRaw) {
          const { data: pd, error: pe } = await db.rpc('use_promo_code', { p_code: promoRaw });
          if (pe) showNotice('Promo code: ' + errorText(pe), 'info');
          else showNotice(`Promo applied! +${pd.free_spins} free spins (+$${pd.bonus}) 🎁`, 'win');
        }
      }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password: pass });
      if (error) showNotice(errorText(error), 'info');
      else showNotice('Welcome back! 🚀', 'win');
    }
    btn.disabled = false;
  });
}

function initTelegramAuth(botName) {
  // Remove existing Telegram widget script if any
  const existing = document.getElementById('tg-widget-script');
  if (existing) existing.remove();

  // Define global callback
  window.onTelegramAuth = async function(user) {
    const email    = `tg_${user.id}@rocketcrown.game`;
    const password = `tgauth_${user.id}_${user.auth_date || 0}`;
    const nick     = user.username || user.first_name || `user${user.id}`;

    // Try sign in first
    const { error: signInErr } = await db.auth.signInWithPassword({ email, password });
    if (!signInErr) { showNotice('Welcome back via Telegram! 🚀', 'win'); return; }

    // Sign up
    const { data, error: signUpErr } = await db.auth.signUp({
      email, password,
      options: { data: { nickname: nick, first_name: user.first_name||'', last_name: user.last_name||'', telegram_id: user.id } }
    });
    if (signUpErr) { showNotice('Telegram auth failed: ' + errorText(signUpErr), 'info'); return; }
    if (data.session) showNotice('Welcome! Signed in via Telegram 🎉', 'win');
    else showNotice('Account created via Telegram! You can now sign in.', 'info');
  };

  const script = document.createElement('script');
  script.id  = 'tg-widget-script';
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.setAttribute('data-telegram-login', botName);
  script.setAttribute('data-size', 'large');
  script.setAttribute('data-onauth', 'onTelegramAuth(user)');
  script.setAttribute('data-request-access', 'write');
  script.setAttribute('data-userpic', 'false');
  document.body.appendChild(script);
  showNotice('Telegram login popup opening…', 'info');
}

function renderProfile() {
  const authPanel     = document.getElementById('authPanel');
  const profilePanel  = document.getElementById('profilePanel');
  const settingsPanel = document.getElementById('settingsPanel');
  if (!authPanel || !profilePanel || !settingsPanel) return;

  if (!state.profile) {
    renderAuthPanel();
    profilePanel.innerHTML = '<h3 style="font-family:Rajdhani,sans-serif;">Profile</h3><p class="hint" style="margin-top:8px;">Sign in to access your profile.</p>';
    settingsPanel.innerHTML = '';
    return;
  }

  const p = state.profile;

  // ── Auth panel (signed-in state)
  authPanel.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:14px;">👤 Signed In</h3>
    <p style="font-size:19px;font-weight:700;font-family:Rajdhani,sans-serif;">${escapeHtml(p.nickname)}</p>
    <p class="hint" style="margin-top:4px;">ID: ${escapeHtml(p.personal_id)}</p>
    ${p.banned ? '<p style="color:var(--red);margin-top:8px;font-weight:600;">⚠ Your account is banned.</p>' : ''}
    <button id="logoutBtn" class="secondary-btn" style="margin-top:14px;">Logout</button>
  `;
  authPanel.querySelector('#logoutBtn').addEventListener('click', () => db.auth.signOut());

  // ── Profile edit panel
  profilePanel.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:14px;">✏️ Edit Profile</h3>
    <form id="profileForm" class="profile-form">
      <div class="profile-grid">
        <label>Nickname<input name="nickname"   value="${escapeHtml(p.nickname)}"    required /></label>
        <label>Phone<input    name="phone"      value="${escapeHtml(p.phone||'')}"             /></label>
        <label>First name<input name="first_name" value="${escapeHtml(p.first_name||'')}"      /></label>
        <label>Last name<input  name="last_name"  value="${escapeHtml(p.last_name||'')}"       /></label>
        <label>Email<input value="${escapeHtml(p.email||p.personal_id)}" disabled /></label>
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
    showNotice('Profile saved! ✅', 'win');
  });

  // ── Promo code section
  const promoSection = document.createElement('div');
  promoSection.className = 'profile-card';
  promoSection.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:12px;">🎟️ Promo Code</h3>
    <form id="promoForm" class="profile-form">
      <input id="promoInput" placeholder="Enter promo code" style="text-transform:uppercase;" required />
      <button type="submit">Apply Code</button>
    </form>
    <div id="promoResult"></div>
  `;
  settingsPanel.innerHTML = '';
  settingsPanel.appendChild(promoSection);
  promoSection.querySelector('#promoForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const code = promoSection.querySelector('#promoInput').value.trim().toUpperCase();
    const { data, error } = await db.rpc('use_promo_code', { p_code: code });
    if (error) { showNotice(errorText(error), 'info'); return; }
    await loadProfile(); renderBalance();
    promoSection.querySelector('#promoResult').innerHTML = `
      <div class="promo-usage-info">
        ✅ Promo applied!<br>
        🎁 +${data.free_spins} free spins added to balance (+${formatMoney(data.bonus)})<br>
        📋 Wager requirement: ${formatMoney(data.wager_required)} to unlock withdrawal
      </div>`;
    showNotice(`Promo applied! +${data.free_spins} free spins 🎁`, 'win');
  });

  // Casino access card
  const accessCard = document.createElement('div');
  accessCard.className = 'profile-card';
  accessCard.innerHTML = `
    <h3 style="font-family:Rajdhani,sans-serif;margin-bottom:10px;">Casino Access</h3>
    <p class="hint">${p.is_admin ? '👑 You are the casino owner.' : 'Payments confirmed manually by the owner.'}</p>
    ${p.is_admin ? '<a class="secondary-btn" href="admin/" style="display:inline-block;margin-top:12px;">⚙️ Open Admin Panel</a>' : ''}
  `;
  settingsPanel.appendChild(accessCard);

  // Update menu
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
  renderWallet();
  renderProfile();
  renderMenu();
}

// ── Wallet tab bindings ───────────────────────────────────────────────
function bindWalletTabs() {
  document.querySelectorAll('.wallet-tab').forEach(btn => {
    btn.addEventListener('click', () => switchWalletTab(btn.dataset.wtab));
  });
}

// ── Navigation bindings ───────────────────────────────────────────────
function bindNavigation() {
  menuButton?.addEventListener('click', () => menuPanel.classList.toggle('open'));
  document.addEventListener('click', ev => {
    if (!menuPanel.contains(ev.target) && ev.target !== menuButton)
      menuPanel.classList.remove('open');
  });
  navButtons.forEach(btn => btn.addEventListener('click', () => showScreen(`${btn.dataset.screen}Screen`)));
  document.getElementById('claimBonusBtn')?.addEventListener('click', () => {
    showNotice('Bonus activated! Your next deposit gets a 100% boost. 🎁', 'win');
  });
  document.getElementById('menuLoginBtn')?.addEventListener('click', e => {
    e.preventDefault(); showScreen('profileScreen'); menuPanel.classList.remove('open');
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────
db.auth.onAuthStateChange(() => refreshAll());
bindNavigation();
bindWalletTabs();
bindBetsTabs();
showScreen('homeScreen');
loadAndRenderBets();

// Refresh bets every 15 seconds
setInterval(() => { if (state.betsLoaded) loadAndRenderBets(); }, 15000);
