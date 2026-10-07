import { AuthService } from './auth.service';
import { PasswordReuseException, UnauthorisedException, ValidationFailedException } from '../common/exceptions';

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

const USER = { id: 1010, username: 'singh_aviral365', email: 'a@b.co', password_hash: 'old-hash', roles: ['CUSTOMER'] };

describe('AuthService password reset support', () => {
  let usersRepository: { findById: jest.Mock; findByUsername: jest.Mock; updatePasswordHash: jest.Mock };
  let credentialsService: { hashPassword: jest.Mock; verifyPassword: jest.Mock };
  let refreshTokensService: { createRefreshToken: jest.Mock; revokeAllForUser: jest.Mock };
  let jwtService: { sign: jest.Mock };
  let service: AuthService;
  const logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'unit-test-secret';
    usersRepository = {
      findById: jest.fn().mockResolvedValue(USER),
      findByUsername: jest.fn().mockResolvedValue(USER),
      updatePasswordHash: jest.fn().mockResolvedValue(undefined),
    };
    credentialsService = {
      hashPassword: jest.fn().mockResolvedValue('new-hash'),
      verifyPassword: jest.fn().mockResolvedValue(false),
    };
    refreshTokensService = {
      createRefreshToken: jest.fn().mockResolvedValue({ token: 'refresh', expiresAt: new Date() }),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = { sign: jest.fn().mockReturnValue('access.jwt') };
    service = new AuthService(
      {} as never,
      usersRepository as never,
      credentialsService as never,
      refreshTokensService as never,
      jwtService as never,
      logger as never,
      { isBlocked: jest.fn().mockReturnValue(false), recordFailure: jest.fn(), reset: jest.fn() } as never,
    );
  });

  describe('setNewPassword', () => {
    it('hashes and stores the new password, and ends every session', async () => {
      await service.setNewPassword(1010, 'N3w!Password#1');

      expect(credentialsService.hashPassword).toHaveBeenCalledWith('N3w!Password#1');
      expect(usersRepository.updatePasswordHash).toHaveBeenCalledWith(1010, 'new-hash');
      expect(refreshTokensService.revokeAllForUser).toHaveBeenCalledWith(1010);
    });

    it('refuses the current password, before anything is hashed or stored', async () => {
      credentialsService.verifyPassword.mockResolvedValue(true);

      await expect(service.setNewPassword(1010, 'Old!Password#1')).rejects.toBeInstanceOf(PasswordReuseException);
      expect(credentialsService.verifyPassword).toHaveBeenCalledWith('Old!Password#1', 'old-hash');
      expect(credentialsService.hashPassword).not.toHaveBeenCalled();
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
      expect(refreshTokensService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('refuses a password that is the username, whatever its case', async () => {
      await expect(service.setNewPassword(1010, ' SINGH_aviral365 ')).rejects.toBeInstanceOf(
        ValidationFailedException,
      );
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('refuses a user that no longer exists', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.setNewPassword(1010, 'N3w!Password#1')).rejects.toBeInstanceOf(UnauthorisedException);
    });

    it('runs the caller hook after the checks and before anything is stored', async () => {
      const order: string[] = [];
      credentialsService.hashPassword.mockImplementation(async () => {
        order.push('hash');
        return 'new-hash';
      });

      await service.setNewPassword(1010, 'N3w!Password#1', async () => {
        order.push('hook');
      });

      expect(order).toEqual(['hook', 'hash']);
    });

    it('stores nothing when the hook (spending the token) fails', async () => {
      await expect(
        service.setNewPassword(1010, 'N3w!Password#1', async () => {
          throw new Error('token already used');
        }),
      ).rejects.toThrow('token already used');
      expect(usersRepository.updatePasswordHash).not.toHaveBeenCalled();
    });
  });
});
