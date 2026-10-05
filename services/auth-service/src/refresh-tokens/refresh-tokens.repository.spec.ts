import { IsNull, LessThan } from 'typeorm';
import { Logger } from '@nestjs/common';
import { RefreshTokensRepository, RefreshTokensService } from './refresh-tokens.service';

describe('RefreshTokensRepository', () => {
  let typeorm: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; update: jest.Mock; delete: jest.Mock };
  let repository: RefreshTokensRepository;

  beforeEach(() => {
    typeorm = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    repository = new RefreshTokensRepository({ getRepository: () => typeorm } as never);
  });

  it('creates an entity, then saves it', async () => {
    typeorm.create.mockReturnValue({ user_id: 1 });
    typeorm.save.mockResolvedValue({ id: 9, user_id: 1 });

    await expect(repository.create({ user_id: 1 })).resolves.toEqual({ id: 9, user_id: 1 });
    expect(typeorm.save).toHaveBeenCalledWith({ user_id: 1 });
  });

  it('finds only a token that has not been revoked, by its hash', async () => {
    typeorm.findOne.mockResolvedValue({ id: 9 });

    await repository.findByHash('abc');

    expect(typeorm.findOne).toHaveBeenCalledWith({
      where: { token_hash: 'abc', revoked_at: IsNull() },
      relations: ['user'],
    });
  });

  it('revokes one token by hash, stamping the time', async () => {
    await repository.revokeByHash('abc');

    expect(typeorm.update).toHaveBeenCalledWith({ token_hash: 'abc' }, { revoked_at: expect.any(Date) });
  });

  it('revokes every token of a user', async () => {
    await repository.revokeAllForUser(12);

    expect(typeorm.update).toHaveBeenCalledWith({ user_id: 12 }, { revoked_at: expect.any(Date) });
  });

  it('deletes tokens that have expired', async () => {
    await repository.deleteExpired();

    expect(typeorm.delete).toHaveBeenCalledWith({ expires_at: LessThan(expect.any(Date)) });
  });
});

describe('RefreshTokensService theft handling', () => {
  it('revokes all of a user\'s refresh tokens and logs a warning', async () => {
    const revokeAllForUser = jest.fn().mockResolvedValue(undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new RefreshTokensService({ revokeAllForUser } as unknown as RefreshTokensRepository);

    await service.detectTheftAndRevoke(12);

    expect(revokeAllForUser).toHaveBeenCalledWith(12);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('12'));
    warn.mockRestore();
  });
});
