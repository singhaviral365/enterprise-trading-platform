import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { KEY_TO_ENV, applyCentralConfig, corsOrigins, get, readConfig } from './central-config';

function configDir(example: string, real?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'central-config-'));
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, 'config', 'application.example.yml'), example);
  if (real !== undefined) {
    writeFileSync(join(root, 'config', 'application.yml'), real);
  }
  return root;
}

const EXAMPLE = `
environment: local
services:
  auth: { host: localhost, port: 3000 }
  frontend: { host: localhost, port: 4200 }
database:
  auth: { host: localhost, port: 5433, name: auth_db, user: postgres, password: "" }
jwt: { secret: "", issuer: auth-service }
auth:
  verification-enabled: true
  cors: { extra-origins: [] }
  email: { mode: off, from: "" }
`;

describe('central configuration', () => {
  it('fills the environment the service reads from application.yml, over the example', () => {
    const root = configDir(EXAMPLE, 'jwt: { secret: s3cret-s3cret-s3cret-s3cret-s3cret }\ndatabase:\n  auth: { password: pw }\nauth:\n  email: { mode: prod }\n');
    const env: NodeJS.ProcessEnv = {};

    const file = applyCentralConfig(env, root);

    expect(file).toBe(join(root, 'config', 'application.yml'));
    expect(env).toMatchObject({
      NODE_ENV: 'local',
      PORT: '3000',
      DATABASE_HOST: 'localhost',
      DATABASE_PORT: '5433',
      DATABASE_NAME: 'auth_db',
      DATABASE_PASSWORD: 'pw',
      JWT_SECRET: 's3cret-s3cret-s3cret-s3cret-s3cret',
      JWT_ISSUER: 'auth-service',
      AUTH_EMAIL_VERIFICATION_ENABLED: 'true',
      AUTH_EMAIL_MODE: 'prod',
      AUTH_CORS_ORIGINS: 'http://localhost:4200',
    });
  });

  it('lets a real environment variable win, and leaves empty values unset', () => {
    const root = configDir(EXAMPLE, 'database:\n  auth: { password: from-file }\n');
    const env: NodeJS.ProcessEnv = { DATABASE_PASSWORD: 'from-env' };

    applyCentralConfig(env, root);

    expect(env.DATABASE_PASSWORD).toBe('from-env');
    expect(env.AUTH_EMAIL_FROM).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
  });

  it('falls back to the example when there is no application.yml', () => {
    const root = configDir(EXAMPLE);
    const env: NodeJS.ProcessEnv = {};

    expect(applyCentralConfig(env, root)).toBe(join(root, 'config', 'application.example.yml'));
    expect(env.PORT).toBe('3000');
  });

  it('finds the file from a folder inside the project, and by CONFIG_FILE', () => {
    const root = configDir(EXAMPLE, 'services:\n  auth: { port: 3999 }\n');
    mkdirSync(join(root, 'services', 'auth-service'), { recursive: true });

    expect(readConfig({}, join(root, 'services', 'auth-service')).config).toMatchObject({ services: { auth: { port: 3999 } } });
    expect(readConfig({ CONFIG_FILE: join(root, 'config', 'application.yml') }, tmpdir()).file).toBe(join(root, 'config', 'application.yml'));
  });

  it('allows the frontend origin and any extra origins to call the service', () => {
    const { config } = readConfig({}, configDir(EXAMPLE, 'auth:\n  cors:\n    extra-origins: ["https://app.example.com", ""]\n'));

    expect(corsOrigins(config)).toEqual(['http://localhost:4200', 'https://app.example.com']);
  });

  it('maps only keys that exist in the shipped example', () => {
    const { config } = readConfig({}, join(__dirname, '..', '..'));
    for (const key of Object.keys(KEY_TO_ENV)) {
      expect(get(config, key)).not.toBeUndefined();
    }
  });
});
