const { db, formatMoney, errorText } = window.rocketCrown;

// ── Список криптовалют ────────────────────────────────────────────────
const CRYPTOS = [
  { key: 'TON',      name: 'TON',   net: 'Toncoin',       bonus: '+7%' },
  { key: 'USDT_TON', name: 'USDT',  net: 'Toncoin',       bonus: '+7%' },
  { key: 'USDT_TRC', name: 'USDT',  net: 'TRC20',         bonus: '+5%' },
  { key: 'USDT_BEP', name: 'USDT',  net: 'BEP20',         bonus: '+5%' },
  { key: 'USDT_SOL', name: 'USDT',  net: 'Solana',        bonus: '+5%' },
  { key: 'SOL',      name: 'SOL',   net: 'Solana',        bonus: '+5%' },
  { key: 'BTC',      name: 'BTC',   net: 'Bitcoin',       bonus: '+5%' },
  { key: 'ETH',      name: 'ETH',   net: 'Ethereum',      bonus: '+5%' },
  { key: 'BNB',      name: 'BNB',   net: 'Binance Chain', bonus: '+5%' },
  { key: 'LTC',      name: 'LTC',   net: 'Litecoin',      bonus: '+5%' },
  { key: 'TRX',      name: 'TRX',   net: 'Tron',          bonus: '+5%' },
  { key: 'DOGE',     name: 'DOGE',  net: 'Dogecoin',      bonus: '+5%' },
  { key: 'XRP',      name: 'XRP',   net: 'Ripple',        bonus: '+5%' },
];

// ── Состояние ─────────────────────────────────────────────────────────
let currentTab   = 'deposit';
let profile      = null;
let depositAddrs = {};

// ── Тост ─────────────────────────────────────────────────────────────
function showToast(msg, color = '#23293a') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color;
  t.style.display = 'block';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ── Переключение вкладок ──────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  ['deposit', 'withdraw', 'history'].forEach(t => {
    const panel = document.getElementById('panel' + t.charAt(0).toUpperCase() + t.slice(1));
    const btn   = document.getElementById('tab'   + t.charAt(0).toUpperCase() + t.slice(1));
    panel.style.display = t === tab ? '' : 'none';
    btn.classList.toggle('active-tab', t === tab);
    btn.style.color = t === tab ? '' : '#8e94a3';
  });
  if (tab === 'history') loadHistory();
}

// ── Загрузка данных ───────────────────────────────────────────────────
async function loadAll() {
  const { data: settings } = await db.from('casino_settings').select('games').maybeSingle();
  depositAddrs = settings?.games?._meta?.deposit_addresses || {};

  const { data: { user } } = await db.auth.getUser();
  if (user) {
    const { data } = await db.from('profiles').select('*').eq('id', user.id).maybeSingle();
    profile = data;
  }

  renderBalance();
  renderDepositGrid();
  renderWithdrawGrid();
}

// ── Баланс ────────────────────────────────────────────────────────────
function renderBalance() {
  const block = document.getElementById('balanceBlock');
  const amt   = document.getElementById('balanceAmount');
  if (profile) {
    block.style.display = '';
    amt.textContent = formatMoney(profile.balance);
  } else {
    block.style.display = 'none';
  }
}

// ── Сетка депозит ─────────────────────────────────────────────────────
function renderDepositGrid() {
  const grid = document.getElementById('depositGrid');
  grid.innerHTML = CRYPTOS.map(c => {
    const addr    = depositAddrs[c.key];
    const disabled = !addr;
    return `
      <div class="crypto-card"
           style="${disabled ? 'opacity:0.45;cursor:default;' : 'cursor:pointer;'}"
           ${disabled ? '' : `onclick="selectDeposit('${c.key}')"`}>
        <div>${c.name}</div>
        <div style="font-size:14px;color:#8e94a3;margin-top:4px;">${c.net}</div>
        <span>${disabled ? 'Скоро' : c.bonus}</span>
      </div>`;
  }).join('');
}

