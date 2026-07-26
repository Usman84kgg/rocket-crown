const STORAGE_KEY = 'rocket-crown-state-v1';
const menuButton = RCUtil.byId('menuButton');
const menuPanel = RCUtil.byId('menuPanel');
const navButtons = document.querySelectorAll('.nav-btn');
const screens = document.querySelectorAll('.screen');
const gameModal = RCUtil.byId('gameModal');

const defaultState = {
  user: null,
  users: [],
  theme: 'dark',
  sound: true,
  depositsEnabled: true,
  games: Object.fromEntries(GAME_CATALOG.map((game) => [game.key, true])),
  promos: [
    { id: 1, title: 'Welcome Boost', value: '100% bonus', text: 'Boost your first deposit instantly.' },
    { id: 2, title: 'VIP Reload', value: '50% free', text: 'Use on every Friday reload.' }
  ],
  liveWins: [
    { player: 'Ari', game: 'Crash', amount: 286, time: 'just now' },
    { player: 'Mina', game: 'Roulette', amount: 194, time: '1 min ago' },
    { player: 'Dima', game: 'Dice', amount: 312, time: '2 min ago' }
  ],
  requests: [],
  pendingAuth: null,
  adminPassword: 'admin2026'
};

let state = loadState();
let currentGame = null;

function loadState() {
  const saved = RCUtil.readJSON(STORAGE_KEY);
  return {
    ...defaultState,
    ...saved,
    games: { ...defaultState.games, ...(saved?.games || {}) },
    promos: saved?.promos || defaultState.promos,
    liveWins: saved?.liveWins || defaultState.liveWins,
    requests: saved?.requests || defaultState.requests,
    users: saved?.users || []
  };
}

function saveState() {
  RCUtil.writeJSON(STORAGE_KEY, state);
}

function syncCurrentUser() {
  const existing = state.users.find((candidate) => candidate.id === state.user?.id);
  if (existing) Object.assign(existing, state.user);
}

function showScreen(screenId) {
  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.id === screenId);
  });
  navButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.screen === screenId.replace('Screen', '').toLowerCase());
  });
}

function applyTheme() {
  document.body.dataset.theme = state.theme;
  document.documentElement.style.setProperty('--bg', state.theme === 'dark' ? '#050816' : '#160d03');
}

function getUserStats(user) {
  return user?.stats || { wins: 0, losses: 0, totalBet: 0 };
}

function updateUserBalance(amount) {
  if (!state.user) return;
  state.user.balance = Number(state.user.balance || 0) + Number(amount);
  syncCurrentUser();
  saveState();
}

function loginUser(user) {
  state.user = user;
  state.pendingAuth = null;
  saveState();
  render();
}

function logoutUser() {
  state.user = null;
  saveState();
  render();
}

function addLiveWin(game, amount, player = 'Player') {
  pushLiveWin({ player, game, amount, time: 'just now' });
  renderLiveWins();
}

function pushLiveWin(win) {
  state.liveWins.unshift(win);
  state.liveWins = state.liveWins.slice(0, 8);
  saveState();
}

function blockReason(gameName) {
  if (!state.user) return 'Please register or login first.';
  if (state.user.banned) return 'Your account is banned.';
  if (!state.games[gameName]) return 'This game is under maintenance.';
  if (!state.depositsEnabled) return 'Deposits are temporarily disabled.';
  return null;
}

function playGame(gameName, payload) {
  const blocked = blockReason(gameName);
  if (blocked) {
    RCUtil.showToast(blocked);
    return;
  }
  const amount = Number(payload.amount || 0);
  if (amount <= 0 || amount > (state.user.balance || 0)) {
    RCUtil.showToast('Insufficient balance or invalid stake.');
    return;
  }

  const game = GAMES_BY_KEY[gameName];
  const result = game ? game.resolve(amount, payload.choice) : { won: false, payout: 0, message: '' };
  const stats = getUserStats(state.user);

  const net = result.won ? amount + result.payout : -amount;
  state.user.balance = Number(state.user.balance) + net;
  stats.wins += result.won ? 1 : 0;
  stats.losses += result.won ? 0 : 1;
  stats.totalBet += amount;
  state.user.stats = stats;
  syncCurrentUser();

  if (result.won) {
    addLiveWin(gameName.toUpperCase(), result.payout + amount, state.user.nickname || state.user.name || 'Player');
  }
  saveState();
  RCUtil.showToast(result.message + ` Balance ${RCUtil.formatMoney(state.user.balance)}`);
  render();
  closeModal();
}

