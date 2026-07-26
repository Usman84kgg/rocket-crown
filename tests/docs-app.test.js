import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage, loadScript } from './helpers/dom.js';
import { stubRandomValues } from './helpers/random.js';

const STORAGE_KEY = 'rocket-crown-state-v1';

function makeUser(overrides = {}) {
  return {
    id: 'USR-1',
    identifier: 'player@mail.com',
    password: 'secret',
    name: 'Ann',
    surname: 'Lee',
    nickname: 'ann',
    balance: 1000,
    personalId: 'ID-1',
    banned: false,
    stats: { wins: 0, losses: 0, totalBet: 0 },
    role: 'player',
    ...overrides
  };
}

function seedState(partial) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(partial));
}

async function bootApp() {
  loadPage('docs/index.html');
  return loadScript('docs/script.js');
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('state persistence', () => {
  it('falls back to defaults when stored state is corrupt', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const app = await bootApp();

    expect(warn).toHaveBeenCalled();
    expect(app.state.user).toBeNull();
    expect(app.state.promos).toHaveLength(2);
    expect(app.state.games.mines).toBe(true);
  });

  it('merges stored state over the defaults', async () => {
    seedState({ theme: 'light', games: { mines: false }, users: [makeUser()] });
    const app = await bootApp();

    expect(app.state.theme).toBe('light');
    expect(app.state.games.mines).toBe(false);
    expect(app.state.games.crash).toBe(true);
    expect(app.state.users).toHaveLength(1);
  });

  it('writes the current state to localStorage on save', async () => {
    const app = await bootApp();
    app.state.sound = false;
    app.saveState();

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).sound).toBe(false);
  });
});

describe('formatting and helpers', () => {
  it('formats money with two fraction digits', async () => {
    const app = await bootApp();

    expect(app.formatMoney(0)).toBe('$0.00');
    expect(app.formatMoney(1234.5)).toBe('$1,234.50');
    expect(app.formatMoney('7')).toBe('$7.00');
  });

  it('returns zeroed stats for users without stats', async () => {
    const app = await bootApp();

    expect(app.getUserStats(undefined)).toEqual({ wins: 0, losses: 0, totalBet: 0 });
    expect(app.getUserStats({ stats: { wins: 3, losses: 1, totalBet: 40 } })).toEqual({
      wins: 3,
      losses: 1,
      totalBet: 40
    });
  });

  it('builds prefixed ids', async () => {
    const app = await bootApp();

    expect(app.createId('USR')).toMatch(/^USR-[A-Z0-9]{1,6}$/);
  });

  it('keeps randomInt inside the requested range', async () => {
    stubRandomValues(7);
    const app = await bootApp();

    expect(app.randomInt(1, 6)).toBe(2);
    expect(app.randomInt(0, 1)).toBe(1);
    expect(app.randomInt(5, 5)).toBe(5);
  });
});

describe('balance and session', () => {
  it('does nothing when nobody is logged in', async () => {
    const app = await bootApp();
    app.updateUserBalance(100);

    expect(app.state.user).toBeNull();
  });

  it('adds to the balance and mirrors it onto the users list', async () => {
    const user = makeUser();
    seedState({ user, users: [{ ...user }] });
    const app = await bootApp();

    app.updateUserBalance(250);

    expect(app.state.user.balance).toBe(1250);
    expect(app.state.users[0].balance).toBe(1250);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).user.balance).toBe(1250);
  });

  it('logs a user in and out', async () => {
    const app = await bootApp();
    app.state.pendingAuth = { code: 1234 };

    app.loginUser(makeUser());
    expect(app.state.user.nickname).toBe('ann');
    expect(app.state.pendingAuth).toBeNull();
    expect(document.getElementById('balanceLabel').textContent).toBe('$1,000.00');

    app.logoutUser();
    expect(app.state.user).toBeNull();
    expect(document.getElementById('balanceLabel').textContent).toBe('$0.00');
  });
});

