const { db, formatMoney, errorText } = window.rocketCrown;

const GAMES = [
  { key: 'mines', name: 'Mines', art: 'assets/games/mines.png' },
  { key: 'crash', name: 'Crash', art: 'assets/games/crash.png' },
  { key: 'dice', name: 'Dice', art: 'assets/games/dice.png' },
  { key: 'roulette', name: 'Roulette', art: 'assets/games/roulette.png' },
  { key: 'coinflip', name: 'Coinflip', art: 'assets/games/coinflip.png' },
  { key: 'plinko', name: 'Plinko', art: 'assets/games/mines.png' }
];

const GAME_CHOICES = {
  mines: null,
  plinko: null,
  coinflip: { label: 'Pick side', options: [['heads', 'Heads'], ['tails', 'Tails']] },
  dice: { label: 'Bet on', options: [['high', 'High (4-6)'], ['low', 'Low (1-3)']] },
  roulette: { label: 'Color', options: [['red', 'Red'], ['black', 'Black'], ['green', 'Green']] },
  crash: { label: 'Multiplier target', options: [['1.5', '1.5x'], ['2.0', '2.0x'], ['3.0', '3.0x']] }
};

const PROMOS = [
  { title: 'Welcome Boost', value: '100% bonus', text: 'Boost your first deposit instantly.' },
  { title: 'VIP Reload', value: '50% free', text: 'Use on every Friday reload.' }
];

const menuButton = document.getElementById('menuButton');
const menuPanel = document.getElementById('menuPanel');
const navButtons = document.querySelectorAll('.nav-btn');
const screens = document.querySelectorAll('.screen');
const gameModal = document.getElementById('gameModal');

const state = {
  profile: null,
  requests: [],
  liveWins: [],
  settings: { deposits_enabled: true, games: {} },
  authMode: 'register'
};

let profileChannel = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function gameEnabled(key) {
  return state.settings.games?.[key] !== false;
}

function showScreen(screenId) {
  screens.forEach((screen) => screen.classList.toggle('active', screen.id === screenId));
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.screen === screenId.replace('Screen', '').toLowerCase());
  });
}

function toastStack() {
  let stack = document.getElementById('toastStack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function showNotice(message) {
  const notice = document.createElement('div');
  notice.className = 'toast';
  notice.textContent = message;
  toastStack().appendChild(notice);
  setTimeout(() => notice.remove(), 3200);
}

function openModal(content) {
  gameModal.innerHTML = content;
  gameModal.hidden = false;
}

function closeModal() {
  gameModal.innerHTML = '';
  gameModal.hidden = true;
}

// ------------------------------------------------------------------ loading

async function loadSettings() {
  const { data } = await db.from('casino_settings').select('deposits_enabled, games').maybeSingle();
  if (data) state.settings = data;
}

async function loadProfile() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    state.profile = null;
    return;
  }
  const { data, error } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) showNotice(errorText(error));
  state.profile = data || null;
}