// ── Выбор криптовалюты для депозита ──────────────────────────────────
function selectDeposit(key) {
  if (!profile) { showToast('⚠️ Войдите в аккаунт', '#c0392b'); return; }
  const c    = CRYPTOS.find(x => x.key === key);
  const addr = depositAddrs[key] || '';
  const block = document.getElementById('depositDetail');

  block.style.display = '';
  block.innerHTML = `
    <div style="font-size:22px;font-weight:bold;margin-bottom:14px;">${c.name} · ${c.net}</div>
    <div style="font-size:13px;color:#8e94a3;margin-bottom:6px;">Адрес для пополнения:</div>
    <div style="background:#0d1120;border-radius:14px;padding:14px;word-break:break-all;font-size:14px;margin-bottom:10px;">${addr}</div>
    <button onclick="copyAddr('${addr}')"
      style="width:100%;padding:14px;border-radius:14px;background:#2f7dff;color:white;border:none;font-size:16px;font-weight:bold;cursor:pointer;margin-bottom:16px;">
      📋 Копировать адрес
    </button>
    <div style="font-size:13px;color:#8e94a3;margin-bottom:16px;">После отправки создайте запрос. Обработка: 5–15 минут.</div>
    <div style="font-size:15px;font-weight:bold;margin-bottom:10px;">Сумма депозита (USD):</div>
    <input id="depAmount" type="number" min="1" step="1" placeholder="Введите сумму в $"
      style="width:100%;box-sizing:border-box;padding:14px;border-radius:14px;background:#0d1120;border:1px solid #2a3042;color:white;font-size:16px;margin-bottom:12px;" />
    <button onclick="submitDeposit('${key}')"
      style="width:100%;padding:14px;border-radius:14px;background:#27ae60;color:white;border:none;font-size:16px;font-weight:bold;cursor:pointer;">
      📥 Запросить депозит
    </button>
  `;
  block.scrollIntoView({ behavior: 'smooth' });
}

function copyAddr(addr) {
  navigator.clipboard.writeText(addr)
    .then(() => showToast('✅ Адрес скопирован!', '#27ae60'))
    .catch(() => showToast('Не удалось скопировать', '#c0392b'));
}

async function submitDeposit(key) {
  if (!profile) { showToast('⚠️ Войдите в аккаунт', '#c0392b'); return; }
  const amount = Number(document.getElementById('depAmount').value);
  if (!amount || amount < 1) { showToast('Введите корректную сумму', '#c0392b'); return; }
  const { error } = await db.from('payment_requests').insert({ user_id: profile.id, kind: 'deposit', amount, method: key });
  if (error) { showToast('Ошибка: ' + errorText(error), '#c0392b'); return; }
  showToast('✅ Запрос создан! Обработка 5–15 минут.', '#27ae60');
  document.getElementById('depAmount').value = '';
}

// ── Сетка вывод ───────────────────────────────────────────────────────
function renderWithdrawGrid() {
  const grid = document.getElementById('withdrawGrid');
  grid.innerHTML = CRYPTOS.map(c => `
    <div class="crypto-card" style="cursor:pointer;" onclick="selectWithdraw('${c.key}')">
      <div>${c.name}</div>
      <div style="font-size:14px;color:#8e94a3;margin-top:4px;">${c.net}</div>
      <span style="background:#151a25;color:#8e94a3;">Вывод</span>
    </div>`
  ).join('');
}

// ── Выбор криптовалюты для вывода ─────────────────────────────────────
function selectWithdraw(key) {
  if (!profile) { showToast('⚠️ Войдите в аккаунт', '#c0392b'); return; }
  const c     = CRYPTOS.find(x => x.key === key);
  const block = document.getElementById('withdrawDetail');
  block.style.display = '';
  block.innerHTML = `
    <div style="font-size:22px;font-weight:bold;margin-bottom:6px;">${c.name} · ${c.net}</div>
    <div style="font-size:14px;color:#8e94a3;margin-bottom:16px;">
      Доступно: <strong style="color:white;">${formatMoney(profile.balance)}</strong>
    </div>
    <div style="font-size:15px;font-weight:bold;margin-bottom:10px;">Адрес вашего кошелька:</div>
    <input id="wdAddress" type="text" placeholder="Введите адрес"
      style="width:100%;box-sizing:border-box;padding:14px;border-radius:14px;background:#0d1120;border:1px solid #2a3042;color:white;font-size:14px;margin-bottom:12px;" />
    <div style="font-size:15px;font-weight:bold;margin-bottom:10px;">Сумма вывода (USD):</div>
    <input id="wdAmount" type="number" min="10" step="1" placeholder="Минимум $10"
      style="width:100%;box-sizing:border-box;padding:14px;border-radius:14px;background:#0d1120;border:1px solid #2a3042;color:white;font-size:16px;margin-bottom:12px;" />
    <button onclick="submitWithdraw('${key}')"
      style="width:100%;padding:14px;border-radius:14px;background:#e67e22;color:white;border:none;font-size:16px;font-weight:bold;cursor:pointer;">
      ⬆ Вывести
    </button>
  `;
  block.scrollIntoView({ behavior: 'smooth' });
}