function openModal(content) {
  gameModal.innerHTML = content;
  gameModal.hidden = false;
}

function closeModal() {
  gameModal.innerHTML = '';
  gameModal.hidden = true;
}

function renderGameList(containerId, cardMarkup) {
  const container = RCUtil.renderList(containerId, GAME_CATALOG, (game) => cardMarkup(game, !state.games[game.key]));
  RCUtil.bindEach(container, '[data-game]', 'click', (element) => openGameModalByKey(element.dataset.game));
}

function renderGames() {
  renderGameList('gamesCarousel', (game, disabled) => `
      <button class="game-card ${disabled ? 'disabled' : ''}" data-game="${game.key}">
        <img src="${game.art}" alt="${game.name}" />
        <span class="game-title">${game.name}</span>
        <small>${disabled ? 'Maintenance' : 'Play now'}</small>
      </button>
    `);
}

function renderCasino() {
  renderGameList('casinoGrid', (game, disabled) => `
      <div class="casino-card ${disabled ? 'disabled' : ''}" data-game="${game.key}">
        <img src="${game.art}" alt="${game.name}" />
        <div class="casino-card__meta">
          <strong>${game.name}</strong>
          <span>${disabled ? 'Soon / Technical works' : 'Live now'}</span>
        </div>
      </div>
    `);
}

function openGameModalByKey(gameKey) {
  if (!state.games[gameKey]) {
    RCUtil.showToast('This game is unavailable right now.');
    return;
  }
  currentGame = gameKey;
  openModal(`
    <div class="modal-card">
      <button class="modal-close" id="closeModalBtn">×</button>
      <h3>${GAMES_BY_KEY[gameKey].name}</h3>
      <p class="modal-subtitle">Provably fair random rounds.</p>
      ${gameFormMarkup(gameKey)}
    </div>
  `);
  RCUtil.on('closeModalBtn', 'click', closeModal);
  RCUtil.onSubmit('gameForm', () => playGame(gameKey, RCUtil.formValues('gameForm')));
}

function renderPromoList() {
  RCUtil.renderList('promoList', state.promos, (promo) => `
    <div class="promo-card">
      <strong>${promo.title}</strong>
      <p>${promo.value}</p>
      <span>${promo.text}</span>
    </div>
  `);
}

function renderLiveWins() {
  RCUtil.renderList('liveWinsList', state.liveWins, (item) => `
    <li><strong>${item.player}</strong> won ${RCUtil.formatMoney(item.amount)} in ${item.game} • ${item.time}</li>
  `);
}

function renderWallet() {
  RCUtil.setText('walletBalance', RCUtil.formatMoney(state.user?.balance || 0));
  RCUtil.renderList('walletRequests', state.requests, (req) => `
    <div class="request-item">
      <div><strong>${req.type}</strong> • ${RCUtil.formatMoney(req.amount)} • ${req.method || req.address || 'manual'}</div>
      <div>${req.status}</div>
    </div>
  `, '<p>No pending requests yet.</p>');
}

