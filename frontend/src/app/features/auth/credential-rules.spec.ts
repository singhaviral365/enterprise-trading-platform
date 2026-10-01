import { passwordRules, usernameProblem } from './credential-rules';

const unmet = (password: string, username = 'trader.one') =>
  passwordRules(password, username)
    .filter((rule) => !rule.met)
    .map((rule) => rule.id);

describe('credential rules', () => {
  it('accepts a strong password', () => {
    expect(unmet('Tr@ding-Desk-2026')).toEqual([]);
  });

  it.each([
    ['tr@ding-desk-2026', ['upper']],
    ['Tr@ding-Desk-Now', ['digit']],
    ['TradingDesk2026', ['symbol']],
    ['Tr@de2026', ['length']],
    ['', ['length', 'upper', 'digit', 'symbol', 'different']],
  ])('flags %p as missing %p', (password, expected) => {
    expect(unmet(password)).toEqual(expected);
  });

  it('flags a password equal to the username, ignoring case', () => {
    expect(unmet('Trader.One.2026!', 'trader.one.2026!')).toEqual(['different']);
  });

  it.each([
    ['1trader', 'Username must start with a letter.'],
    ['trader one', 'Use only letters, numbers, dots, underscores and hyphens.'],
    ['trader..one', "Dots, underscores and hyphens can't be next to each other."],
    ['trader.', "Username can't end with a dot, underscore or hyphen."],
  ])('explains why %p is not a valid username', (username, message) => {
    expect(usernameProblem(username)).toBe(message);
  });

  it.each(['trader.one7', 'ann_thomas_123', 'Priya-Menon9', 'a_1'])('accepts the username %p', (username) => {
    expect(usernameProblem(username)).toBe('');
  });
});
