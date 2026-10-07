import { AuthService } from './auth.service';
import { UsersRepository, UsersService } from '../users/users.service';
import { CredentialsService } from '../credentials/credentials.service';
import { RefreshTokensService } from '../refresh-tokens/refresh-tokens.service';
import { RedactingLogger } from '../common/logging/redacting.logger';
import { RegistrationFailedException, UnauthorisedException, ValidationFailedException } from '../common/exceptions';
import { LoginThrottleService } from './login-throttle.service';

jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));

describe('AuthService registration and profile', () => {
  const created = new Date('2026-10-01T10:00:00Z');
  let usersService: { createUser: jest.Mock };
  let usersRepository: { usernameExists: jest.Mock; emailExists: jest.Mock; findById: jest.Mock };
  let credentialsService: { hashPassword: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; debug: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      createUser: jest.fn().mockResolvedValue({
        id: 1000,
        username: 'alice.trader1',
        email: 'alice@example.com',
        roles: ['CUSTOMER'],
        created_on: created,
        password_hash: 'must-never-be-returned',
      }),
    };
    usersRepository = {
      usernameExists: jest.fn().mockResolvedValue(false),
      emailExists: jest.fn().mockResolvedValue(false),
      findById: jest.fn(),
    };
    credentialsService = { hashPassword: jest.fn().mockResolvedValue('$argon2id$hash') };
    logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    service = new AuthService(
      usersService as unknown as UsersService,
      usersRepository as unknown as UsersRepository,
      credentialsService as unknown as CredentialsService,
      {} as RefreshTokensService,
      {} as never,
      logger as unknown as RedactingLogger,
      {} as LoginThrottleService,
    );
  });

  describe('register', () => {
    it('hashes the password, creates a CUSTOMER and returns the profile without the hash', async () => {
      const result = await service.register('alice.trader1', 'Str0ng!Password#', 'alice@example.com');

      expect(credentialsService.hashPassword).toHaveBeenCalledWith('Str0ng!Password#');
      expect(usersService.createUser).toHaveBeenCalledWith('alice.trader1', '$argon2id$hash', ['CUSTOMER'], 'alice@example.com');
      expect(result).toEqual({
        id: 1000,
        username: 'alice.trader1',
        email: 'alice@example.com',
        roles: ['CUSTOMER'],
        createdOn: created,
        twoFactorEnabled: false,
      });
      expect(JSON.stringify(logger.log.mock.calls)).not.toContain('Str0ng');
    });

    it('does not check the email when none is given', async () => {
      await service.register('alice.trader1', 'Str0ng!Password#');

      expect(usersRepository.emailExists).not.toHaveBeenCalled();
    });

    it('rejects a password that is the username, whatever the case or padding', async () => {
      await expect(service.register('alice.trader1', '  ALICE.TRADER1 ')).rejects.toBeInstanceOf(ValidationFailedException);
      expect(usersService.createUser).not.toHaveBeenCalled();
    });

    it('answers a taken username with the same generic failure as a taken email', async () => {
      usersRepository.usernameExists.mockResolvedValue(true);
      await expect(service.register('alice.trader1', 'Str0ng!Password#')).rejects.toBeInstanceOf(RegistrationFailedException);

      usersRepository.usernameExists.mockResolvedValue(false);
      usersRepository.emailExists.mockResolvedValue(true);
      await expect(service.register('alice.trader1', 'Str0ng!Password#', 'a@b.co')).rejects.toBeInstanceOf(
        RegistrationFailedException,
      );
      expect(credentialsService.hashPassword).not.toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    it('returns the profile of a known user', async () => {
      usersRepository.findById.mockResolvedValue({
        id: 1000,
        username: 'alice.trader1',
        email: 'alice@example.com',
        roles: ['CUSTOMER'],
        created_on: created,
        password_hash: 'secret',
      });

      const profile = await service.getUser(1000);

      expect(profile).toMatchObject({ id: 1000, username: 'alice.trader1', createdOn: created });
      expect(profile).not.toHaveProperty('password_hash');
    });

    it('answers AUTH-401 for an id that no longer exists', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.getUser(1)).rejects.toBeInstanceOf(UnauthorisedException);
    });
  });
});
