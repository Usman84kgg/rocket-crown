const STORAGE_KEY = 'rocket-crown-state-v1';
const DEFAULT_ADMIN_PASSWORD = 'admin2026';
const GAME_KEYS = ['mines', 'crash', 'dice', 'roulette', 'coinflip', 'plinko'];

const loginCard = document.getElementById('loginCard');
const adminBody = document.getElementById('adminBody');

let state = loadState();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    console.warn('State restore failed', error);
    return {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatMoney(value) {
  return `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString();
}

function getUsers() {
  return Array.isArray(state.users) ? state.users : [];
}

function getRequests() {
  return Array.isArray(state.requests) ? state.requests : [];
}

function findUser(userId) {
  return getUsers().find((user) => user.id === userId) || null;
}

function creditUser(userId, amount) {
  const user = findUser(userId);
  if (user) user.balance = Number(user.balance || 0) + Number(amount);
  if (state.user && state.user.id === userId) {
    state.user.balance = Number(state.user.balance || 0) + Number(amount);
  }
  return Boolean(user) || state.user?.id === userId;
}

function resolveRequest(requestId, approved) {
  const request = getRequests().find((item) => item.id === requestId);
  if (!request || request.status !== 'Pending') return;

  if (approved && request.type === 'Deposit') {
    if (!creditUser(request.userId, request.amount)) {
      window.alert('Player not found for this request.');
      return;
    }
  }
  if (!approved && request.type === 'Withdraw') {
    creditUser(request.userId, request.amount);
  }

  request.status = approved ? 'Approved' : 'Rejected';
  request.resolvedAt = Date.now();
  saveState();
  render();
}

function adjustBalance(userId) {
  const user = findUser(userId);
  if (!user) return;
  const input = window.prompt(`Adjust balance for ${user.nickname || user.identifier}. Use a negative value to subtract.`, '0');
  if (input === null) return;
  const amount = Number(input);
  if (!Number.isFinite(amount) || amount === 0) return;
  creditUser(userId, amount);
  saveState();
  render();
}

function toggleBan(userId) {
  const user = findUser(userId);
  if (!user) return;
  user.banned = !user.banned;
  if (state.user && state.user.id === userId) state.user.banned = user.banned;
  saveState();
  render();
}

function requestBadge(status) {
  const map = { Pending: 'badge-pending', Approved: 'badge-approved', Rejected: 'badge-rejected' };
  return `<span class="badge ${map[status] || 'badge-pending'}">${escapeHtml(status || 'Pending')}</span>`;
}

function renderRequests() {
  const container = document.getElementById('requestsList');
  const requests = [...getRequests()].sort((a, b) => {
    const pendingDiff = Number(b.status === 'Pending') - Number(a.status === 'Pending');
    return pendingDiff || Number(b.createdAt || 0) - Number(a.createdAt || 0);
  });

  if (!requests.length) {
    container.innerHTML = '<p class="empty-note">No deposit or withdraw requests yet.</p>';
    return;
  }

  container.innerHTML = requests.map((request) => {
    const destination = request.address || request.method || 'manual';
    const actions = request.status === 'Pending'
      ? `<div class="admin-actions">
           <button class="btn-approve" data-approve="${escapeHtml(request.id)}">Approve</button>
           <button class="btn-reject" data-reject="${escapeHtml(request.id)}">Reject</button>
         </div>`
      : '';
    return `
      <div class="admin-row">
        <div class="admin-row__head">
          <span class="admin-row__title">${escapeHtml(request.type)} • ${formatMoney(request.amount)}</span>
          ${requestBadge(request.status)}
        </div>
        <div class="admin-row__meta">${escapeHtml(request.userLabel || 'Player')} • ${escapeHtml(destination)}</div>
        <div class="admin-row__meta">${escapeHtml(request.id)} • ${escapeHtml(formatDate(request.createdAt))}</div>
        ${actions}
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
  const users = getUsers();
  if (!users.length) {
    container.innerHTML = '<p class="empty-note">No registered players in this browser yet.</p>';
    return;
  }

  container.innerHTML = users.map((user) => `
    <div class="admin-row">
      <div class="admin-row__head">
        <span class="admin-row__title">${escapeHtml(user.nickname || user.identifier || user.id)}</span>
        <span class="admin-row__title">${formatMoney(user.balance)}</span>
      </div>
      <div class="admin-row__meta">${escapeHtml(user.identifier || '')} • ${escapeHtml(user.personalId || user.id)}</div>
      <div class="admin-actions">
        <button class="btn-neutral" data-adjust="${escapeHtml(user.id)}">Adjust balance</button>
        <button class="${user.banned ? 'btn-approve' : 'btn-reject'}" data-ban="${escapeHtml(user.id)}">${user.banned ? 'Unban' : 'Ban'}</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-adjust]').forEach((button) => {
    button.addEventListener('click', () => adjustBalance(button.dataset.adjust));
  });
  container.querySelectorAll('[data-ban]').forEach((button) => {
    button.addEventListener('click', () => toggleBan(button.dataset.ban));
  });
}

function renderControls() {
  const depositsToggle = document.getElementById('depositsToggle');
  depositsToggle.checked = state.depositsEnabled !== false;
  depositsToggle.onchange = () => {
    state.depositsEnabled = depositsToggle.checked;
    saveState();
  };

  const games = state.games || {};
  const container = document.getElementById('gameToggles');
  container.innerHTML = GAME_KEYS.map((key) => `
    <div class="toggle-row">
      <span>${escapeHtml(key)}</span>
      <label class="switch"><input type="checkbox" data-game="${key}" ${games[key] === false ? '' : 'checked'} /><span></span></label>
    </div>
  `).join('');

  container.querySelectorAll('[data-game]').forEach((input) => {
    input.addEventListener('change', () => {
      state.games = { ...(state.games || {}), [input.dataset.game]: input.checked };
      saveState();
    });
  });
}

function renderStats() {
  const pending = getRequests().filter((request) => request.status === 'Pending').length;
  const total = getUsers().reduce((sum, user) => sum + Number(user.balance || 0), 0);
  document.getElementById('statPending').textContent = `Pending: ${pending}`;
  document.getElementById('statPlayers').textContent = `Players: ${getUsers().length}`;
  document.getElementById('statBalance').textContent = `Total: ${formatMoney(total)}`;
}

function render() {
  renderStats();
  renderRequests();
  renderPlayers();
  renderControls();
}

document.getElementById('adminLoginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const entered = document.getElementById('adminPasswordInput').value;
  if (entered !== (state.adminPassword || DEFAULT_ADMIN_PASSWORD)) {
    window.alert('Wrong admin password.');
    return;
  }
  loginCard.hidden = true;
  adminBody.hidden = false;
  render();
});

document.getElementById('passwordForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const next = document.getElementById('newPassword').value;
  if (next.length < 6) {
    window.alert('Password must be at least 6 characters.');
    return;
  }
  state.adminPassword = next;
  saveState();
  document.getElementById('newPassword').value = '';
  window.alert('Admin password updated.');
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY || adminBody.hidden) return;
  state = loadState();
  render();
});