describe('live wins feed', () => {
  it('prepends a win and keeps only the latest eight entries', async () => {
    const app = await bootApp();
    for (let i = 0; i < 10; i += 1) {
      app.addLiveWin('DICE', i, `p${i}`);
    }

    expect(app.state.liveWins).toHaveLength(8);
    expect(app.state.liveWins[0]).toMatchObject({ player: 'p9', game: 'DICE', time: 'just now' });
    expect(document.getElementById('liveWinsList').querySelectorAll('li')).toHaveLength(8);
  });

  it('defaults the player name', async () => {
    const app = await bootApp();
    app.addLiveWin('CRASH', 10);

    expect(app.state.liveWins[0].player).toBe('Player');
  });

  it('adds a simulated win on every loop tick', async () => {
    stubRandomValues(3);
    const app = await bootApp();
    const before = app.state.liveWins[0];

    vi.advanceTimersByTime(6000);

    expect(app.state.liveWins[0]).not.toEqual(before);
    expect(app.state.liveWins[1]).toEqual(before);
    expect(app.state.liveWins).toHaveLength(4);
  });
});

describe('playGame guards', () => {
  it('asks anonymous visitors to sign in', async () => {
    const app = await bootApp();
    app.playGame('dice', { amount: 10 });

    expect(document.querySelector('.toast').textContent).toBe('Please register or login first.');
  });

  it('blocks banned accounts', async () => {
    seedState({ user: makeUser({ banned: true }) });
    const app = await bootApp();
    app.playGame('dice', { amount: 10 });

    expect(document.querySelector('.toast').textContent).toBe('Your account is banned.');
  });

  it('blocks games in maintenance', async () => {
    seedState({ user: makeUser(), games: { dice: false } });
    const app = await bootApp();
    app.playGame('dice', { amount: 10 });

    expect(document.querySelector('.toast').textContent).toBe('This game is under maintenance.');
  });

  it('blocks play while deposits are disabled', async () => {
    seedState({ user: makeUser(), depositsEnabled: false });
    const app = await bootApp();
    app.playGame('dice', { amount: 10 });

    expect(document.querySelector('.toast').textContent).toBe('Deposits are temporarily disabled.');
  });

  it.each([
    ['zero stake', 0],
    ['negative stake', -5],
    ['stake above balance', 5000]
  ])('rejects a %s', async (_label, amount) => {
    seedState({ user: makeUser() });
    const app = await bootApp();
    app.playGame('dice', { amount });

    expect(document.querySelector('.toast').textContent).toBe('Insufficient balance or invalid stake.');
    expect(app.state.user.balance).toBe(1000);
  });

  it('charges the stake for an unknown game without paying out', async () => {
    seedState({ user: makeUser(), games: { unknown: true } });
    const app = await bootApp();
    app.playGame('unknown', { amount: 100 });

    expect(app.state.user.balance).toBe(900);
    expect(app.state.user.stats).toEqual({ wins: 0, losses: 1, totalBet: 100 });
  });
});

