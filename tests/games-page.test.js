import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPage, loadScript } from './helpers/dom.js';

let alertSpy;

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  alertSpy = vi.fn();
  vi.stubGlobal('alert', alertSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function search(term) {
  const input = document.querySelector('input');
  input.value = term;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function visibleCards() {
  return [...document.querySelectorAll('.game-card')].filter((card) => card.style.display !== 'none');
}

describe('game search', () => {
  beforeEach(() => {
    loadPage('docs/games/index.html');
  });

  it('keeps every card visible for an empty query', async () => {
    await loadScript('docs/games/script.js');
    search('');

    expect(visibleCards()).toHaveLength(document.querySelectorAll('.game-card').length);
  });

  it('matches case insensitively', async () => {
    await loadScript('docs/games/script.js');
    search('MiNeS');

    const visible = visibleCards();
    expect(visible).toHaveLength(1);
    expect(visible[0].innerText).toContain('Mines');
  });

  it('matches partial names across sections', async () => {
    await loadScript('docs/games/script.js');
    search('black');

    expect(visibleCards().map((card) => card.innerText.trim())).toEqual(['🃏 Blackjack', 'Blackjack']);
  });

  it('hides everything when nothing matches', async () => {
    await loadScript('docs/games/script.js');
    search('no-such-game');

    expect(visibleCards()).toHaveLength(0);
  });

  it('restores hidden cards when the query is cleared', async () => {
    await loadScript('docs/games/script.js');
    search('dice');
    const matched = visibleCards().length;
    search('');

    expect(matched).toBeGreaterThan(0);
    expect(visibleCards().length).toBeGreaterThan(matched);
  });
});

describe('game cards', () => {
  it('announces that a tapped game is coming soon', async () => {
    loadPage('docs/games/index.html');
    await loadScript('docs/games/script.js');

    document.querySelectorAll('.game-card')[0].click();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toContain('Coming Soon!');
  });
});

describe('pages without the search box', () => {
  it('loads without touching a missing input', async () => {
    document.body.innerHTML = '<div class="game-card">Dice</div>';

    await expect(loadScript('docs/games/script.js')).resolves.toBeDefined();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
