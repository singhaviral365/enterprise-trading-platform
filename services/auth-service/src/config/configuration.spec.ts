import { configuration } from './configuration';

const REQUIRED = {
  JWT_SECRET: 'secret',
  JWT_ISSUER: 'auth-service',
  DATABASE_HOST: 'db.local',
  DATABASE_PORT: '5433',
  DATABASE_NAME: 'auth_db',
  DATABASE_USER: 'postgres',
  DATABASE_PASSWORD: 'pw',
  PORT: '3000',
  LOG_LEVEL: 'debug',
  JWT_ACCESS_TOKEN_EXPIRES_IN: '900',
  JWT_REFRESH_TOKEN_EXPIRES_IN: '604800',
  AUTH_COOKIE_SAMESITE: 'strict',
};

describe('configuration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, ...REQUIRED };
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reads the settings, with no fallback in code', () => {
    expect(configuration()).toEqual({
      nodeEnv: '',
      port: 3000,
      database: { host: 'db.local', port: 5433, name: 'auth_db', username: 'postgres', password: 'pw' },
      jwt: { secret: 'secret', issuer: 'auth-service', accessTokenExpiresIn: 900, refreshTokenExpiresIn: 604800 },
      logging: { level: 'debug' },
    });
  });

  it('takes other values for the same settings', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '4000';
    process.env.LOG_LEVEL = 'warn';
    process.env.JWT_ACCESS_TOKEN_EXPIRES_IN = '60';
    process.env.JWT_REFRESH_TOKEN_EXPIRES_IN = '120';

    const config = configuration();

    expect(config.nodeEnv).toBe('production');
    expect(config.port).toBe(4000);
    expect(config.logging.level).toBe('warn');
    expect(config.jwt.accessTokenExpiresIn).toBe(60);
    expect(config.jwt.refreshTokenExpiresIn).toBe(120);
  });

  it.each(Object.keys(REQUIRED))('refuses to start without %s', (name) => {
    delete process.env[name];

    expect(() => configuration()).toThrow(`Missing required environment variable: ${name}`);
  });

  it('treats an empty required value as missing', () => {
    process.env.JWT_SECRET = '';

    expect(() => configuration()).toThrow('JWT_SECRET');
  });
});
