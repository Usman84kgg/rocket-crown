import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage, loadScript } from './helpers/dom.js';

const PAGES = ['home-page', 'casino-page', 'wallet-page', 'profile-page'];

function visiblePages() {
  return PAGES.filter((id) => document.getElementById(id).style.display === 'block');
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  document.body.innerHTML = '';
  loadPage('frontend/index.html');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loading screen', () => {
  it('stays up until the splash delay elapses', async () => {
    await loadScript('frontend/script.js');

    expect(document.getElementById('loading-screen').style.display).not.toBe('none');

    vi.advanceTimersByTime(2500);

    expect(document.getElementById('loading-screen').style.display).toBe('none');
    expect(document.getElementById('main-app').style.display).toBe('block');
  });
});

describe('balance ticker', () => {
  it('increments the displayed balance on every tick', async () => {
    await loadScript('frontend/script.js');
    const label = document.querySelector('.top-balance');

    vi.advanceTimersByTime(3000);
    expect(label.innerHTML).toBe('0.01 TON');

    vi.advanceTimersByTime(6000);
    expect(label.innerHTML).toBe('0.03 TON');
  });

  it('survives a missing balance element', async () => {
    document.querySelector('.top-balance')?.remove();
    await loadScript('frontend/script.js');

    expect(() => vi.advanceTimersByTime(3000)).not.toThrow();
  });
});

describe('showPage', () => {
  it('opens the home page by default', async () => {
    await loadScript('frontend/script.js');

    expect(visiblePages()).toEqual(['home-page']);
  });

  it.each(PAGES.map((id) => [id.replace('-page', ''), id]))(
    'shows only the %s page',
    async (page, id) => {
      const app = await loadScript('frontend/script.js');

      app.showPage(page);

      expect(visiblePages()).toEqual([id]);
    }
  );

  it('hides everything for an unknown page', async () => {
    const app = await loadScript('frontend/script.js');

    app.showPage('missing');

    expect(visiblePages()).toEqual([]);
  });
});
