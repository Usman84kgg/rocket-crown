const STORAGE_KEY = 'rocket-crown-state-v1';
const menuButton = document.getElementById('menuButton');
const menuPanel = document.getElementById('menuPanel');
const navButtons = document.querySelectorAll('.nav-btn');
const screens = document.querySelectorAll('.screen');
const gameModal = document.getElementById('gameModal');

const defaultState = {
  user: null,
  users: [],
  theme: 'dark',
  sound: true,
  depositsEnabled: true,
  games: { mines: true, crash: true, dice: true, roulette: true, coinflip: true, plinko: true },
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
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    console.error('Stored state is corrupted and was discarded', error);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (removeError) {
      console.error('Unable to clear corrupted state', removeError);
    }
    return { ...defaultState };
  }
  if (saved && typeof saved !== 'object') {
    console.error('Stored state has an unexpected shape and was discarded');
    return { ...defaultState };
  }
  return { ...defaultState, ...saved, games: { ...defaultState.games, ...(saved?.games || {}) }, promos: saved?.promos || defaultState.promos, liveWins: saved?.liveWins || defaultState.liveWins, requests: saved?.requests || defaultState.requests, users: saved?.users || [] };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.error('Saving state failed', error);
    showNotice('Could not save your progress on this device. Changes may be lost.');
    return false;
  }
}

function requireElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
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

