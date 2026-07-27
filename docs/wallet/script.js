const cryptoData = {
  TON:        { name: 'TON',  network: 'Toncoin',       address: '' },
  USDT_TON:   { name: 'USDT', network: 'Toncoin',       address: '' },
  USDT_TRC20: { name: 'USDT', network: 'TRC20',         address: '' },
  USDT_BEP20: { name: 'USDT', network: 'BEP20',         address: '' },
  SOL:        { name: 'SOL',  network: 'Solana',        address: '' },
  USDT_SOL:   { name: 'USDT', network: 'Solana',        address: '' },
  USDC_BEP20: { name: 'USDC', network: 'BEP20',         address: '' },
  LTC:        { name: 'LTC',  network: 'Litecoin',      address: '' },
  BNB:        { name: 'BNB',  network: 'Binance Chain', address: '' },
};

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[data-tab="' + tab + '"]').classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
}

function selectCrypto(el, key) {
  document.querySelectorAll('#tab-deposit .crypto-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const data = cryptoData[key];
  document.getElementById('modal-title').textContent = data.name;
  document.getElementById('modal-network').textContent = data.network;
  document.getElementById('modal-address').textContent = data.address || 'Адрес не настроен администратором';
  document.getElementById('modal-coin-hint').textContent = data.name + ' (' + data.network + ')';
  const icon = el.querySelector('.crypto-icon').cloneNode(true);
  const iconEl = document.getElementById('modal-icon');
  iconEl.innerHTML = icon.innerHTML;
  iconEl.className = icon.className;
  document.getElementById('deposit-modal').classList.remove('hidden');
}

function selectWithdraw(el, key) {
  document.querySelectorAll('#tab-withdraw .crypto-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  const data = cryptoData[key];
  document.getElementById('wd-title').textContent = data.name;
  document.getElementById('wd-network').textContent = data.network;
  const icon = el.querySelector('.crypto-icon').cloneNode(true);
  const iconEl = document.getElementById('wd-icon');
  iconEl.innerHTML = icon.innerHTML;
  iconEl.className = icon.className;
  document.getElementById('withdraw-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('deposit-modal').classList.add('hidden');
}

function closeWithdrawModal() {
  document.getElementById('withdraw-modal').classList.add('hidden');
}

function copyAddress() {
  const addr = document.getElementById('modal-address').textContent;
  if (addr && addr !== 'Адрес не настроен администратором') {
    navigator.clipboard.writeText(addr).then(() => showToast('Адрес скопирован'));
  } else {
    showToast('Адрес ещё не настроен');
  }
}

function submitWithdraw() {
  const address = document.getElementById('wd-address').value.trim();
  const amount = parseFloat(document.getElementById('wd-amount').value);
  if (!address) { showToast('Введите адрес кошелька'); return; }
  if (!amount || amount < 10) { showToast('Минимальная сумма вывода $10'); return; }
  showToast('Заявка на вывод отправлена');
  closeWithdrawModal();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2500);
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeModal(); closeWithdrawModal(); }
});