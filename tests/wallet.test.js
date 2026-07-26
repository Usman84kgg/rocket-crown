import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadScript } from './helpers/dom.js';

let log;

beforeEach(() => {
  vi.resetModules();
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('wallet assets', () => {
  it('starts with every supported coin at zero', async () => {
    const wallet = await loadScript('docs/wallet/script.js');

    expect(Object.keys(wallet.walletAssets)).toEqual([
      'USDT',
      'TON',
      'BTC',
      'ETH',
      'TRX',
      'SOL',
      'BNB',
      'DOGE',
      'XRP',
      'LTC'
    ]);
    expect(Object.values(wallet.walletAssets).every((amount) => amount === 0)).toBe(true);
    expect(wallet.totalBalanceUSD).toBe(0);
  });

  it('prices every asset and pegs USDT to one dollar', async () => {
    const wallet = await loadScript('docs/wallet/script.js');

    expect(Object.keys(wallet.cryptoPrices)).toEqual(Object.keys(wallet.walletAssets));
    expect(wallet.cryptoPrices.USDT).toBe(1);
  });
});

describe('updateBalance', () => {
  it('reports zero for an empty wallet', async () => {
    const wallet = await loadScript('docs/wallet/script.js');

    wallet.updateBalance();

    expect(log).toHaveBeenCalledWith('TOTAL USD =', 0);
  });

  it('sums holdings against their prices', async () => {
    const wallet = await loadScript('docs/wallet/script.js');
    wallet.walletAssets.USDT = 25;
    wallet.walletAssets.TON = 10;
    wallet.cryptoPrices.TON = 5.5;

    wallet.updateBalance();

    expect(log).toHaveBeenCalledWith('TOTAL USD =', 80);
  });

  it('recomputes from scratch instead of accumulating', async () => {
    const wallet = await loadScript('docs/wallet/script.js');
    wallet.walletAssets.USDT = 40;

    wallet.updateBalance();
    wallet.walletAssets.USDT = 10;
    wallet.updateBalance();

    expect(log).toHaveBeenLastCalledWith('TOTAL USD =', 10);
  });

  it('ignores holdings that have no price yet', async () => {
    const wallet = await loadScript('docs/wallet/script.js');
    wallet.walletAssets.BTC = 3;

    wallet.updateBalance();

    expect(log).toHaveBeenCalledWith('TOTAL USD =', 0);
  });
});

describe('wallet operation stubs', () => {
  it.each([
    ['depositCrypto', 'Deposit System Ready'],
    ['withdrawCrypto', 'Withdraw System Ready'],
    ['transactionHistory', 'History System Ready'],
    ['updateCryptoPrices', 'Crypto API Ready'],
    ['connectTelegramWallet', 'Telegram Wallet Ready'],
    ['connectTONWallet', 'TON Connect Ready']
  ])('%s announces that it is ready', async (name, message) => {
    const wallet = await loadScript('docs/wallet/script.js');

    expect(wallet[name]()).toBeUndefined();
    expect(log).toHaveBeenCalledWith(message);
  });
});