function renderProfile() {
  const authPanel = RCUtil.byId('authPanel');
  const profilePanel = RCUtil.byId('profilePanel');
  const settingsPanel = RCUtil.byId('settingsPanel');
  if (!authPanel || !profilePanel || !settingsPanel) return;

  if (!state.user) {
    renderAuthForm();
    return;
  }

  RCUtil.renderInto('authPanel', `
    <h3>Signed in</h3>
    <p>${state.user.nickname || state.user.name || state.user.identifier}</p>
    <p>Personal ID: ${state.user.personalId}</p>
    <button id="logoutBtn" class="secondary-btn">Logout</button>
  `);
  RCUtil.on('logoutBtn', 'click', logoutUser);

  RCUtil.renderInto('profilePanel', `
    <h3>Profile</h3>
    <form id="profileForm" class="profile-form">
      <div class="profile-grid">
        <label>First name<input name="name" value="${state.user.name || ''}" /></label>
        <label>Last name<input name="surname" value="${state.user.surname || ''}" /></label>
        <label>Nickname<input name="nickname" value="${state.user.nickname || ''}" /></label>
        <label>Phone<input name="phone" value="${state.user.phone || ''}" /></label>
        <label>Email<input name="email" value="${state.user.email || ''}" /></label>
        <label>Gender<input name="gender" value="${state.user.gender || ''}" /></label>
        <label>Date of birth<input name="birthDate" type="date" value="${state.user.birthDate || ''}" /></label>
        <label>Personal ID<input name="personalId" value="${state.user.personalId || ''}" disabled /></label>
      </div>
      <label>Avatar URL<input id="avatarInput" type="url" value="${state.user.avatar || ''}" /></label>
      <button type="submit">Save profile</button>
    </form>
  `);
  RCUtil.onSubmit('profileForm', () => {
    const updates = RCUtil.formValues('profileForm');
    state.user = { ...state.user, ...updates, avatar: RCUtil.byId('avatarInput').value || state.user.avatar };
    syncCurrentUser();
    saveState();
    render();
    RCUtil.showToast('Profile updated.');
  });

  RCUtil.renderInto('settingsPanel', `
    <h3>Settings</h3>
    <div class="toggle-row">
      <span>Sound</span>
      <label class="switch"><input id="soundToggle" type="checkbox" ${state.sound ? 'checked' : ''} /><span></span></label>
    </div>
    <div class="toggle-row">
      <span>Dark theme</span>
      <label class="switch"><input id="themeToggle" type="checkbox" ${state.theme === 'dark' ? 'checked' : ''} /><span></span></label>
    </div>
    <button id="logoutSettingsBtn" class="secondary-btn">Logout</button>
  `);
  RCUtil.on('soundToggle', 'change', (event) => {
    state.sound = event.target.checked;
    saveState();
  });
  RCUtil.on('themeToggle', 'change', (event) => {
    state.theme = event.target.checked ? 'dark' : 'light';
    applyTheme();
    saveState();
  });
  RCUtil.on('logoutSettingsBtn', 'click', logoutUser);
}

function renderAuthForm() {
  RCUtil.renderInto('authPanel', `
    <h3>Register / Login</h3>
    <form id="authForm" class="auth-form">
      <select id="authMode">
        <option value="register">Register</option>
        <option value="login">Login</option>
      </select>
      <input id="authIdentifier" placeholder="Email / Telegram / Phone" required />
      <input id="authPassword" type="password" placeholder="Password" required />
      <input id="authName" placeholder="First name" />
      <input id="authSurname" placeholder="Last name" />
      <input id="authNickname" placeholder="Nickname" />
      <input id="authCode" placeholder="Verification code" style="display:none;" />
      <button type="submit">Continue</button>
    </form>
    <p class="hint">Registration uses email / telegram / phone and one-time code.</p>
  `);
  RCUtil.renderInto('profilePanel', '<div class="info-card"><h3>Profile</h3><p>Please sign in to access your personal profile.</p></div>');
  RCUtil.renderInto('settingsPanel', '<div class="info-card"><h3>Settings</h3><p>Sound and theme will appear once you enter the casino.</p></div>');

  RCUtil.onSubmit('authForm', () => {
    const fields = {
      mode: RCUtil.byId('authMode').value,
      identifier: RCUtil.byId('authIdentifier').value.trim(),
      password: RCUtil.byId('authPassword').value,
      name: RCUtil.byId('authName').value.trim(),
      surname: RCUtil.byId('authSurname').value.trim(),
      nickname: RCUtil.byId('authNickname').value.trim(),
      code: RCUtil.byId('authCode').value.trim()
    };

    if (fields.mode === 'register') {
      handleRegister(fields);
      return;
    }

    const user = state.users.find(
      (candidate) => candidate.identifier === fields.identifier && candidate.password === fields.password
    );
    if (user) {
      loginUser(user);
      RCUtil.showToast('Welcome back.');
    } else {
      RCUtil.showToast('No matching account found.');
    }
  });
}

function handleRegister({ identifier, password, name, surname, nickname, code }) {
  if (state.pendingAuth) {
    if (code !== String(state.pendingAuth.code)) {
      RCUtil.showToast('Wrong verification code.');
      return;
    }
    if (state.users.find((candidate) => candidate.identifier === identifier)) {
      RCUtil.showToast('This account already exists. Please login.');
      return;
    }
    const user = createUser({ identifier, password, name, surname, nickname });
    state.users.push(user);
    state.user = user;
    state.pendingAuth = null;
    saveState();
    render();
    RCUtil.showToast('Registration complete. Welcome to Rocket Crown!');
    return;
  }

  state.pendingAuth = {
    identifier,
    name,
    surname,
    nickname,
    password,
    code: Math.floor(1000 + Math.random() * 9000)
  };
  saveState();
  RCUtil.byId('authCode').style.display = 'block';
  RCUtil.showToast(`Verification code sent: ${state.pendingAuth.code}`);
}

