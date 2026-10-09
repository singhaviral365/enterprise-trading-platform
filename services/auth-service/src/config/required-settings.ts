/**
 * Settings the service cannot run without. Each one comes from config/application.yml (central-config.ts maps the key to the variable
 * named here) and there is deliberately no fallback in code: a missing value stops the service with the name of the key to fill in,
 * instead of quietly running on a value nobody chose.
 */

export function requiredText(name: string, key: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = (env[name] ?? '').trim();
  if (value === '') {
    throw new Error(`${name} is not set: fill in ${key} in config/application.yml.`);
  }
  return value;
}

export function requiredInt(name: string, key: string, env: NodeJS.ProcessEnv = process.env): number {
  const raw = requiredText(name, key, env);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive whole number (got "${raw}"): fix ${key} in config/application.yml.`);
  }
  return parsed;
}

export const jwtSecret = (env: NodeJS.ProcessEnv = process.env): string => requiredText('JWT_SECRET', 'jwt.secret', env);
export const jwtIssuer = (env: NodeJS.ProcessEnv = process.env): string => requiredText('JWT_ISSUER', 'jwt.issuer', env);
export const accessTokenTtlSeconds = (env: NodeJS.ProcessEnv = process.env): number =>
  requiredInt('JWT_ACCESS_TOKEN_EXPIRES_IN', 'jwt.access-token-expires-in', env);
export const refreshTokenTtlSeconds = (env: NodeJS.ProcessEnv = process.env): number =>
  requiredInt('JWT_REFRESH_TOKEN_EXPIRES_IN', 'jwt.refresh-token-expires-in', env);
