import { DatabaseInitService } from './database-init.service';

describe('DatabaseInitService', () => {
  const originalEnv = process.env.NODE_ENV;
  let query: jest.Mock;
  let release: jest.Mock;
  let dataSource: { createQueryRunner: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };
  let service: DatabaseInitService;

  beforeEach(() => {
    query = jest.fn().mockResolvedValue(undefined);
    release = jest.fn().mockResolvedValue(undefined);
    dataSource = { createQueryRunner: jest.fn(() => ({ query, release })) };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service = new DatabaseInitService(dataSource as never, logger as never);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('does nothing outside development', async () => {
    process.env.NODE_ENV = 'production';

    await service.onModuleInit();

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('in development, moves the user id sequence past 1000 and releases the runner', async () => {
    process.env.NODE_ENV = 'development';

    await service.onModuleInit();

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('users_user_id_seq');
    expect(release).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalled();
  });

  it('logs a failed sequence reset and lets the app start anyway', async () => {
    process.env.NODE_ENV = 'development';
    query.mockRejectedValue(new Error('no such sequence'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('logs and swallows a failure to even open a query runner', async () => {
    process.env.NODE_ENV = 'development';
    dataSource.createQueryRunner.mockImplementation(() => {
      throw new Error('pool closed');
    });

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
  });
});
