import * as crypto from 'crypto';
import {
  RefreshTokensRepository,
  RefreshTokensService,
} from './refresh-tokens.service';

type StoredRefreshToken = {
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
};

describe('RefreshTokensService', () => {
  const userId = '8f14e45f-ceea-4c1b-9d3b-1a2b3c4d5e6f';

  let service: RefreshTokensService;
  let storedTokens: StoredRefreshToken[];
  let repository: {
    create: jest.Mock;
    findByHash: jest.Mock;
    revokeByHash: jest.Mock;
    revokeAllForUser: jest.Mock;
  };

  beforeEach(() => {
    storedTokens = [];

    repository = {
      create: jest.fn(async (token: StoredRefreshToken) => {
        storedTokens.push({ ...token });
        return token;
      }),
      findByHash: jest.fn(async (tokenHash: string) => {
        return (
          storedTokens.find(
            (token) => token.token_hash === tokenHash && token.revoked_at === null,
          ) || null
        );
      }),
      revokeByHash: jest.fn(async (tokenHash: string) => {
        for (const token of storedTokens) {
          if (token.token_hash === tokenHash) {
            token.revoked_at = new Date();
          }
        }
      }),
      revokeAllForUser: jest.fn(async () => undefined),
    };

    service = new RefreshTokensService(
      repository as unknown as RefreshTokensRepository,
    );
  });

  it('stores refresh tokens as hashes, not plaintext tokens', async () => {
    const issued = await service.createRefreshToken(userId, 3600);

    expect(storedTokens).toHaveLength(1);
    const stored = storedTokens[0];
    const expectedHash = crypto
      .createHash('sha256')
      .update(issued.token)
      .digest('hex');

    expect(stored.token_hash).toBe(expectedHash);
    expect(stored.token_hash).not.toBe(issued.token);
    expect((stored as unknown as { token?: string }).token).toBeUndefined();
  });

  it('supports one-time-use semantics with rotation and revocation', async () => {
    const firstIssued = await service.createRefreshToken(userId, 3600);

    const firstUse = await service.verifyAndConsumeRefreshToken(firstIssued.token);
    expect(firstUse).toBe(userId);

    const replayUse = await service.verifyAndConsumeRefreshToken(firstIssued.token);
    expect(replayUse).toBeNull();

    const secondIssued = await service.createRefreshToken(userId, 3600);
    const secondUse = await service.verifyAndConsumeRefreshToken(secondIssued.token);
    expect(secondUse).toBe(userId);
  });

  it('rejects expired refresh tokens', async () => {
    const issued = await service.createRefreshToken(userId, -1);

    const result = await service.verifyAndConsumeRefreshToken(issued.token);
    expect(result).toBeNull();
  });
});

