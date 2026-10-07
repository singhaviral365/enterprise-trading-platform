import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto, ResendCodeDto, ResetPasswordDto, VerifyCodeDto } from './index';

const CHALLENGE_ID = '3f0c1a52-8e0e-4a53-9a4b-0f5a6a3e9c11';

async function errorsFor<T extends object>(type: new () => T, plain: object): Promise<string[]> {
  const errors = await validate(plainToInstance(type, plain));
  return errors.map((error) => error.property);
}

describe('VerifyCodeDto', () => {
  it('accepts a challenge id and six digits', async () => {
    expect(await errorsFor(VerifyCodeDto, { challengeId: CHALLENGE_ID, code: '012345' })).toEqual([]);
  });

  it.each(['12345', '1234567', 'abcdef', '12 345', '', '１２３４５６'])('rejects the code "%s"', async (code) => {
    expect(await errorsFor(VerifyCodeDto, { challengeId: CHALLENGE_ID, code })).toEqual(['code']);
  });

  it('rejects an id that is not a uuid', async () => {
    expect(await errorsFor(VerifyCodeDto, { challengeId: '1; DROP TABLE users', code: '123456' })).toEqual(['challengeId']);
  });
});

describe('ResendCodeDto', () => {
  it('needs a uuid', async () => {
    expect(await errorsFor(ResendCodeDto, { challengeId: CHALLENGE_ID })).toEqual([]);
    expect(await errorsFor(ResendCodeDto, { challengeId: 'nope' })).toEqual(['challengeId']);
  });
});

describe('ForgotPasswordDto', () => {
  it('needs a username and a well-formed email', async () => {
    expect(await errorsFor(ForgotPasswordDto, { username: 'alice.trader1', email: 'a@b.co' })).toEqual([]);
    expect(await errorsFor(ForgotPasswordDto, { username: 'alice.trader1', email: 'not-an-email' })).toEqual(['email']);
    expect(await errorsFor(ForgotPasswordDto, { username: 'x'.repeat(65), email: 'a@b.co' })).toEqual(['username']);
    expect((await errorsFor(ForgotPasswordDto, {})).sort()).toEqual(['email', 'username']);
  });
});

describe('ResetPasswordDto', () => {
  const token = 'a'.repeat(64);

  it('accepts a password that follows the registration rules', async () => {
    expect(await errorsFor(ResetPasswordDto, { resetToken: token, newPassword: 'N3w!Password#1' })).toEqual([]);
  });

  it.each([
    ['too short', 'N3w!Pass'],
    ['no capital letter', 'n3w!password#1'],
    ['no number', 'New!Password#xx'],
    ['no special symbol', 'New1Password2xx'],
    ['too long', `N3w!${'a'.repeat(130)}`],
  ])('rejects a password with %s', async (_name, newPassword) => {
    expect(await errorsFor(ResetPasswordDto, { resetToken: token, newPassword })).toEqual(['newPassword']);
  });

  it('rejects a missing or implausible reset token', async () => {
    expect(await errorsFor(ResetPasswordDto, { newPassword: 'N3w!Password#1' })).toEqual(['resetToken']);
    expect(await errorsFor(ResetPasswordDto, { resetToken: 'short', newPassword: 'N3w!Password#1' })).toEqual(['resetToken']);
  });
});
