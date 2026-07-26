/* Single source of truth for the casino games: presentation, bet options and round results. */
const verdict = (won) => (won ? 'You won.' : 'You lost.');

const GAME_CATALOG = [
  {
    key: 'mines',
    name: 'Mines',
    art: 'assets/games/mines.png',
    choiceLabel: 'Choose safe / risky',
    choices: [
      { value: 'safe', label: 'Safe' },
      { value: 'risky', label: 'Risky' }
    ],
    resolve(amount) {
      const won = RCUtil.randomInt(0, 1) === 1;
      return { won, payout: won ? amount * 1.9 : 0, message: won ? 'Safe step. You won.' : 'Mine exploded. You lost.' };
    }
  },
  {
    key: 'crash',
    name: 'Crash',
    art: 'assets/games/crash.png',
    choiceLabel: 'Multiplier target',
    choices: [
      { value: '1.5', label: '1.5x' },
      { value: '2.0', label: '2.0x' },
      { value: '3.0', label: '3.0x' }
    ],
    resolve(amount, choice) {
      const multiplier = (1 + RCUtil.randomInt(1, 30) / 10).toFixed(1);
      const won = Number(multiplier) >= Number(choice);
      return { won, payout: won ? amount * Number(multiplier) : 0, message: `Crash multiplier ${multiplier}x. ${verdict(won)}` };
    }
  },
  {
    key: 'dice',
    name: 'Dice',
    art: 'assets/games/dice.png',
    choiceLabel: 'Bet on',
    choices: [
      { value: 'high', label: 'High (4-6)' },
      { value: 'low', label: 'Low (1-3)' }
    ],
    resolve(amount, choice) {
      const roll = RCUtil.randomInt(1, 6);
      const won = choice === 'high' ? roll >= 4 : roll <= 3;
      return { won, payout: won ? amount * 1.85 : 0, message: `Dice rolled ${roll}. ${verdict(won)}` };
    }
  },
  {
    key: 'roulette',
    name: 'Roulette',
    art: 'assets/games/roulette.png',
    choiceLabel: 'Color',
    choices: [
      { value: 'red', label: 'Red' },
      { value: 'black', label: 'Black' },
      { value: 'green', label: 'Green' }
    ],
    resolve(amount, choice) {
      const pick = ['red', 'black', 'green'][RCUtil.randomInt(0, 2)];
      const won = choice === pick;
      const multiplier = choice === 'green' ? 8 : 1.9;
      return { won, payout: won ? amount * multiplier : 0, message: `Roulette landed on ${pick}. ${verdict(won)}` };
    }
  },
  {
    key: 'coinflip',
    name: 'Coinflip',
    art: 'assets/games/coinflip.png',
    choiceLabel: 'Pick side',
    choices: [
      { value: 'heads', label: 'Heads' },
      { value: 'tails', label: 'Tails' }
    ],
    resolve(amount, choice) {
      const flip = RCUtil.randomInt(0, 1) === 0 ? 'heads' : 'tails';
      const won = flip === choice;
      return { won, payout: won ? amount * 1.95 : 0, message: `Coin landed ${flip}. ${verdict(won)}` };
    }
  },
  {
    key: 'plinko',
    name: 'Plinko',
    art: 'assets/games/mines.png',
    choiceLabel: 'Drop path',
    choices: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' }
    ],
    resolve(amount) {
      const won = RCUtil.randomInt(0, 1) === 0;
      return {
        won,
        payout: won ? amount * 2 : 0,
        message: won ? 'Plinko dropped into a win pocket.' : 'Plinko dropped into a losing pocket.'
      };
    }
  }
];

const GAMES_BY_KEY = Object.fromEntries(GAME_CATALOG.map((game) => [game.key, game]));

function gameFormMarkup(gameKey) {
  const game = GAMES_BY_KEY[gameKey];
  const options = (game?.choices || [])
    .map((choice) => `<option value="${choice.value}">${choice.label}</option>`)
    .join('');
  const choiceField = game
    ? `<label>${game.choiceLabel}
        <select name="choice">
          ${options}
        </select>
      </label>`
    : '';

  return `
    <form id="gameForm" class="game-form">
      <label>Stake
        <input type="number" name="amount" min="10" step="10" placeholder="Amount" required />
      </label>
      ${choiceField}<button type="submit">Play</button>
    </form>
  `;
}