function formatMoney(value) {
  return `$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getUserStats(user) {
  return user?.stats || { wins: 0, losses: 0, totalBet: 0 };
}

function updateUserBalance(amount) {
  if (!state.user) return;
  state.user.balance = Number(state.user.balance || 0) + Number(amount);
  const existing = state.users.find((u) => u.id === state.user.id);
  if (existing) {
    existing.balance = state.user.balance;
    Object.assign(existing, state.user);
  }
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

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createRequest(prefix, type, amount, extra) {
  return {
    id: createId(prefix),
    type,
    amount,
    status: 'Pending',
    userId: state.user?.id || null,
    userLabel: state.user?.nickname || state.user?.identifier || 'Player',
    createdAt: Date.now(),
    ...extra
  };
}

function addLiveWin(game, amount, player = 'Player') {
  state.liveWins.unshift({ player, game, amount, time: 'just now' });
  state.liveWins = state.liveWins.slice(0, 8);
  saveState();
  renderLiveWins();
}

function randomInt(min, max) {
  if (!window.crypto?.getRandomValues) {
    throw new Error('Secure randomness is unavailable in this browser context.');
  }
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return min + (array[0] % (max - min + 1));
}

function playGame(gameName, payload) {
  if (!state.user) {
    showNotice('Please register or login first.');
    return;
  }
  if (state.user.banned) {
    showNotice('Your account is banned.');
    return;
  }
  if (!state.games[gameName]) {
    showNotice('This game is under maintenance.');
    return;
  }
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > (state.user.balance || 0)) {
    showNotice('Insufficient balance or invalid stake.');
    return;
  }

  let result;
  try {
    result = resolveRound(gameName, payload, amount);
  } catch (error) {
    console.error(`Round for ${gameName} failed`, error);
    showNotice('Round could not be played. Your balance was not changed.');
    return;
  }

  const stats = getUserStats(state.user);
  const net = result.won ? result.payout - amount : -amount;
  state.user.balance = Number(state.user.balance) + net;
  stats.wins += result.won ? 1 : 0;
  stats.losses += result.won ? 0 : 1;
  stats.totalBet += amount;
  state.user.stats = stats;

  const existingUser = state.users.find((u) => u.id === state.user.id);
  if (existingUser) {
    Object.assign(existingUser, state.user);
  }

  if (result.won) {
    addLiveWin(gameName.toUpperCase(), result.payout, state.user.nickname || state.user.name || 'Player');
  }
  saveState();
  showNotice(result.message + ` Balance ${formatMoney(state.user.balance)}`);
  render();
  closeModal();
}

function resolveRound(gameName, payload, amount) {
  const result = { won: false, payout: 0, message: '' };

  switch (gameName) {
    case 'mines': {
      const correct = randomInt(0, 1) === 1;
      result.won = correct;
      result.payout = correct ? amount * 1.9 : 0;
      result.message = correct ? 'Safe step. You won.' : 'Mine exploded. You lost.';
      break;
    }
    case 'coinflip': {
      const choice = payload.choice;
      const flip = randomInt(0, 1) === 0 ? 'heads' : 'tails';
      result.won = flip === choice;
      result.payout = result.won ? amount * 1.95 : 0;
      result.message = result.won ? `Coin landed ${flip}. You won.` : `Coin landed ${flip}. You lost.`;
      break;
    }
    case 'dice': {
      const roll = randomInt(1, 6);
      const target = payload.choice === 'high' ? roll >= 4 : roll <= 3;
      result.won = target;
      result.payout = result.won ? amount * 1.85 : 0;
      result.message = `Dice rolled ${roll}. ${result.won ? 'You won.' : 'You lost.'}`;
      break;
    }
    case 'roulette': {
      const colors = ['red', 'black', 'green'];
      const pick = colors[randomInt(0, 2)];
      const win = payload.choice === pick;
      result.won = win;
      result.payout = win ? (payload.choice === 'green' ? amount * 8 : amount * 1.9) : 0;
      result.message = `Roulette landed on ${pick}. ${win ? 'You won.' : 'You lost.'}`;
      break;
    }
    case 'crash': {
      const multiplier = (1 + randomInt(1, 30) / 10).toFixed(1);
      result.won = Number(multiplier) >= Number(payload.choice);
      result.payout = result.won ? amount * Number(multiplier) : 0;
      result.message = `Crash multiplier ${multiplier}x. ${result.won ? 'You won.' : 'You lost.'}`;
      break;
    }
    case 'plinko': {
      const drop = randomInt(0, 1) === 0;
      result.won = drop;
      result.payout = result.won ? amount * 2 : 0;
      result.message = result.won ? 'Plinko dropped into a win pocket.' : 'Plinko dropped into a losing pocket.';
      break;
    }
    default:
      throw new Error(`Unknown game: ${gameName}`);
  }

  return result;
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
  setTimeout(() => notice.remove(), 2600);
}

function openModal(content) {
  if (!gameModal) {
    throw new Error('Missing required element #gameModal');
  }
  gameModal.innerHTML = content;
  gameModal.hidden = false;
}

function closeModal() {
  if (!gameModal) return;
  gameModal.innerHTML = '';
  gameModal.hidden = true;
}

function renderGames() {
  const container = document.getElementById('gamesCarousel');
  if (!container) return;
  const games = [
    { key: 'mines', name: 'Mines', art: 'assets/games/mines.png' },
    { key: 'crash', name: 'Crash', art: 'assets/games/crash.png' },
    { key: 'dice', name: 'Dice', art: 'assets/games/dice.png' },
    { key: 'roulette', name: 'Roulette', art: 'assets/games/roulette.png' },
    { key: 'coinflip', name: 'Coinflip', art: 'assets/games/coinflip.png' },
    { key: 'plinko', name: 'Plinko', art: 'assets/games/mines.png' }
  ];

  container.innerHTML = games.map((game) => {
    const disabled = !state.games[game.key];
    return `
      <button class="game-card ${disabled ? 'disabled' : ''}" data-game="${game.key}">
        <img src="${game.art}" alt="${game.name}" />
        <span class="game-title">${game.name}</span>
        <small>${disabled ? 'Maintenance' : 'Play now'}</small>
      </button>
    `;
  }).join('');

  container.querySelectorAll('[data-game]').forEach((button) => {
    button.addEventListener('click', () => openGameModalByKey(button.dataset.game));
  });
}

function renderCasino() {
  const container = document.getElementById('casinoGrid');
  if (!container) return;
  const games = [
    { key: 'mines', name: 'Mines', art: 'assets/games/mines.png' },
    { key: 'crash', name: 'Crash', art: 'assets/games/crash.png' },
    { key: 'dice', name: 'Dice', art: 'assets/games/dice.png' },
    { key: 'roulette', name: 'Roulette', art: 'assets/games/roulette.png' },
    { key: 'coinflip', name: 'Coinflip', art: 'assets/games/coinflip.png' },
    { key: 'plinko', name: 'Plinko', art: 'assets/games/mines.png' }
  ];
  container.innerHTML = games.map((game) => {
    const disabled = !state.games[game.key];
    return `
      <div class="casino-card ${disabled ? 'disabled' : ''}" data-game="${game.key}">
        <img src="${game.art}" alt="${game.name}" />
        <div class="casino-card__meta">
          <strong>${game.name}</strong>
          <span>${disabled ? 'Soon / Technical works' : 'Live now'}</span>
        </div>
      </div>
    `;
  }).join('');
  container.querySelectorAll('[data-game]').forEach((card) => {
    card.addEventListener('click', () => openGameModalByKey(card.dataset.game));
  });
}

function openGameModalByKey(gameKey) {
  if (!state.games[gameKey]) {
    showNotice('This game is unavailable right now.');
    return;
  }
  currentGame = gameKey;
  const labels = {
    mines: 'Mines',
    crash: 'Crash',
    dice: 'Dice',
    roulette: 'Roulette',
    coinflip: 'Coinflip',
    plinko: 'Plinko'
  };
  const content = `
    <div class="modal-card">
      <button class="modal-close" id="closeModalBtn">×</button>
      <h3>${labels[gameKey]}</h3>
      <p class="modal-subtitle">Provably fair random rounds.</p>
      ${gameFormMarkup(gameKey)}
    </div>
  `;
  try {
    openModal(content);
  } catch (error) {
    console.error('Opening the game modal failed', error);
    showNotice('Could not open this game right now.');
    return;
  }
  requireElement('closeModalBtn').addEventListener('click', closeModal);
  const gameForm = requireElement('gameForm');
  gameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(gameForm);
    const payload = Object.fromEntries(formData.entries());
    playGame(gameKey, payload);
  });
}

function gameFormMarkup(gameKey) {
  const common = `
    <form id="gameForm" class="game-form">
      <label>Stake
        <input type="number" name="amount" min="10" step="10" placeholder="Amount" required />
      </label>
  `;
  switch (gameKey) {
    case 'mines':
      return `${common}<label>Choose safe / risky
        <select name="choice">
          <option value="safe">Safe</option>
          <option value="risky">Risky</option>
        </select>
      </label><button type="submit">Play</button></form>`;
    case 'coinflip':
      return `${common}<label>Pick side
        <select name="choice">
          <option value="heads">Heads</option>
          <option value="tails">Tails</option>
        </select>
      </label><button type="submit">Play</button></form>`;
    case 'dice':
      return `${common}<label>Bet on
        <select name="choice">
          <option value="high">High (4-6)</option>
          <option value="low">Low (1-3)</option>
        </select>
      </label><button type="submit">Play</button></form>`;
    case 'roulette':
      return `${common}<label>Color
        <select name="choice">
          <option value="red">Red</option>
          <option value="black">Black</option>
          <option value="green">Green</option>
        </select>
      </label><button type="submit">Play</button></form>`;
    case 'crash':
      return `${common}<label>Multiplier target
        <select name="choice">
          <option value="1.5">1.5x</option>
          <option value="2.0">2.0x</option>
          <option value="3.0">3.0x</option>
        </select>
      </label><button type="submit">Play</button></form>`;
    case 'plinko':
      return `${common}<label>Drop path
        <select name="choice">
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label><button type="submit">Play</button></form>`;
    default:
      return `${common}<button type="submit">Play</button></form>`;
  }
}

function renderPromoList() {
  const container = document.getElementById('promoList');
  if (!container) return;
  container.innerHTML = state.promos.map((promo) => `
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
  container.innerHTML = state.liveWins.map((item) => `
    <li><strong>${item.player}</strong> won ${formatMoney(item.amount)} in ${item.game} • ${item.time}</li>
  `).join('');
}

