import { LessThan } from 'typeorm';
import { OtpChallengesRepository } from './otp-challenges.repository';

const ID = '3f0c1a52-8e0e-4a53-9a4b-0f5a6a3e9c11';
const NOW = new Date('2026-10-07T10:00:00Z');

describe('OtpChallengesRepository', () => {
  let builder: Record<string, jest.Mock>;
  let typeorm: Record<string, jest.Mock>;
  let repository: OtpChallengesRepository;

  beforeEach(() => {
    builder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    };
    typeorm = {
      create: jest.fn((value: object) => ({ ...value })),
      save: jest.fn(async (value: object) => value),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => builder),
    };
    repository = new OtpChallengesRepository({ getRepository: () => typeorm } as never);
  });

  it('creates an entity, then saves it', async () => {
    await expect(repository.create({ purpose: 'LOGIN' })).resolves.toEqual({ purpose: 'LOGIN' });
    expect(typeorm.save).toHaveBeenCalledWith({ purpose: 'LOGIN' });
  });

  it('finds by id, but never asks the database about something that is not a uuid', async () => {
    typeorm.findOne.mockResolvedValue({ id: ID });

    await expect(repository.findById(ID)).resolves.toEqual({ id: ID });
    await expect(repository.findById("1' OR '1'='1")).resolves.toBeNull();
    await expect(repository.findById('')).resolves.toBeNull();
    expect(typeorm.findOne).toHaveBeenCalledTimes(1);
  });

  it('finds a challenge by the hash of its reset token', async () => {
    typeorm.findOne.mockResolvedValue({ id: ID });

    await repository.findByResetTokenHash('abc');

    expect(typeorm.findOne).toHaveBeenCalledWith({ where: { reset_token_hash: 'abc' } });
  });

  describe('countAttempt', () => {
    it('counts the guess in one conditional UPDATE and returns the row as it now stands', async () => {
      builder.execute.mockResolvedValue({ raw: [{ id: ID, attempts: 2 }] });

      await expect(repository.countAttempt(ID, 'LOGIN', 5, NOW)).resolves.toEqual({ id: ID, attempts: 2 });

      const [condition, params] = builder.where.mock.calls[0];
      expect(condition).toContain('consumed_at IS NULL');
      expect(condition).toContain('expires_at > :now');
      expect(condition).toContain('attempts < :max');
      expect(params).toEqual({ id: ID, purpose: 'LOGIN', now: NOW, max: 5 });
      expect(builder.returning).toHaveBeenCalledWith('*');
    });

    it('returns null when there was nothing to guess against', async () => {
      builder.execute.mockResolvedValue({ raw: [] });

      await expect(repository.countAttempt(ID, 'LOGIN', 5, NOW)).resolves.toBeNull();
    });
  });

  it('consumes a challenge once: true only when a row was changed', async () => {
    builder.execute.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });

    await expect(repository.consume(ID, NOW)).resolves.toBe(true);
    await expect(repository.consume(ID, NOW)).resolves.toBe(false);
    expect(builder.where.mock.calls[0][0]).toContain('consumed_at IS NULL');
  });

  it('gives up on a challenge by consuming it', async () => {
    await repository.invalidate(ID, NOW);

    expect(builder.set).toHaveBeenCalledWith({ consumed_at: NOW });
  });

  describe('replaceCode', () => {
    it('swaps the code, resets the guesses and counts the send, only for a live challenge under the limit', async () => {
      const expires = new Date('2026-10-07T10:05:00Z');

      await expect(repository.replaceCode(ID, 'LOGIN', 'hash', expires, NOW, 3)).resolves.toBe(true);

      const set = builder.set.mock.calls[0][0];
      expect(set).toMatchObject({ code_hash: 'hash', attempts: 0, last_sent_at: NOW, expires_at: expires });
      expect(set.sends()).toBe('sends + 1');
      const [condition, params] = builder.where.mock.calls[0];
      expect(condition).toContain('sends < :maxSends');
      expect(condition).toContain('consumed_at IS NULL');
      expect(params).toMatchObject({ maxSends: 3, purpose: 'LOGIN' });
    });

    it('is false when no row matched', async () => {
      builder.execute.mockResolvedValue({ affected: 0 });

      await expect(repository.replaceCode(ID, 'LOGIN', 'hash', NOW, NOW, 3)).resolves.toBe(false);
    });
  });

  it('attaches a reset token to a challenge', async () => {
    const expires = new Date('2026-10-07T10:10:00Z');

    await repository.setResetToken(ID, 'tokenhash', expires);

    expect(typeorm.update).toHaveBeenCalledWith({ id: ID }, { reset_token_hash: 'tokenhash', reset_expires_at: expires });
  });

  describe('redeemResetToken', () => {
    it('spends the token once, while it is valid, and returns the challenge', async () => {
      builder.execute.mockResolvedValue({ raw: [{ id: ID }] });

      await expect(repository.redeemResetToken('tokenhash', NOW)).resolves.toEqual({ id: ID });

      const [condition, params] = builder.where.mock.calls[0];
      expect(condition).toContain('reset_used_at IS NULL');
      expect(condition).toContain('reset_expires_at > :now');
      expect(params).toEqual({ tokenHash: 'tokenhash', now: NOW });
    });

    it('returns null for a token that is unknown, used or expired', async () => {
      builder.execute.mockResolvedValue({ raw: [] });

      await expect(repository.redeemResetToken('tokenhash', NOW)).resolves.toBeNull();
    });
  });

  it('deletes challenges that expired before a given time', async () => {
    await repository.deleteExpired(NOW);

    expect(typeorm.delete).toHaveBeenCalledWith({ expires_at: LessThan(NOW) });
  });
});