describe('playGame outcomes', () => {
  it('pays 1.9x on a winning mines round', async () => {
    stubRandomValues(1);
    seedState({ user: makeUser(), users: [makeUser()] });
    const app = await bootApp();

    app.playGame('mines', { amount: 100 });

    expect(app.state.user.balance).toBe(1290);
    expect(app.state.user.stats).toEqual({ wins: 1, losses: 0, totalBet: 100 });
    expect(app.state.users[0].balance).toBe(1290);
    expect(app.state.liveWins[0]).toMatchObject({ game: 'MINES', player: 'ann', amount: 290 });
  });

  it('takes the stake on a losing mines round', async () => {
    stubRandomValues(2);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('mines', { amount: 100 });

    expect(app.state.user.balance).toBe(900);
    expect(app.state.user.stats).toEqual({ wins: 0, losses: 1, totalBet: 100 });
  });

  it('pays 1.95x when the coin matches the pick', async () => {
    stubRandomValues(2);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('coinflip', { amount: 100, choice: 'heads' });

    expect(app.state.user.balance).toBe(1295);
    expect(document.querySelector('.toast').textContent).toContain('Coin landed heads. You won.');
  });

  it('loses coinflip when the coin lands on the other side', async () => {
    stubRandomValues(3);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('coinflip', { amount: 100, choice: 'heads' });

    expect(app.state.user.balance).toBe(900);
    expect(document.querySelector('.toast').textContent).toContain('Coin landed tails. You lost.');
  });

  it('pays 1.85x for a correct high dice bet', async () => {
    stubRandomValues(4);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('dice', { amount: 100, choice: 'high' });

    expect(app.state.user.balance).toBe(1285);
    expect(document.querySelector('.toast').textContent).toContain('Dice rolled 5.');
  });

  it('loses a high dice bet on a low roll', async () => {
    stubRandomValues(1);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('dice', { amount: 100, choice: 'high' });

    expect(app.state.user.balance).toBe(900);
    expect(document.querySelector('.toast').textContent).toContain('Dice rolled 2. You lost.');
  });

  it('pays 8x for a correct green roulette bet', async () => {
    stubRandomValues(2);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('roulette', { amount: 100, choice: 'green' });

    expect(app.state.user.balance).toBe(1900);
  });

  it('pays 1.9x for a correct colour roulette bet', async () => {
    stubRandomValues(3);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('roulette', { amount: 100, choice: 'red' });

    expect(app.state.user.balance).toBe(1290);
  });

  it('loses a roulette bet on another colour', async () => {
    stubRandomValues(1);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('roulette', { amount: 100, choice: 'red' });

    expect(app.state.user.balance).toBe(900);
    expect(document.querySelector('.toast').textContent).toContain('Roulette landed on black.');
  });

  it('pays the crash multiplier when the target is reached', async () => {
    stubRandomValues(9);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('crash', { amount: 100, choice: '1.5' });

    expect(app.state.user.balance).toBe(1300);
    expect(document.querySelector('.toast').textContent).toContain('Crash multiplier 2.0x. You won.');
  });

  it('loses crash when the multiplier stays below the target', async () => {
    stubRandomValues(1);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('crash', { amount: 100, choice: '3.0' });

    expect(app.state.user.balance).toBe(900);
  });

  it('pays 2x on a winning plinko drop', async () => {
    stubRandomValues(2);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('plinko', { amount: 100 });

    expect(app.state.user.balance).toBe(1300);
  });

  it('loses a plinko drop into a losing pocket', async () => {
    stubRandomValues(1);
    seedState({ user: makeUser() });
    const app = await bootApp();

    app.playGame('plinko', { amount: 100 });

    expect(app.state.user.balance).toBe(900);
    expect(document.querySelector('.toast').textContent).toContain('losing pocket');
  });
});