function renderWallet() {
  const balance = document.getElementById('walletBalance');
  if (balance) balance.textContent = formatMoney(state.user?.balance || 0);
  const requests = document.getElementById('walletRequests');
  if (!requests) return;
  if (!state.requests.length) {
    requests.innerHTML = '<p>No pending requests yet.</p>';
    return;
  }
  requests.innerHTML = state.requests.map((req) => `
    <div class="request-item">
      <div><strong>${req.type}</strong> • ${formatMoney(req.amount)} • ${req.method || req.address || 'manual'}</div>
      <div>${req.status}</div>
    </div>
  `).join('');
}

function renderProfile() {
  const authPanel = document.getElementById('authPanel');
  const profilePanel = document.getElementById('profilePanel');
  const settingsPanel = document.getElementById('settingsPanel');
  if (!authPanel || !profilePanel || !settingsPanel) return;

  if (!state.user) {
    authPanel.innerHTML = `
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
    `;
    profilePanel.innerHTML = '<div class="info-card"><h3>Profile</h3><p>Please sign in to access your personal profile.</p></div>';
    settingsPanel.innerHTML = '<div class="info-card"><h3>Settings</h3><p>Sound and theme will appear once you enter the casino.</p></div>';

    requireElement('authForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const mode = document.getElementById('authMode').value;
      const identifier = document.getElementById('authIdentifier').value.trim();
      const password = document.getElementById('authPassword').value;
      const name = document.getElementById('authName').value.trim();
      const surname = document.getElementById('authSurname').value.trim();
      const nickname = document.getElementById('authNickname').value.trim();
      const code = document.getElementById('authCode').value.trim();

      if (mode === 'register') {
        if (state.pendingAuth) {
          if (code === String(state.pendingAuth.code)) {
            const existing = state.users.find((u) => u.identifier === identifier);
            if (existing) {
              showNotice('This account already exists. Please login.');
              return;
            }
            const user = {
              id: createId('USR'),
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
              personalId: createId('ID'),
              avatar: '',
              banned: false,
              stats: { wins: 0, losses: 0, totalBet: 0 },
              role: 'player'
            };
            if (identifier.includes('@')) user.email = identifier; else if (identifier.startsWith('+')) user.phone = identifier; else user.email = `${identifier}@telegram.local`;
            state.users.push(user);
            state.user = user;
            state.pendingAuth = null;
            saveState();
            render();
            showNotice('Registration complete. Welcome to Rocket Crown!');
          } else {
            showNotice('Wrong verification code.');
          }
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
        document.getElementById('authCode').style.display = 'block';
        showNotice(`Verification code sent: ${state.pendingAuth.code}`);
        return;
      }

      const user = state.users.find((candidate) => candidate.identifier === identifier && candidate.password === password);
      if (user) {
        loginUser(user);
        showNotice('Welcome back.');
      } else {
        showNotice('No matching account found.');
      }
    });
    return;
  }

  authPanel.innerHTML = `
    <h3>Signed in</h3>
    <p>${state.user.nickname || state.user.name || state.user.identifier}</p>
    <p>Personal ID: ${state.user.personalId}</p>
    <button id="logoutBtn" class="secondary-btn">Logout</button>
  `;
  requireElement('logoutBtn').addEventListener('click', logoutUser);

  profilePanel.innerHTML = `
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
  `;
  const profileForm = requireElement('profileForm');
  profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(profileForm);
    const updates = Object.fromEntries(formData.entries());
    state.user = { ...state.user, ...updates, avatar: document.getElementById('avatarInput').value || state.user.avatar };
    const idx = state.users.findIndex((u) => u.id === state.user.id);
    if (idx >= 0) {
      state.users[idx] = { ...state.users[idx], ...state.user };
    }
    saveState();
    render();
    showNotice('Profile updated.');
  });

  settingsPanel.innerHTML = `
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
  `;
  requireElement('soundToggle').addEventListener('change', (event) => {
    state.sound = event.target.checked;
    saveState();
  });
  requireElement('themeToggle').addEventListener('change', (event) => {
    state.theme = event.target.checked ? 'dark' : 'light';
    applyTheme();
    saveState();
  });
  requireElement('logoutSettingsBtn').addEventListener('click', logoutUser);
}

