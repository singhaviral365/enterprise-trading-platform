/**
 * Configuration loader for environment variables.
 * Validates required variables at startup.
 */
export function configuration() {
  const required = [
    'JWT_SECRET',
    'JWT_ISSUER',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_NAME',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    database: {
      host: process.env.DATABASE_HOST,
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      name: process.env.DATABASE_NAME,
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      issuer: process.env.JWT_ISSUER,
      accessTokenExpiresIn: parseInt(
        process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '900',
        10,
      ),
      refreshTokenExpiresIn: parseInt(
        process.env.JWT_REFRESH_TOKEN_EXPIRES_IN || '604800',
        10,
      ),
    },
    logging: {
      level: process.env.LOG_LEVEL || 'debug',
    },
  };
}

export type Config = ReturnType<typeof configuration>;
