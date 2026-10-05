import { UsersRepository, UsersService } from './users.service';

describe('UsersRepository', () => {
  let typeorm: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let repository: UsersRepository;

  beforeEach(() => {
    typeorm = { create: jest.fn(), save: jest.fn(), findOne: jest.fn() };
    repository = new UsersRepository({ getRepository: () => typeorm } as never);
  });

  it('creates an entity, then saves it', async () => {
    typeorm.create.mockReturnValue({ username: 'alice' });
    typeorm.save.mockResolvedValue({ id: 1, username: 'alice' });

    await expect(repository.create({ username: 'alice' })).resolves.toEqual({ id: 1, username: 'alice' });
    expect(typeorm.create).toHaveBeenCalledWith({ username: 'alice' });
    expect(typeorm.save).toHaveBeenCalledWith({ username: 'alice' });
  });

  it('finds by username and by id', async () => {
    typeorm.findOne.mockResolvedValue({ id: 7 });

    await repository.findByUsername('alice');
    await repository.findById(7);

    expect(typeorm.findOne).toHaveBeenNthCalledWith(1, { where: { username: 'alice' } });
    expect(typeorm.findOne).toHaveBeenNthCalledWith(2, { where: { id: 7 } });
  });

  it.each([
    ['usernameExists', { username: 'alice' }],
    ['emailExists', { email: 'alice@example.com' }],
  ] as const)('%s is true only when a row is found', async (method, where) => {
    const argument = Object.values(where)[0];

    typeorm.findOne.mockResolvedValueOnce({ id: 1 });
    await expect(repository[method](argument)).resolves.toBe(true);
    expect(typeorm.findOne).toHaveBeenCalledWith({ where });

    typeorm.findOne.mockResolvedValueOnce(null);
    await expect(repository[method](argument)).resolves.toBe(false);
  });
});

describe('UsersService', () => {
  let repository: {
    create: jest.Mock;
    findByUsername: jest.Mock;
    findById: jest.Mock;
    usernameExists: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    repository = {
      create: jest.fn().mockImplementation(async (user) => ({ id: 1, ...user })),
      findByUsername: jest.fn(),
      findById: jest.fn(),
      usernameExists: jest.fn(),
    };
    service = new UsersService(repository as unknown as UsersRepository);
  });

  it('creates a CUSTOMER with a placeholder email when none is given', async () => {
    const user = await service.createUser('alice.trader1', '$argon2id$hash');

    expect(user).toMatchObject({
      username: 'alice.trader1',
      email: 'alice.trader1@local.auth',
      password_hash: '$argon2id$hash',
      roles: ['CUSTOMER'],
    });
  });

  it('uses the email and roles it is given', async () => {
    await service.createUser('alice.trader1', 'hash', ['ADMIN'], 'alice@example.com');

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@example.com', roles: ['ADMIN'] }),
    );
  });

  it('looks users up by name and by id', async () => {
    repository.findByUsername.mockResolvedValue({ id: 3 });
    repository.findById.mockResolvedValue({ id: 4 });

    await expect(service.getUserByUsername('bob')).resolves.toEqual({ id: 3 });
    await expect(service.getUserById(4)).resolves.toEqual({ id: 4 });
  });

  it('reports a username as available when nobody has it', async () => {
    repository.usernameExists.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(service.isUsernameAvailable('free')).resolves.toBe(true);
    await expect(service.isUsernameAvailable('taken')).resolves.toBe(false);
  });
});