function renderHome() {
  const statGames = document.getElementById('statGames');
  const statUsers = document.getElementById('statUsers');
  const statDeposits = document.getElementById('statDeposits');
  if (statGames) statGames.textContent = `Games online: ${Object.values(state.games).filter(Boolean).length}`;
  if (statUsers) statUsers.textContent = `Active users: ${state.users.length + (state.user ? 1 : 0)}`;
  if (statDeposits) statDeposits.textContent = state.depositsEnabled ? 'Deposits enabled' : 'Deposits disabled';
  document.getElementById('claimBonusBtn')?.addEventListener('click', () => showNotice('Bonus activated. Your next deposit gets a 100% boost.'));
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
  const balance = document.getElementById('balanceLabel');
  if (balance) balance.textContent = formatMoney(state.user?.balance || 0);
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

  document.getElementById('menuLogout')?.addEventListener('click', (event) => {
    event.preventDefault();
    logoutUser();
  });

  navButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const screenId = `${button.dataset.screen}Screen`;
      showScreen(screenId);
    });
  });
}

function bindWalletForms() {
  document.getElementById('depositForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.user) {
      showNotice('Login first to request a deposit.');
      return;
    }
    const amount = Number(document.getElementById('depositAmount')?.value);
    const method = document.getElementById('depositMethod')?.value;
    if (!state.depositsEnabled) {
      showNotice('Deposits are disabled for now.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      showNotice('Enter a valid deposit amount.');
      return;
    }
    state.requests.unshift(createRequest('DEP', 'Deposit', amount, { method }));
    saveState();
    renderWallet();
    showNotice('Deposit request created. It will be confirmed manually.');
  });

  document.getElementById('withdrawForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!state.user) {
      showNotice('Login first to request a withdrawal.');
      return;
    }
    const amount = Number(document.getElementById('withdrawAmount')?.value);
    const address = (document.getElementById('withdrawAddress')?.value || '').trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      showNotice('Enter a valid withdrawal amount.');
      return;
    }
    if (!address) {
      showNotice('Enter a withdrawal address.');
      return;
    }
    if (amount > (state.user.balance || 0)) {
      showNotice('Insufficient balance.');
      return;
    }
    updateUserBalance(-amount);
    state.requests.unshift(createRequest('WD', 'Withdraw', amount, { address }));
    saveState();
    render();
    showNotice('Withdraw request created. Funds are on hold until it is confirmed.');
  });
}

