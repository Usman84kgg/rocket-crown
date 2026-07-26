const { db, formatMoney, errorText } = window.rocketCrown;

const GAME_KEYS = ['mines', 'crash', 'coinflip', 'plinko', 'sweet_bonanza'];

const loginCard  = document.getElementById('loginCard');
const loginHint  = document.getElementById('loginHint');
const adminBody  = document.getElementById('adminBody');

const state = { requests: [], players: [], settings: null };

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

// ── Helpers to read/write meta settings ──────────────────────────────
function getMeta() { return state.settings?.games?._meta || {}; }

async function saveMeta(patch) {
  const current = state.settings?.games || {};
  const meta = { ...getMeta(), ...patch };
  await saveSettings({ games: { ...current, _meta: meta } });
}

// ── Loading ───────────────────────────────────────────────────────────
async function loadAll() {
  const [requests, players, settings] = await Promise.all([
    db.from('payment_requests').select('*').order('created_at', { ascending: false }),
    db.from('profiles').select('*').order('created_at', { ascending: false }),
    db.from('casino_settings').select('*').maybeSingle()
  ]);
  state.requests = requests.data || [];
  state.players  = players.data  || [];
  state.settings = settings.data;
  render();
}

// ── Actions ───────────────────────────────────────────────────────────
async function resolveRequest(id, approve) {
  const { error } = await db.rpc('resolve_payment_request', { p_id: id, p_approve: approve });
  if (error) { window.alert(errorText(error)); return; }
  await loadAll();
}

async function adjustBalance(userId) {
  const raw = window.prompt('Amount to add/remove (negative to subtract):', '0');
  if (raw === null) return;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount === 0) return;
  const { error } = await db.rpc('admin_adjust_balance', { p_user_id: userId, p_amount: amount });
  if (error) { window.alert(errorText(error)); return; }
  await loadAll();
}

async function toggleBan(userId, banned) {
  const { error } = await db.rpc('admin_set_banned', { p_user_id: userId, p_banned: banned });
  if (error) { window.alert(errorText(error)); return; }
  await loadAll();
}

async function saveSettings(patch) {
  const { error } = await db.from('casino_settings').update(patch).eq('id', true);
  if (error) { window.alert(errorText(error)); return; }
  await loadAll();
}