async function submitWithdraw(key) {
  if (!profile) { showToast('⚠️ Войдите в аккаунт', '#c0392b'); return; }
  const address = document.getElementById('wdAddress').value.trim();
  const amount  = Number(document.getElementById('wdAmount').value);
  if (!address)           { showToast('Введите адрес кошелька', '#c0392b'); return; }
  if (!amount || amount < 10) { showToast('Минимум $10', '#c0392b'); return; }
  if (amount > profile.balance) { showToast('Недостаточно средств', '#c0392b'); return; }
  const { error } = await db.from('payment_requests').insert({ user_id: profile.id, kind: 'withdraw', amount, method: key, address });
  if (error) { showToast('Ошибка: ' + errorText(error), '#c0392b'); return; }
  showToast('✅ Запрос на вывод создан!', '#27ae60');
  document.getElementById('wdAddress').value = '';
  document.getElementById('wdAmount').value  = '';
}

// ── История ───────────────────────────────────────────────────────────
async function loadHistory() {
  const list = document.getElementById('historyList');
  list.innerHTML = '<p style="color:#8e94a3;text-align:center;padding:20px;">Загрузка...</p>';
  if (!profile) {
    list.innerHTML = '<p style="color:#8e94a3;text-align:center;padding:20px;">Войдите в аккаунт.</p>';
    return;
  }
  const { data } = await db.from('payment_requests').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(30);
  if (!data?.length) {
    list.innerHTML = '<p style="color:#8e94a3;text-align:center;padding:20px;">История пуста.</p>';
    return;
  }
  const statusLabel = { pending: '⏳ Обрабатывается', approved: '✅ Выполнено', rejected: '❌ Отклонено' };
  const statusColor = { pending: '#f39c12',            approved: '#27ae60',      rejected: '#c0392b' };
  list.innerHTML = data.map(r => `
    <div style="background:#151a25;border-radius:18px;padding:18px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:18px;font-weight:bold;">${r.kind === 'deposit' ? '⬇ Депозит' : '⬆ Вывод'}</div>
          <div style="font-size:13px;color:#8e94a3;margin-top:4px;">${r.method || '—'}</div>
          <div style="font-size:12px;color:#8e94a3;margin-top:2px;">${new Date(r.created_at).toLocaleString('ru-RU')}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px;font-weight:bold;">${formatMoney(r.amount)}</div>
          <div style="font-size:13px;color:${statusColor[r.status] || '#8e94a3'};margin-top:4px;">${statusLabel[r.status] || r.status}</div>
        </div>
      </div>
      ${r.address ? `<div style="font-size:12px;color:#8e94a3;margin-top:8px;word-break:break-all;">Адрес: ${r.address}</div>` : ''}
    </div>
  `).join('');
}

// ── Realtime ──────────────────────────────────────────────────────────
function watchProfile() {
  if (!profile) return;
  db.channel('wallet-sync')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
      payload => { profile = payload.new; renderBalance(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_requests', filter: `user_id=eq.${profile.id}` },
      () => { if (currentTab === 'history') loadHistory(); })
    .subscribe();
}

// ── Старт ─────────────────────────────────────────────────────────────
db.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    const { data } = await db.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    profile = data;
    renderBalance();
    watchProfile();
  } else {
    profile = null;
    renderBalance();
  }
});

loadAll();