async function loadRequests() {
  if (!state.profile) {
    state.requests = [];
    return;
  }
  const { data } = await db
    .from('payment_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  state.requests = data || [];
}

async function loadLiveWins() {
  const { data } = await db.from('live_wins').select('*').limit(8);
  state.liveWins = data || [];
}

// The owner can change a balance or approve a payout from their own device, so
// keep this tab in sync instead of waiting for a reload.
function watchProfile() {
  if (profileChannel) db.removeChannel(profileChannel);
  if (!state.profile) return;
  profileChannel = db
    .channel('profile-sync')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${state.profile.id}`
    }, (payload) => {
      state.profile = payload.new;
      renderBalance();
      renderProfile();
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'payment_requests', filter: `user_id=eq.${state.profile.id}`
    }, async () => {
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

// ------------------------------------------------------------------ betting

async function playGame(gameKey, payload) {
  const { data, error } = await db.rpc('place_bet', {
    p_game: gameKey,
    p_amount: Number(payload.amount),
    p_choice: payload.choice ?? null
  });
  if (error) {
    showNotice(errorText(error));
    return;
  }
  state.profile.balance = data.balance;
  await loadLiveWins();
  render();
  closeModal();
  showNotice(`${data.message} Balance ${formatMoney(data.balance)}`);
}

function gameFormMarkup(gameKey) {
  const choice = GAME_CHOICES[gameKey];
  const options = choice
    ? `<label>${choice.label}
        <select name="choice">
          ${choice.options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
        </select>
      </label>`
    : '';
  return `
    <form id="gameForm" class="game-form">
      <label>Stake
        <input type="number" name="amount" min="1" step="1" placeholder="Amount" required />
      </label>
      ${options}
      <button type="submit">Play</button>
    </form>
  `;
}

function openGameModalByKey(gameKey) {
  if (!state.profile) {
    showNotice('Please register or login first.');
    showScreen('profileScreen');
    return;
  }
  if (!gameEnabled(gameKey)) {
    showNotice('This game is unavailable right now.');
    return;
  }
  const game = GAMES.find((item) => item.key === gameKey);
  openModal(`
    <div class="modal-card">
      <button class="modal-close" id="closeModalBtn">×</button>
      <h3>${game.name}</h3>
      <p class="modal-subtitle">Rounds are resolved on the server.</p>
      ${gameFormMarkup(gameKey)}
    </div>
  `);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('gameForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    const payload = Object.fromEntries(new FormData(event.target).entries());
    await playGame(gameKey, payload);
    submit.disabled = false;
  });
}

// ----------------------------------------------------------------- rendering

function gameCards(container, template) {
  if (!container) return;
  container.innerHTML = GAMES.map((game) => template(game, !gameEnabled(game.key))).join('');
  container.querySelectorAll('[data-game]').forEach((node) => {
    node.addEventListener('click', () => openGameModalByKey(node.dataset.game));
  });
}

function renderGames() {
  gameCards(document.getElementById('gamesCarousel'), (game, disabled) => `
    <button class="game-card ${disabled ? 'disabled' : ''}" data-game="${game.key}">
      <img src="${game.art}" alt="${game.name}" />
      <span class="game-title">${game.name}</span>
      <small>${disabled ? 'Maintenance' : 'Play now'}</small>
    </button>
  `);
}

function renderCasino() {
  gameCards(document.getElementById('casinoGrid'), (game, disabled) => `
    <div class="casino-card ${disabled ? 'disabled' : ''}" data-game="${game.key}">
      <img src="${game.art}" alt="${game.name}" />
      <div class="casino-card__meta">
        <strong>${game.name}</strong>
        <span>${disabled ? 'Soon / Technical works' : 'Live now'}</span>
      </div>
    </div>
  `);
}

function renderPromoList() {
  const container = document.getElementById('promoList');
  if (!container) return;
  container.innerHTML = PROMOS.map((promo) => `
    <div class="promo-card">
      <strong>${promo.title}</strong>
      <p>${promo.value}</p>
      <span>${promo.text}</span>
    </div>
  `).join('');
}

function renderLiveWins() {
  const container = document.getElementById('liveWinsList');
  if (!container) return;
  if (!state.liveWins.length) {
    container.innerHTML = '<li>No wins yet. Be the first.</li>';
    return;
  }
  container.innerHTML = state.liveWins.map((win) => `
    <li><strong>${escapeHtml(win.player)}</strong> won ${formatMoney(win.amount)} in ${escapeHtml(win.game)}</li>
  `).join('');
}

function renderBalance() {
  const balance = document.getElementById('balanceLabel');
  if (balance) balance.textContent = formatMoney(state.profile?.balance || 0);
  const walletBalance = document.getElementById('walletBalance');
  if (walletBalance) walletBalance.textContent = formatMoney(state.profile?.balance || 0);
}

function renderWallet() {
  renderBalance();
  const container = document.getElementById('walletRequests');
  if (!container) return;
  if (!state.requests.length) {
    container.innerHTML = '<p>No requests yet.</p>';
    return;
  }
  const labels = { pending: 'In processing', approved: 'Completed', rejected: 'Rejected' };
  container.innerHTML = state.requests.map((request) => `
    <div class="request-item">
      <div><strong>${request.kind === 'deposit' ? 'Deposit' : 'Withdraw'}</strong>
        • ${formatMoney(request.amount)} • ${escapeHtml(request.method || request.address || 'manual')}</div>
      <div>${labels[request.status] || request.status}</div>
    </div>
  `).join('');
}

function renderHome() {
  const statGames = document.getElementById('statGames');
  const statDeposits = document.getElementById('statDeposits');
  if (statGames) statGames.textContent = `Games online: ${GAMES.filter((game) => gameEnabled(game.key)).length}`;
  if (statDeposits) {
    statDeposits.textContent = state.settings.deposits_enabled ? 'Deposits enabled' : 'Deposits disabled';
  }
  const statUsers = document.getElementById('statUsers');
  if (statUsers) statUsers.textContent = state.profile ? `Signed in as ${state.profile.nickname}` : 'Sign in to play';
}

function renderAuthPanel() {
  const authPanel = document.getElementById('authPanel');
  const register = state.authMode === 'register';
  authPanel.innerHTML = `
    <h3>${register ? 'Register' : 'Login'}</h3>
    <form id="authForm" class="auth-form">
      <select id="authMode">
        <option value="register" ${register ? 'selected' : ''}>Register</option>
        <option value="login" ${register ? '' : 'selected'}>Login</option>
      </select>
      <input id="authEmail" type="email" placeholder="Email" autocomplete="email" required />
      <input id="authPassword" type="password" placeholder="Password (min 6 characters)"
        autocomplete="${register ? 'new-password' : 'current-password'}" minlength="6" required />
      ${register ? '<input id="authNickname" placeholder="Nickname" required />' : ''}
      <button type="submit">Continue</button>
    </form>
    <p class="hint">Your balance lives on the casino server, so it follows you to any device.</p>
  `;

  document.getElementById('authMode').addEventListener('change', (event) => {
    state.authMode = event.target.value;
    renderAuthPanel();
  });

  document.getElementById('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.target.querySelector('button[type="submit"]');
    submit.disabled = true;
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    if (register) {
      const nickname = document.getElementById('authNickname').value.trim();
      const { data, error } = await db.auth.signUp({
        email, password, options: { data: { nickname } }
      });
      if (error) showNotice(errorText(error));
      else if (!data.session) showNotice('Account created. Confirm your email, then log in.');
      else showNotice('Welcome to Rocket Crown!');
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) showNotice(errorText(error));
      else showNotice('Welcome back.');
    }
    submit.disabled = false;
  });
}

function renderProfile() {
  const authPanel = document.getElementById('authPanel');
  const profilePanel = document.getElementById('profilePanel');
  const settingsPanel = document.getElementById('settingsPanel');
  if (!authPanel || !profilePanel || !settingsPanel) return;

  if (!state.profile) {
    renderAuthPanel();
    profilePanel.innerHTML = '<h3>Profile</h3><p>Please sign in to access your personal profile.</p>';
    settingsPanel.innerHTML = '';
    return;
  }

  const profile = state.profile;
  authPanel.innerHTML = `
    <h3>Signed in</h3>
    <p>${escapeHtml(profile.nickname)}</p>
    <p>Personal ID: ${escapeHtml(profile.personal_id)}</p>
    ${profile.banned ? '<p><strong>Your account is banned.</strong></p>' : ''}
    <button id="logoutBtn" class="secondary-btn">Logout</button>
  `;
  document.getElementById('logoutBtn').addEventListener('click', () => db.auth.signOut());

  profilePanel.innerHTML = `
    <h3>Profile</h3>
    <form id="profileForm" class="profile-form">
      <div class="profile-grid">
        <label>Nickname<input name="nickname" value="${escapeHtml(profile.nickname)}" required /></label>
        <label>Phone<input name="phone" value="${escapeHtml(profile.phone || '')}" /></label>
        <label>Email<input value="${escapeHtml(profile.email || '')}" disabled /></label>
        <label>Personal ID<input value="${escapeHtml(profile.personal_id)}" disabled /></label>
      </div>
      <button type="submit">Save profile</button>
    </form>
  `;
  document.getElementById('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const updates = Object.fromEntries(new FormData(event.target).entries());
    const { error } = await db.from('profiles').update(updates).eq('id', profile.id);
    if (error) {
      showNotice(errorText(error));
      return;
    }
    await loadProfile();
    render();
    showNotice('Profile updated.');
  });

  settingsPanel.innerHTML = `
    <h3>Owner</h3>
    <p class="hint">${profile.is_admin
      ? 'You are the casino owner.'
      : 'Payment requests are confirmed manually by the casino owner.'}</p>
    ${profile.is_admin ? '<a class="secondary-btn" href="admin/">Open admin panel</a>' : ''}
  `;
}

function render() {
  renderHome();
  renderGames();
  renderCasino();
  renderPromoList();
  renderLiveWins();
  renderWallet();
  renderProfile();
}

// ------------------------------------------------------------------ binding

function bindNavigation() {
  if (menuButton && menuPanel) {
    menuButton.addEventListener('click', () => menuPanel.classList.toggle('open'));
    document.addEventListener('click', (event) => {
      if (!menuPanel.contains(event.target) && event.target !== menuButton) {
        menuPanel.classList.remove('open');
      }
    });
  }

  document.getElementById('menuLogout')?.addEventListener('click', (event) => {
    event.preventDefault();
    db.auth.signOut();
  });

  navButtons.forEach((button) => {
    button.addEventListener('click', () => showScreen(`${button.dataset.screen}Screen`));
  });

  document.getElementById('claimBonusBtn')?.addEventListener('click', () => {
    showNotice('Bonus activated. Your next deposit gets a 100% boost.');
  });
}

async function createRequest(kind, amount, extra) {
  if (!state.profile) {
    showNotice('Login first.');
    return false;
  }
  if (!(amount > 0)) {
    showNotice('Enter a valid amount.');
    return false;
  }
  const { error } = await db.from('payment_requests').insert({
    user_id: state.profile.id, kind, amount, ...extra
  });
  if (error) {
    showNotice(errorText(error));
    return false;
  }
  await Promise.all([loadProfile(), loadRequests()]);
  renderWallet();
  return true;
}

function bindWalletForms() {
  document.getElementById('depositForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.settings.deposits_enabled) {
      showNotice('Deposits are disabled for now.');
      return;
    }
    const amount = Number(document.getElementById('depositAmount').value);
    const method = document.getElementById('depositMethod').value;
    if (await createRequest('deposit', amount, { method })) {
      showNotice('Deposit request created. The owner will confirm it manually.');
    }
  });

  document.getElementById('withdrawForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const amount = Number(document.getElementById('withdrawAmount').value);
    const address = document.getElementById('withdrawAddress').value.trim();
    if (await createRequest('withdraw', amount, { address })) {
      showNotice('Withdraw request created. Funds are on hold until it is paid out.');
    }
  });
}

// Fires once on load with the restored session, and again on login/logout.
db.auth.onAuthStateChange(() => refreshAll());

bindNavigation();
bindWalletForms();
showScreen('homeScreen');
setInterval(async () => {
  await loadLiveWins();
  renderLiveWins();
}, 15000);
