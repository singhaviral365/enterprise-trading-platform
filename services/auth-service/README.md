# Auth Service - Sprint 8

NestJS authentication service for the Enterprise Trading Platform. Implements registration, login, token refresh, and user profile retrieval.

## Overview

- **Framework**: NestJS 10+
- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Database**: PostgreSQL (separate auth_db)
- **Authentication**: JWT (HS256)
- **Password Hashing**: Argon2id

## Architecture

The Auth Service manages authentication users in a separate `auth_db` database:

```
auth_db
├── users          # Credentials and user metadata
└── refresh_tokens # Rotating refresh tokens with revocation support
```

Users are linked to existing trading accounts via application-level relationship (JWT contains both `sub` and `accountId`).

## Quick Start

### Prerequisites
- Node.js 20 or higher
- PostgreSQL 13 or higher
- npm or yarn

### Setup

1. Create the central configuration (one file for every service, git-ignored) and fill it in; the auth-service reads `database.auth.*`, `jwt.*`,
   `auth.*`, `encryption.*`, `services.auth.port` and `environment`:
```bash
cp ../../config/application.example.yml ../../config/application.yml
```
   See [`config/README.md`](../../config/README.md). There is no `.env` file.

2. (Optional) Generate the payload-encryption key and paste the two lines under `encryption:`:
```bash
node ../../config/cli.js enc-key
```

3. Install dependencies:
```bash
npm ci
```

4. Build the project:
```bash
npm run build
```

5. Run tests:
```bash
npm test
```

6. Start the service:
```bash
npm run start:dev
```

The service will be available at `http://localhost:3000`.

## Available Commands

- `npm run build` - Build the project (TypeScript → JavaScript)
- `npm start` - Run production build (use `npm run build` first)
- `npm run start:dev` - Run with hot-reload (development)
- `npm test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:cov` - Run tests with coverage report
- `npm run test:e2e` - Run end-to-end tests

## Docker

### Build
```bash
docker build -t auth-service:latest .
```

### Run
```bash
docker run -p 3000:3000 \
  -e DATABASE_HOST=postgres \
  -e DATABASE_PORT=5432 \
  -e DATABASE_NAME=auth_db \
  -e DATABASE_USER=postgres \
  -e DATABASE_PASSWORD=postgres \
  -e JWT_SECRET=your-secret \
  -e JWT_ISSUER=auth-service \
  auth-service:latest
```

## API Endpoints

See [contracts/auth-api.yaml](../contracts/auth-api.yaml) for the complete API specification.

### Public Endpoints
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login, step one: checks the password and (two-step, the default) emails a code. See [AUTH-OTP.md](../../documentation/readme/AUTH-OTP.md)
- `POST /auth/login/verify` - Login, step two: the emailed code, then tokens and cookies
- `POST /auth/login/resend` - Email the sign-in code again
- `POST /auth/password/forgot`, `/password/resend`, `/password/verify`, `/password/reset` - Forgot password
- `POST /auth/refresh` - Refresh access token

### Protected Endpoints
- `GET /auth/me` - Get current authenticated user

### Health
- `GET /health` - Service health check

## Security Considerations

1. **Passwords**: Stored using Argon2id with appropriate cost factor
2. **Tokens**: Short-lived access tokens (15 min), longer-lived refresh tokens (7 days)
3. **Refresh Token Rotation**: Each refresh invalidates the previous token
4. **Token Theft Detection**: Reuse of consumed refresh token revokes all tokens for that user
5. **No Enumeration**: Login returns same response for unknown user and wrong password
6. **Logging**: Passwords and tokens never logged
7. **Validation**: All inputs validated using `class-validator`

### Login Throttle Policy

- Failed-attempt limit per caller: `5` consecutive failures
- Cooldown after hitting limit: `300` seconds (5 minutes)
- Caller identity source: `x-forwarded-for` first IP, fallback to request IP
- Failure response during cooldown: unchanged `AUTH-401` with `Unauthorised`

## Database Initialization

The application uses TypeORM for database management. On first run:

1. Ensure auth_db exists:
```sql
CREATE DATABASE auth_db;
```

2. Run migrations (automatic on startup if `synchronize: true`):
```bash
npm run start:dev
```

Or manually run migration files:
```bash
npx typeorm migration:run -d dist/database.config.js
```

## Configuration

All configuration comes from `config/application.yml`, which this service turns into the environment variables below at start-up (`src/config/central-config.ts` lists the key for each; a real environment variable still wins). The variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `PORT` | Service port | 3000 |
| `DATABASE_HOST` | PostgreSQL host | localhost |
| `DATABASE_PORT` | PostgreSQL port | 5432 |
| `DATABASE_NAME` | Database name | auth_db |
| `DATABASE_USER` | Database user | postgres |
| `DATABASE_PASSWORD` | Database password | _(required)_ |
| `JWT_SECRET` | Secret for signing tokens | _(required)_ |
| `JWT_ISSUER` | Token issuer claim | auth-service |
| `JWT_ACCESS_TOKEN_EXPIRES_IN` | Access token lifetime (seconds) | 900 (15 min) |
| `JWT_REFRESH_TOKEN_EXPIRES_IN` | Refresh token lifetime (seconds) | 604800 (7 days) |
| `LOG_LEVEL` | Logging level | debug |
| `AUTH_EMAIL_VERIFICATION_ENABLED` | Registering emails a code to the address typed, and the login is created only once it is entered. `false` skips the check | true |
| `AUTH_TWO_FACTOR_ENABLED` | Offers two-step sign-in as a per-user option (off for every user until they switch it on in Settings). `false` removes the option | true |
| `AUTH_EMAIL_MODE` | `off`, `dev` (MailHog; refused under `NODE_ENV=production`) or `prod` (a real provider over TLS with a login; see [EMAIL.md](../../documentation/readme/EMAIL.md) for every setting) | off |
| `AUTH_EMAIL_ENABLED` | Deprecated alias: `true` means `AUTH_EMAIL_MODE=dev` | false |
| `AUTH_EMAIL_SMTP_HOST` / `AUTH_EMAIL_SMTP_PORT` | The SMTP server (MailHog) | localhost / 1025 |
| `AUTH_OTP_*` | Code lifetime, guess and resend limits, hashing key: see [AUTH-OTP.md](../../documentation/readme/AUTH-OTP.md) | safe defaults |

The registration email check is on by default and needs email, so the service **refuses to start** with it on and `AUTH_EMAIL_ENABLED` off.
For development set `AUTH_EMAIL_MODE=dev` with MailHog running, or `AUTH_EMAIL_VERIFICATION_ENABLED=false`.

## Testing

### Run all tests
```bash
npm test
```

### Run with coverage
```bash
npm run test:cov
```

### Watch mode
```bash
npm run test:watch
```

## Integration with Trade REST API

The Trade REST API validates tokens issued by this service:

1. Both services must share the same `JWT_SECRET`
2. Both services must use the same JWT issuer (`auth-service`)
3. The backend verifies token signature, expiry, and issuer
4. The backend extracts `accountId` from the token to enforce authorization

See [contracts/trade-api.yaml](../contracts/trade-api.yaml) for Trade API requirements.

## Development

### Project Structure
```
src/
├── config/               # Configuration loading
├── migrations/           # Database migrations
├── auth/                 # Authentication logic
├── users/                # User management
├── credentials/          # Password hashing
├── refresh-tokens/       # Token management
├── app.module.ts         # Root NestJS module
└── main.ts              # Application bootstrap
```

### Code Style
- TypeScript with strict mode enabled
- ESLint for linting
- Prettier for formatting

## License

Instructional use only