function initLiveWinsLoop() {
  setInterval(() => {
    try {
      pushSampleLiveWin();
    } catch (error) {
      console.error('Live wins update failed', error);
    }
  }, 6000);
}

function pushSampleLiveWin() {
  if (!state.liveWins.length) return;
  const sampleGames = ['Crash', 'Roulette', 'Dice', 'Mines'];
  const samplePlayers = ['Nico', 'Rex', 'Lana', 'Toni', 'Jules'];
  const randomIndex = Math.floor(Math.random() * sampleGames.length);
  state.liveWins.unshift({ player: samplePlayers[randomIndex], game: sampleGames[randomIndex], amount: 100 + randomInt(1, 400), time: 'just now' });
  state.liveWins = state.liveWins.slice(0, 8);
  saveState();
  renderLiveWins();
}

window.addEventListener('error', (event) => {
  console.error('Unhandled error', event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection', event.reason);
});

function initStateSync() {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    state = loadState();
    if (state.user) {
      state.user = state.users.find((user) => user.id === state.user.id) || state.user;
    }
    render();
  });
}

try {
  bindNavigation();
  bindWalletForms();
  initStateSync();
  applyTheme();
  render();
  initLiveWinsLoop();
  showScreen('homeScreen');
} catch (error) {
  console.error('Rocket Crown failed to start', error);
  showNotice('Something went wrong while loading the casino. Please reload.');
}
