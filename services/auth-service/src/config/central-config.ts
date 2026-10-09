import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { load } from 'js-yaml';

/**
 * The auth-service's side of the central configuration (config/application.yml, see config/README.md). It reads the file once, at
 * start-up, and turns the keys this service needs into the environment variables the rest of the service already reads, so no
 * other file knows where a value comes from. A variable that is already set in the real environment wins, which is how a container
 * or a CI job overrides a single value without editing the file.
 *
 * The file is found by `CONFIG_FILE`, or by looking for `config/application.yml` in this folder and each folder above it. When there is
 * no `application.yml`, `application.example.yml` next to it is used, so a fresh clone starts and its tests run.
 */
type Node = Record<string, unknown>;

/** key in application.yml -> environment variable. Every value the service reads from the environment is listed here. */
export const KEY_TO_ENV: Readonly<Record<string, string>> = {
  environment: 'NODE_ENV',
  'services.auth.port': 'PORT',
  'services.mailhog.host': 'MAILHOG_HOST',
  'services.mailhog.smtp-port': 'MAILHOG_SMTP_PORT',
  'database.auth.host': 'DATABASE_HOST',
  'database.auth.port': 'DATABASE_PORT',
  'database.auth.name': 'DATABASE_NAME',
  'database.auth.user': 'DATABASE_USER',
  'database.auth.password': 'DATABASE_PASSWORD',
  'jwt.secret': 'JWT_SECRET',
  'jwt.issuer': 'JWT_ISSUER',
  'jwt.access-token-expires-in': 'JWT_ACCESS_TOKEN_EXPIRES_IN',
  'jwt.refresh-token-expires-in': 'JWT_REFRESH_TOKEN_EXPIRES_IN',
  'auth.log-level': 'LOG_LEVEL',
  'auth.verification-enabled': 'AUTH_EMAIL_VERIFICATION_ENABLED',
  'auth.two-factor-enabled': 'AUTH_TWO_FACTOR_ENABLED',
  'auth.otp.secret': 'AUTH_OTP_SECRET',
  'auth.otp.ttl-seconds': 'AUTH_OTP_TTL_SECONDS',
  'auth.otp.reset-ttl-seconds': 'AUTH_OTP_RESET_TTL_SECONDS',
  'auth.otp.max-attempts': 'AUTH_OTP_MAX_ATTEMPTS',
  'auth.otp.resend-cooldown-seconds': 'AUTH_OTP_RESEND_COOLDOWN_SECONDS',
  'auth.otp.max-sends': 'AUTH_OTP_MAX_SENDS',
  'auth.cookie.secure': 'AUTH_COOKIE_SECURE',
  'auth.cookie.samesite': 'AUTH_COOKIE_SAMESITE',
  'auth.email.mode': 'AUTH_EMAIL_MODE',
  'auth.email.smtp.host': 'AUTH_EMAIL_SMTP_HOST',
  'auth.email.smtp.port': 'AUTH_EMAIL_SMTP_PORT',
  'auth.email.smtp.tls': 'AUTH_EMAIL_SMTP_TLS',
  'auth.email.smtp.user': 'AUTH_EMAIL_SMTP_USER',
  'auth.email.smtp.password': 'AUTH_EMAIL_SMTP_PASSWORD',
  'auth.email.from': 'AUTH_EMAIL_FROM',
  'auth.email.from-domains': 'AUTH_EMAIL_FROM_DOMAINS',
  'auth.email.allowed-recipient-domains': 'AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS',
  'auth.email.reply-to': 'AUTH_EMAIL_REPLY_TO',
  'encryption.mode': 'ENC_MODE',
  'encryption.kid': 'ENC_KID',
  'encryption.private-key-pem': 'ENC_PRIVATE_KEY_PEM',
  'encryption.max-age-seconds': 'ENC_MAX_AGE_SECONDS',
  'encryption.log-plaintext': 'ENC_LOG_PLAINTEXT',
};

function isNode(value: unknown): value is Node {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function merge(base: unknown, over: unknown): unknown {
  if (!isNode(over)) {
    return over === undefined ? base : over;
  }
  const out: Node = isNode(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(over)) {
    out[key] = merge(out[key], value);
  }
  return out;
}

export function get(config: Node, dotted: string): unknown {
  let node: unknown = config;
  for (const key of dotted.split('.')) {
    node = isNode(node) ? node[key] : undefined;
  }
  return node;
}

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const s = Array.isArray(value) ? value.join(',') : String(value);
  return s === '' ? undefined : s;
}

/** The folder that holds application.yml: CONFIG_FILE's, or the nearest `config/` above this one that has the file. */
export function findConfigDir(env: NodeJS.ProcessEnv, start: string): string | null {
  if (env.CONFIG_FILE) {
    return dirname(resolve(env.CONFIG_FILE));
  }
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const candidate = join(dir, 'config');
    if (existsSync(join(candidate, 'application.yml')) || existsSync(join(candidate, 'application.example.yml'))) {
      return candidate;
    }
    if (dirname(dir) === dir) {
      return null;
    }
  }
}

export function readConfig(env: NodeJS.ProcessEnv = process.env, start: string = process.cwd()): { config: Node; file: string | null } {
  const dir = findConfigDir(env, start);
  if (dir === null) {
    return { config: {}, file: null };
  }
  const real = env.CONFIG_FILE ? resolve(env.CONFIG_FILE) : join(dir, 'application.yml');
  const example = join(dir, 'application.example.yml');
  let config: Node = {};
  if (existsSync(example)) {
    config = merge(config, load(readFileSync(example, 'utf8'))) as Node;
  }
  if (existsSync(real)) {
    config = merge(config, load(readFileSync(real, 'utf8'))) as Node;
    return { config, file: real };
  }
  return { config, file: existsSync(example) ? example : null };
}

/** The browser origins allowed to call this service: the frontend, and any extras the file lists. */
export function corsOrigins(config: Node): string[] {
  const host = text(get(config, 'services.frontend.host'));
  const port = text(get(config, 'services.frontend.port'));
  const extras = get(config, 'auth.cors.extra-origins');
  const origins = host && port ? [`http://${host}:${port}`] : [];
  if (Array.isArray(extras)) {
    origins.push(...extras.map(String).filter((o) => o.trim() !== ''));
  }
  return origins;
}

/** Fills the environment from the central file. Returns where the values came from (null: no file found). */
export function applyCentralConfig(env: NodeJS.ProcessEnv = process.env, start: string = process.cwd()): string | null {
  const { config, file } = readConfig(env, start);
  for (const [key, name] of Object.entries(KEY_TO_ENV)) {
    const value = text(get(config, key));
    if (value !== undefined && env[name] === undefined) {
      env[name] = value;
    }
  }
  if (env.AUTH_CORS_ORIGINS === undefined) {
    env.AUTH_CORS_ORIGINS = corsOrigins(config).join(',');
  }
  return file;
}