describe('ui primitives', () => {
  it('activates only the requested screen', async () => {
    const app = await bootApp();
    app.showScreen('walletScreen');

    expect(document.getElementById('walletScreen').classList.contains('active')).toBe(true);
    expect(document.getElementById('homeScreen').classList.contains('active')).toBe(false);
    const active = document.querySelector('.nav-btn.active');
    expect(active.dataset.screen).toBe('wallet');
  });

  it('applies the stored theme to the document', async () => {
    seedState({ theme: 'light' });
    const app = await bootApp();

    expect(document.body.dataset.theme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#160d03');

    app.state.theme = 'dark';
    app.applyTheme();
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#050816');
  });

  it('removes a toast after its lifetime', async () => {
    const app = await bootApp();
    app.showNotice('hello');

    expect(document.querySelectorAll('.toast')).toHaveLength(1);
    vi.advanceTimersByTime(2600);
    expect(document.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('opens and closes the modal', async () => {
    const app = await bootApp();
    app.openModal('<p>hi</p>');

    const modal = document.getElementById('gameModal');
    expect(modal.hidden).toBe(false);
    expect(modal.innerHTML).toBe('<p>hi</p>');

    app.closeModal();
    expect(modal.hidden).toBe(true);
    expect(modal.innerHTML).toBe('');
  });

  it('toggles the menu panel and closes it on outside clicks', async () => {
    await bootApp();
    const panel = document.getElementById('menuPanel');

    document.getElementById('menuButton').click();
    expect(panel.classList.contains('open')).toBe(true);

    document.body.click();
    expect(panel.classList.contains('open')).toBe(false);
  });

  it('logs out from the menu link', async () => {
    seedState({ user: makeUser() });
    const app = await bootApp();

    document.getElementById('menuLogout').click();

    expect(app.state.user).toBeNull();
  });

  it('switches screens from the bottom navigation', async () => {
    const app = await bootApp();
    const walletButton = [...document.querySelectorAll('.nav-btn')].find((b) => b.dataset.screen === 'wallet');

    walletButton.click();

    expect(document.getElementById('walletScreen').classList.contains('active')).toBe(true);
    expect(app.state.user).toBeNull();
  });
});

describe('rendering', () => {
  it('marks disabled games as under maintenance in both grids', async () => {
    seedState({ games: { crash: false } });
    await bootApp();

    const carouselCard = document.querySelector('#gamesCarousel [data-game="crash"]');
    const casinoCard = document.querySelector('#casinoGrid [data-game="crash"]');

    expect(carouselCard.classList.contains('disabled')).toBe(true);
    expect(carouselCard.textContent).toContain('Maintenance');
    expect(casinoCard.textContent).toContain('Soon / Technical works');
    expect(document.querySelectorAll('#gamesCarousel [data-game]')).toHaveLength(6);
  });

  it('renders promotions and the home counters', async () => {
    seedState({ users: [makeUser()], user: makeUser(), depositsEnabled: false, games: { plinko: false } });
    await bootApp();

    expect(document.querySelectorAll('#promoList .promo-card')).toHaveLength(2);
    expect(document.getElementById('statGames').textContent).toBe('Games online: 5');
    expect(document.getElementById('statUsers').textContent).toBe('Active users: 2');
    expect(document.getElementById('statDeposits').textContent).toBe('Deposits disabled');
  });

  it('shows a bonus toast from the hero button', async () => {
    await bootApp();
    document.getElementById('claimBonusBtn').click();

    expect(document.querySelector('.toast').textContent).toContain('Bonus activated');
  });

  it('shows an empty wallet state and then the pending requests', async () => {
    const app = await bootApp();
    expect(document.getElementById('walletRequests').textContent).toContain('No pending requests yet.');

    app.state.requests = [{ id: 'DEP-1', type: 'Deposit', amount: 50, method: 'TON', status: 'Pending' }];
    app.renderWallet();

    expect(document.querySelectorAll('#walletRequests .request-item')).toHaveLength(1);
    expect(document.getElementById('walletRequests').textContent).toContain('$50.00');
  });

  it('refuses to open a disabled game modal', async () => {
    seedState({ games: { dice: false } });
    const app = await bootApp();

    app.openGameModalByKey('dice');

    expect(document.getElementById('gameModal').hidden).toBe(true);
    expect(document.querySelector('.toast').textContent).toBe('This game is unavailable right now.');
  });

  it('opens a game modal and plays the round on submit', async () => {
    stubRandomValues(1);
    seedState({ user: makeUser() });
    const app = await bootApp();

    document.querySelector('#gamesCarousel [data-game="mines"]').click();

    const form = document.getElementById('gameForm');
    expect(document.getElementById('gameModal').hidden).toBe(false);
    expect(form.querySelector('select[name="choice"]').value).toBe('safe');

    form.querySelector('input[name="amount"]').value = '100';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    expect(app.state.user.balance).toBe(1290);
    expect(document.getElementById('gameModal').hidden).toBe(true);
  });

  it('closes the modal from its close button', async () => {
    const app = await bootApp();
    app.openGameModalByKey('crash');

    document.getElementById('closeModalBtn').click();

    expect(document.getElementById('gameModal').hidden).toBe(true);
  });

  it.each([
    ['mines', 'safe'],
    ['coinflip', 'heads'],
    ['dice', 'high'],
    ['roulette', 'red'],
    ['crash', '1.5'],
    ['plinko', 'left']
  ])('builds a %s form with its own choices', async (game, firstChoice) => {
    const app = await bootApp();
    document.body.insertAdjacentHTML('beforeend', app.gameFormMarkup(game));

    const select = document.querySelector('#gameForm select[name="choice"]');
    expect(select.options[0].value).toBe(firstChoice);
  });

  it('falls back to a stake only form for unknown games', async () => {
    const app = await bootApp();
    document.body.insertAdjacentHTML('beforeend', app.gameFormMarkup('unknown'));

    expect(document.querySelector('#gameForm select[name="choice"]')).toBeNull();
    expect(document.querySelector('#gameForm input[name="amount"]')).not.toBeNull();
  });
});

describe('authentication panel', () => {
  function submitAuth({ mode = 'register', identifier = '', password = '', name = '', code = '' } = {}) {
    document.getElementById('authMode').value = mode;
    document.getElementById('authIdentifier').value = identifier;
    document.getElementById('authPassword').value = password;
    document.getElementById('authName').value = name;
    document.getElementById('authCode').value = code;
    document
      .getElementById('authForm')
      .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }

  it('sends a verification code before creating the account', async () => {
    const app = await bootApp();
    submitAuth({ identifier: 'new@mail.com', password: 'pw', name: 'Nick' });

    expect(app.state.pendingAuth.identifier).toBe('new@mail.com');
    expect(app.state.users).toHaveLength(0);
    expect(document.getElementById('authCode').style.display).toBe('block');
    expect(document.querySelector('.toast').textContent).toContain('Verification code sent');
  });

  it('rejects a wrong verification code', async () => {
    seedState({ pendingAuth: { identifier: 'new@mail.com', code: 4321 } });
    const app = await bootApp();
    submitAuth({ identifier: 'new@mail.com', password: 'pw', code: '1111' });

    expect(app.state.user).toBeNull();
    expect(document.querySelector('.toast').textContent).toBe('Wrong verification code.');
  });

  it('creates and signs in the account on a matching code', async () => {
    seedState({ pendingAuth: { identifier: 'new@mail.com', code: 4321 } });
    const app = await bootApp();
    submitAuth({ identifier: 'new@mail.com', password: 'pw', name: 'Nick', code: '4321' });

    expect(app.state.user).toMatchObject({ identifier: 'new@mail.com', email: 'new@mail.com', balance: 2500 });
    expect(app.state.users).toHaveLength(1);
    expect(app.state.pendingAuth).toBeNull();
    expect(document.getElementById('logoutBtn')).not.toBeNull();
  });

  it.each([
    ['+79990000000', 'phone', '+79990000000'],
    ['telegramuser', 'email', 'telegramuser@telegram.local']
  ])('derives contact details from %s', async (identifier, field, expected) => {
    seedState({ pendingAuth: { identifier, code: 1000 } });
    const app = await bootApp();
    submitAuth({ identifier, password: 'pw', code: '1000' });

    expect(app.state.user[field]).toBe(expected);
  });

  it('refuses to register an identifier that already exists', async () => {
    seedState({ pendingAuth: { identifier: 'player@mail.com', code: 1000 }, users: [makeUser()] });
    const app = await bootApp();
    submitAuth({ identifier: 'player@mail.com', password: 'pw', code: '1000' });

    expect(app.state.user).toBeNull();
    expect(app.state.users).toHaveLength(1);
    expect(document.querySelector('.toast').textContent).toBe('This account already exists. Please login.');
  });

  it('logs in an existing account', async () => {
    seedState({ users: [makeUser()] });
    const app = await bootApp();
    submitAuth({ mode: 'login', identifier: 'player@mail.com', password: 'secret' });

    expect(app.state.user.id).toBe('USR-1');
    expect(document.querySelector('.toast').textContent).toBe('Welcome back.');
  });

  it('rejects a login with the wrong password', async () => {
    seedState({ users: [makeUser()] });
    const app = await bootApp();
    submitAuth({ mode: 'login', identifier: 'player@mail.com', password: 'nope' });

    expect(app.state.user).toBeNull();
    expect(document.querySelector('.toast').textContent).toBe('No matching account found.');
  });
});

describe('profile and settings for signed in users', () => {
  it('saves edited profile fields', async () => {
    const user = makeUser();
    seedState({ user, users: [{ ...user }] });
    const app = await bootApp();

    document.querySelector('#profileForm input[name="nickname"]').value = 'rocket';
    document.getElementById('avatarInput').value = 'https://cdn.test/a.png';
    document
      .getElementById('profileForm')
      .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

    expect(app.state.user.nickname).toBe('rocket');
    expect(app.state.user.avatar).toBe('https://cdn.test/a.png');
    expect(app.state.users[0].nickname).toBe('rocket');
    expect(document.querySelector('.toast').textContent).toBe('Profile updated.');
  });

  it('persists the sound and theme switches', async () => {
    seedState({ user: makeUser() });
    const app = await bootApp();

    const sound = document.getElementById('soundToggle');
    sound.checked = false;
    sound.dispatchEvent(new window.Event('change'));
    expect(app.state.sound).toBe(false);

    const theme = document.getElementById('themeToggle');
    theme.checked = false;
    theme.dispatchEvent(new window.Event('change'));
    expect(app.state.theme).toBe('light');
    expect(document.body.dataset.theme).toBe('light');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).theme).toBe('light');
  });

  it('logs out from the settings panel', async () => {
    seedState({ user: makeUser() });
    const app = await bootApp();

    document.getElementById('logoutSettingsBtn').click();

    expect(app.state.user).toBeNull();
    expect(document.getElementById('authForm')).not.toBeNull();
  });
});

describe('wallet forms', () => {
  function submitDeposit(amount, method = 'TON') {
    document.getElementById('depositAmount').value = String(amount);
    document.getElementById('depositMethod').value = method;
    document
      .getElementById('depositForm')
      .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }

  function submitWithdraw(amount, address = 'UQxyz') {
    document.getElementById('withdrawAmount').value = String(amount);
    document.getElementById('withdrawAddress').value = address;
    document
      .getElementById('withdrawForm')
      .dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }

  it('requires a session before requesting a deposit', async () => {
    const app = await bootApp();
    submitDeposit(100);

    expect(app.state.requests).toHaveLength(0);
    expect(document.querySelector('.toast').textContent).toBe('Login first to request a deposit.');
  });

  it('refuses deposits while they are disabled', async () => {
    seedState({ user: makeUser(), depositsEnabled: false });
    const app = await bootApp();
    submitDeposit(100);

    expect(app.state.requests).toHaveLength(0);
    expect(document.querySelector('.toast').textContent).toBe('Deposits are disabled for now.');
  });

  it('creates a pending deposit request', async () => {
    seedState({ user: makeUser() });
    const app = await bootApp();
    submitDeposit(150);

    expect(app.state.requests[0]).toMatchObject({ type: 'Deposit', amount: 150, status: 'Pending • 5-15 min' });
    expect(document.querySelector('#walletRequests .request-item').textContent).toContain('$150.00');
  });

  it('requires a session before requesting a withdrawal', async () => {
    const app = await bootApp();
    submitWithdraw(100);

    expect(app.state.requests).toHaveLength(0);
    expect(document.querySelector('.toast').textContent).toBe('Login first to request a withdrawal.');
  });

  it('refuses to withdraw more than the balance', async () => {
    seedState({ user: makeUser({ balance: 50 }) });
    const app = await bootApp();
    submitWithdraw(100);

    expect(app.state.requests).toHaveLength(0);
    expect(document.querySelector('.toast').textContent).toBe('Insufficient balance.');
  });

  it('creates a pending withdrawal request', async () => {
    seedState({ user: makeUser() });
    const app = await bootApp();
    submitWithdraw(300, 'UQabc');

    expect(app.state.requests[0]).toMatchObject({ type: 'Withdraw', amount: 300, address: 'UQabc' });
  });
});