function createUser({ identifier, password, name, surname, nickname }) {
  const user = {
    id: RCUtil.createId('USR'),
    identifier,
    password,
    name,
    surname,
    nickname: nickname || `${name || 'player'}${Math.floor(Math.random() * 90 + 10)}`,
    balance: 2500,
    phone: '',
    email: '',
    gender: '',
    birthDate: '',
    personalId: RCUtil.createId('ID'),
    avatar: '',
    banned: false,
    stats: { wins: 0, losses: 0, totalBet: 0 },
    role: 'player'
  };
  if (identifier.includes('@')) user.email = identifier;
  else if (identifier.startsWith('+')) user.phone = identifier;
  else user.email = `${identifier}@telegram.local`;
  return user;
}

function renderHome() {
  RCUtil.setText('statGames', `Games online: ${Object.values(state.games).filter(Boolean).length}`);
  RCUtil.setText('statUsers', `Active users: ${state.users.length + (state.user ? 1 : 0)}`);
  RCUtil.setText('statDeposits', state.depositsEnabled ? 'Deposits enabled' : 'Deposits disabled');
  RCUtil.on('claimBonusBtn', 'click', () => RCUtil.showToast('Bonus activated. Your next deposit gets a 100% boost.'));
}

function render() {
  applyTheme();
  renderHome();
  renderGames();
  renderCasino();
  renderPromoList();
  renderLiveWins();
  renderWallet();
  renderProfile();
  RCUtil.setText('balanceLabel', RCUtil.formatMoney(state.user?.balance || 0));
}

function bindNavigation() {
  if (menuButton && menuPanel) {
    menuButton.addEventListener('click', () => menuPanel.classList.toggle('open'));
    document.addEventListener('click', (event) => {
      if (!menuPanel.contains(event.target) && event.target !== menuButton) {
        menuPanel.classList.remove('open');
      }
    });
  }

  RCUtil.on('menuLogout', 'click', (event) => {
    event.preventDefault();
    logoutUser();
  });

  navButtons.forEach((button) => {
    button.addEventListener('click', () => showScreen(`${button.dataset.screen}Screen`));
  });
}

function submitRequest({ type, prefix, amount, details }) {
  state.requests.unshift({
    id: RCUtil.createId(prefix),
    type,
    amount,
    ...details,
    status: 'Pending • 5-15 min',
    createdAt: Date.now()
  });
  saveState();
  renderWallet();
  RCUtil.showToast(`${type} request created. Processing in 5-15 minutes.`);
}

function bindWalletForms() {
  RCUtil.onSubmit('depositForm', () => {
    if (!state.user) {
      RCUtil.showToast('Login first to request a deposit.');
      return;
    }
    if (!state.depositsEnabled) {
      RCUtil.showToast('Deposits are disabled for now.');
      return;
    }
    submitRequest({
      type: 'Deposit',
      prefix: 'DEP',
      amount: Number(RCUtil.byId('depositAmount').value),
      details: { method: RCUtil.byId('depositMethod').value }
    });
  });

  RCUtil.onSubmit('withdrawForm', () => {
    if (!state.user) {
      RCUtil.showToast('Login first to request a withdrawal.');
      return;
    }
    const amount = Number(RCUtil.byId('withdrawAmount').value);
    if (amount > (state.user.balance || 0)) {
      RCUtil.showToast('Insufficient balance.');
      return;
    }
    submitRequest({
      type: 'Withdraw',
      prefix: 'WD',
      amount,
      details: { address: RCUtil.byId('withdrawAddress').value.trim() }
    });
  });
}

function initLiveWinsLoop() {
  setInterval(() => {
    if (!state.liveWins.length) return;
    const sampleGames = ['Crash', 'Roulette', 'Dice', 'Mines'];
    const samplePlayers = ['Nico', 'Rex', 'Lana', 'Toni', 'Jules'];
    const randomIndex = Math.floor(Math.random() * sampleGames.length);
    pushLiveWin({
      player: samplePlayers[randomIndex],
      game: sampleGames[randomIndex],
      amount: 100 + RCUtil.randomInt(1, 400),
      time: 'just now'
    });
    renderLiveWins();
  }, 6000);
}

bindNavigation();
bindWalletForms();
applyTheme();
render();
initLiveWinsLoop();
showScreen('homeScreen');