// ── Rendering ─────────────────────────────────────────────────────────
function renderRequests() {
  const el = document.getElementById('requestsList');
  if (!state.requests.length) { el.innerHTML = '<p class="hint">No requests yet.</p>'; return; }

  const byName = new Map(state.players.map(p => [p.id, p.nickname]));
  const ordered = [...state.requests].sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending'))
      return a.status === 'pending' ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  el.innerHTML = ordered.map(r => {
    const pending = r.status === 'pending';
    const statusClass = { pending: 'status-pending', approved: 'status-approved', rejected: 'status-rejected' };
    const actions = pending ? `
      <div class="admin-actions">
        <button class="btn-approve" data-approve="${r.id}">✓ Approve</button>
        <button class="btn-reject"  data-reject="${r.id}">✗ Reject</button>
      </div>` : '';
    return `
      <div class="admin-row">
        <div>
          <strong>${r.kind === 'deposit' ? '⬇ Deposit' : '⬆ Withdraw'}</strong> · ${formatMoney(r.amount)}
          <div class="muted">${escapeHtml(byName.get(r.user_id) || 'Unknown')} · ${escapeHtml(r.method || r.address || 'manual')}</div>
          <div class="muted" style="font-size:11px;">${new Date(r.created_at).toLocaleString()}</div>
        </div>
        <div style="text-align:right;">
          <span class="status-badge ${statusClass[r.status] || ''}">${r.status}</span>
          ${actions}
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('[data-approve]').forEach(b =>
    b.addEventListener('click', () => resolveRequest(b.dataset.approve, true)));
  el.querySelectorAll('[data-reject]').forEach(b =>
    b.addEventListener('click', () => resolveRequest(b.dataset.reject, false)));
}

function renderPlayers() {
  const el = document.getElementById('playersList');
  if (!state.players.length) { el.innerHTML = '<p class="hint">No players yet.</p>'; return; }
  el.innerHTML = state.players.map(p => `
    <div class="admin-row">
      <div>
        <strong>${escapeHtml(p.nickname)}</strong>${p.is_admin ? ' 👑' : ''}
        <div class="muted">${escapeHtml(p.email || p.phone || p.personal_id)} · ${formatMoney(p.balance)}${p.banned ? ' · 🚫 banned' : ''}</div>
      </div>
      <div class="admin-actions">
        <button class="btn-neutral" data-adjust="${p.id}">Balance</button>
        <button class="btn-reject"  data-ban="${p.id}" data-banned="${p.banned}">
          ${p.banned ? 'Unban' : 'Ban'}
        </button>
      </div>
    </div>
  `).join('');

  el.querySelectorAll('[data-adjust]').forEach(b =>
    b.addEventListener('click', () => adjustBalance(b.dataset.adjust)));
  el.querySelectorAll('[data-ban]').forEach(b =>
    b.addEventListener('click', () => toggleBan(b.dataset.ban, b.dataset.banned !== 'true')));
}

function renderControls() {
  const toggle = document.getElementById('depositsToggle');
  toggle.checked = state.settings?.deposits_enabled !== false;
  toggle.onchange = () => saveSettings({ deposits_enabled: toggle.checked });

  const games = state.settings?.games || {};
  const el = document.getElementById('gameToggles');
  el.innerHTML = GAME_KEYS.map(key => `
    <div class="toggle-row">
      <span>${key.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
      <label class="switch">
        <input type="checkbox" data-game="${key}" ${games[key] === false ? '' : 'checked'} /><span></span>
      </label>
    </div>
  `).join('');

  el.querySelectorAll('[data-game]').forEach(inp => {
    inp.addEventListener('change', () =>
      saveSettings({ games: { ...games, [inp.dataset.game]: inp.checked } }));
  });
}

function renderStats() {
  const pending = state.requests.filter(r => r.status === 'pending').length;
  const total   = state.players.reduce((s, p) => s + Number(p.balance || 0), 0);
  document.getElementById('statPending').textContent = `Pending: ${pending}`;
  document.getElementById('statPlayers').textContent = `Players: ${state.players.length}`;
  document.getElementById('statBalance').textContent = `Total: ${formatMoney(total)}`;
}

function renderDepositAddresses() {
  const meta = getMeta();
  const addrs = meta.deposit_addresses || {};
  if (document.getElementById('addrTON'))  document.getElementById('addrTON').value  = addrs.TON  || '';
  if (document.getElementById('addrUSDT')) document.getElementById('addrUSDT').value = addrs.USDT || '';
  if (document.getElementById('addrBTC'))  document.getElementById('addrBTC').value  = addrs.BTC  || '';
}

function renderContactInfo() {
  const meta = getMeta();
  if (document.getElementById('contactEmail'))    document.getElementById('contactEmail').value    = meta.contact_email    || '';
  if (document.getElementById('contactTelegram')) document.getElementById('contactTelegram').value = meta.contact_telegram || '';
}

function render() {
  renderStats();
  renderRequests();
  renderPlayers();
  renderControls();
  renderDepositAddresses();
  renderContactInfo();
}

// ── Deposit addresses form ────────────────────────────────────────────
document.getElementById('depositAddressForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  await saveMeta({
    deposit_addresses: {
      TON:  document.getElementById('addrTON').value.trim(),
      USDT: document.getElementById('addrUSDT').value.trim(),
      BTC:  document.getElementById('addrBTC').value.trim()
    }
  });
  btn.disabled = false;
  btn.textContent = 'Saved ✓';
  setTimeout(() => btn.textContent = 'Save Addresses', 2000);
});

// ── Contact form ──────────────────────────────────────────────────────
document.getElementById('contactForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  await saveMeta({
    contact_email:    document.getElementById('contactEmail').value.trim(),
    contact_telegram: document.getElementById('contactTelegram').value.trim()
  });
  btn.disabled = false;
  btn.textContent = 'Saved ✓';
  setTimeout(() => btn.textContent = 'Save Contact Info', 2000);
});

// ── Auth ──────────────────────────────────────────────────────────────
async function applySession() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) { loginCard.hidden = false; adminBody.hidden = true; return; }
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
  if (!profile?.is_admin) {
    loginCard.hidden = false; adminBody.hidden = true;
    loginHint.textContent = 'This account is not the casino owner.';
    await db.auth.signOut(); return;
  }
  loginCard.hidden = true;
  adminBody.hidden = false;
  await loadAll();
}

document.getElementById('adminLoginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await db.auth.signInWithPassword({
    email:    document.getElementById('adminEmail').value.trim(),
    password: document.getElementById('adminPassword').value
  });
  if (error) window.alert(errorText(error));
});

document.getElementById('adminLogout').addEventListener('click', () => db.auth.signOut());
db.auth.onAuthStateChange(() => applySession());

// Live updates for payment requests
db.channel('admin-sync')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests' }, () => {
    if (!adminBody.hidden) loadAll();
  }).subscribe();
