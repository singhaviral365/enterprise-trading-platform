import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './index';

async function errorsFor(body: Partial<RegisterDto>): Promise<string[]> {
  const dto = plainToInstance(RegisterDto, { username: 'trader.one7', password: 'Tr@ding-Desk-2026', ...body });
  const errors = await validate(dto);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('RegisterDto', () => {
  it('accepts a valid username and a strong password', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it.each([
    ['tradingdesk2026!', 'capital letter'],
    ['TradingDesk!!!!', 'number'],
    ['TradingDesk2026', 'special symbol'],
  ])('rejects %p (missing a %s)', async (password, missing) => {
    const messages = await errorsFor({ password });
    expect(messages.join(' ')).toContain(missing);
  });

  it.each([
    ['trader.one', 'number'],
    ['traderone7', '. _ -'],
  ])('rejects the username %p (missing a %s)', async (username, missing) => {
    expect((await errorsFor({ username })).join(' ')).toContain(missing);
  });

  it('rejects a password shorter than 12 characters even if it has every character type', async () => {
    expect(await errorsFor({ password: 'Tr@de2026' })).not.toEqual([]);
  });

  it.each(['1trader.a', '.trader1', 'trader1.', 'trader..one1', 'trader_-one1', 'trader one1', 't1', 'trader.one', 'traderone1'])(
    'rejects the username %p',
    async (username) => {
      expect(await errorsFor({ username })).not.toEqual([]);
    },
  );

  it.each(['trader.one7', 'ann_thomas_123', 'e2e.user.1790746347041', 'Priya-Menon9', 'a_1'])(
    'accepts the username %p',
    async (username) => {
      expect(await errorsFor({ username })).toEqual([]);
    },
  );
});
