const { db, formatMoney, errorText } = window.rocketCrown;

const GAME_KEYS = ['mines', 'crash', 'dice', 'roulette', 'coinflip', 'plinko'];

const loginCard = document.getElementById('loginCard');
const loginHint = document.getElementById('loginHint');
const adminBody = document.getElementById('adminBody');

const state = { requests: [], players: [], settings: null };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

// ------------------------------------------------------------------ loading

async function loadAll() {
  const [requests, players, settings] = await Promise.all([
    db.from('payment_requests').select('*').order('created_at', { ascending: false }),
    db.from('profiles').select('*').order('created_at', { ascending: false }),
    db.from('casino_settings').select('*').maybeSingle()
  ]);
  state.requests = requests.data || [];
  state.players = players.data || [];
  state.settings = settings.data;
  render();
}

// ------------------------------------------------------------------ actions

async function resolveRequest(id, approve) {
  const { error } = await db.rpc('resolve_payment_request', { p_id: id, p_approve: approve });
  if (error) {
    window.alert(errorText(error));
    return;
  }
  await loadAll();
}

async function adjustBalance(userId) {
  const raw = window.prompt('Amount to add (use a minus sign to take money away):', '0');
  if (raw === null) return;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount === 0) return;
  const { error } = await db.rpc('admin_adjust_balance', { p_user_id: userId, p_amount: amount });
  if (error) {
    window.alert(errorText(error));
    return;
  }
  await loadAll();
}

async function toggleBan(userId, banned) {
  const { error } = await db.rpc('admin_set_banned', { p_user_id: userId, p_banned: banned });
  if (error) {
    window.alert(errorText(error));
    return;
  }
  await loadAll();
}

async function saveSettings(patch) {
  const { error } = await db.from('casino_settings').update(patch).eq('id', true);
  if (error) {
    window.alert(errorText(error));
    return;
  }
  await loadAll();
}

// ----------------------------------------------------------------- rendering

function renderRequests() {
  const container = document.getElementById('requestsList');
  if (!state.requests.length) {
    container.innerHTML = '<p>No requests yet.</p>';
    return;
  }
  const byName = new Map(state.players.map((player) => [player.id, player.nickname]));
  const ordered = [...state.requests].sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  container.innerHTML = ordered.map((request) => {
    const pending = request.status === 'pending';
    const actions = pending
      ? `<div class="admin-actions">
          <button class="btn-approve" data-approve="${request.id}">Approve</button>
          <button class="btn-reject" data-reject="${request.id}">Reject</button>
        </div>`
      : '';
    return `
      <div class="admin-row">
        <div>
          <strong>${request.kind === 'deposit' ? 'Deposit' : 'Withdraw'}</strong> • ${formatMoney(request.amount)}
          <div class="muted">${escapeHtml(byName.get(request.user_id) || 'Unknown player')}
            • ${escapeHtml(request.method || request.address || 'manual')}</div>
        </div>
        <div>
          <span class="badge-${request.status}">${request.status}</span>
          ${actions}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-approve]').forEach((button) => {
    button.addEventListener('click', () => resolveRequest(button.dataset.approve, true));
  });
  container.querySelectorAll('[data-reject]').forEach((button) => {
    button.addEventListener('click', () => resolveRequest(button.dataset.reject, false));
  });
}

function renderPlayers() {
  const container = document.getElementById('playersList');
  if (!state.players.length) {
    container.innerHTML = '<p>No players yet.</p>';
    return;
  }
  container.innerHTML = state.players.map((player) => `
    <div class="admin-row">
      <div>
        <strong>${escapeHtml(player.nickname)}</strong>${player.is_admin ? ' • owner' : ''}
        <div class="muted">${escapeHtml(player.email || player.phone || player.personal_id)}
          • ${formatMoney(player.balance)}${player.banned ? ' • banned' : ''}</div>
      </div>
      <div class="admin-actions">
        <button class="btn-neutral" data-adjust="${player.id}">Balance</button>
        <button class="btn-reject" data-ban="${player.id}" data-banned="${player.banned}">
          ${player.banned ? 'Unban' : 'Ban'}
        </button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-adjust]').forEach((button) => {
    button.addEventListener('click', () => adjustBalance(button.dataset.adjust));
  });
  container.querySelectorAll('[data-ban]').forEach((button) => {
    button.addEventListener('click', () => toggleBan(button.dataset.ban, button.dataset.banned !== 'true'));
  });
}

function renderControls() {
  const depositsToggle = document.getElementById('depositsToggle');
  depositsToggle.checked = state.settings?.deposits_enabled !== false;
  depositsToggle.onchange = () => saveSettings({ deposits_enabled: depositsToggle.checked });

  const games = state.settings?.games || {};
  const container = document.getElementById('gameToggles');
  container.innerHTML = GAME_KEYS.map((key) => `
    <div class="toggle-row">
      <span>${key}</span>
      <label class="switch">
        <input type="checkbox" data-game="${key}" ${games[key] === false ? '' : 'checked'} /><span></span>
      </label>
    </div>
  `).join('');

  container.querySelectorAll('[data-game]').forEach((input) => {
    input.addEventListener('change', () => {
      saveSettings({ games: { ...games, [input.dataset.game]: input.checked } });
    });
  });
}

function renderStats() {
  const pending = state.requests.filter((request) => request.status === 'pending').length;
  const total = state.players.reduce((sum, player) => sum + Number(player.balance || 0), 0);
  document.getElementById('statPending').textContent = `Pending: ${pending}`;
  document.getElementById('statPlayers').textContent = `Players: ${state.players.length}`;
  document.getElementById('statBalance').textContent = `Total: ${formatMoney(total)}`;
}

function render() {
  renderStats();
  renderRequests();
  renderPlayers();
  renderControls();
}

// -------------------------------------------------------------------- access

// Being signed in is not enough: the page only opens for a profile the owner
// marked as admin, and the database refuses these actions for anyone else.
async function applySession() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    loginCard.hidden = false;
    adminBody.hidden = true;
    return;
  }
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) {
    loginCard.hidden = false;
    adminBody.hidden = true;
    loginHint.textContent = 'This account is not the casino owner.';
    await db.auth.signOut();
    return;
  }
  loginCard.hidden = true;
  adminBody.hidden = false;
  await loadAll();
}

document.getElementById('adminLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { error } = await db.auth.signInWithPassword({
    email: document.getElementById('adminEmail').value.trim(),
    password: document.getElementById('adminPassword').value
  });
  if (error) window.alert(errorText(error));
});

document.getElementById('adminLogout').addEventListener('click', () => db.auth.signOut());

db.auth.onAuthStateChange(() => applySession());

// Payments arrive while the owner has this page open.
db.channel('admin-sync')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => {
    if (!adminBody.hidden) loadAll();
  })
  .subscribe();
