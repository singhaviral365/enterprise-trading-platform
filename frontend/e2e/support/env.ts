/**
 * The only place the journeys read their configuration. Every address and credential comes from the
 * environment under these names; nothing is hard-coded and nothing is cached in a module variable
 * (each call reads `process.env` afresh, so no state leaks between specs).
 */
export const ENV_NAMES = {
  baseUrl: 'E2E_BASE_URL',
  username: 'E2E_USERNAME',
  password: 'E2E_PASSWORD',
  readOnlyUsername: 'E2E_READONLY_USERNAME',
  readOnlyPassword: 'E2E_READONLY_PASSWORD',
  symbol: 'E2E_SYMBOL',
} as const;

function read(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('<')) {
    throw new Error(`Set ${name} (see frontend/.env.e2e.example) before running the e2e journeys.`);
  }
  return value;
}

export interface Credentials {
  readonly username: string;
  readonly password: string;
}

export const userCredentials = (): Credentials => ({
  username: read(ENV_NAMES.username),
  password: read(ENV_NAMES.password),
});

export const readOnlyCredentials = (): Credentials => ({
  username: read(ENV_NAMES.readOnlyUsername),
  password: read(ENV_NAMES.readOnlyPassword),
});

export const tradedSymbol = (): string => read(ENV_NAMES.symbol);
