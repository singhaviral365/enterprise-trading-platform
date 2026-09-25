# Security review: auth service

## Header

| Field | Value |
|---|---|
| Service | auth service, Sprint 8 |
| Reviewed by | Team 3 |
| Date of review | 2026-09-25 |
| Commit reviewed | fe66bb5 |
| Version of the OWASP Top Ten used | 2021 |

## Categories

| Category | In scope | Finding | Disposition |
|---|---|---|---|
| A01 Broken access control | Yes | Checked auth routes in src/auth/auth.controller.ts and src/auth/jwt-auth.guard.ts. /auth/me reads identity from verified JWT claims only, not from path/body/query. Registration does not allow privilege escalation because AuthService always persists CUSTOMER role regardless of optional roles input. | Mitigated. Access control for current routes is enforced by JwtAuthGuard and service-side role assignment. Residual risk: if future routes trust client-supplied account or role fields without guard checks, access control regressions can reappear. |
| A02 Cryptographic failures | Yes | Passwords are hashed with Argon2id in src/credentials/credentials.service.ts (timeCost 3, memoryCost 65536). Access tokens are signed with HS256 and issuer checks are enforced in src/auth/jwt-auth.guard.ts and src/auth/jwt.strategy.ts. Refresh tokens are stored as SHA-256 hash only in src/refresh-tokens/refresh-tokens.service.ts. Weak secret risk checked: app startup requires JWT_SECRET in src/config/configuration.ts, but fallback literals still exist in src/app.module.ts and src/auth/jwt.strategy.ts. | Accepted. Team accepted temporary residual risk of fallback secret literals because deployment config requires JWT_SECRET and local development still needs a safe failure path. Follow-up item is to remove fallback literals entirely so missing secret always fails closed at every code path. |
| A03 Injection | Yes | Checked src/users/users.service.ts and src/refresh-tokens/refresh-tokens.service.ts for SQL construction. Data access uses TypeORM repository methods with bound values; no query string concatenation with untrusted input was found. | Finding of none. Kept as is. Residual risk is low while repository pattern is retained; any future raw SQL must be parameterized and reviewed. |
| A04 Insecure design | Yes | Checked token lifecycle in src/auth/auth.service.ts and src/refresh-tokens/refresh-tokens.service.ts. Presented refresh token is revoked on successful refresh (one-time use). Replay/theft handling is incomplete: detectTheftAndRevoke exists but is not invoked on replay path. Login throttling was not found. Uniform login failure behavior is implemented. | Accepted. Team decision is to ship Sprint 8 without login throttling and without automatic chain revocation on replay detection. Residual risk: brute-force pressure on login and delayed containment if refresh token replay occurs. These are tracked as outstanding items. |
| A05 Security misconfiguration | Yes | Checked runtime defaults in src/main.ts, src/app.module.ts, and auth-service/Dockerfile. CORS is not explicitly enabled, reducing browser cross-origin exposure by default. GlobalExceptionFilter in src/common/filters/global-exception.filter.ts returns envelope errors, but logs full Error objects for unhandled faults. Dockerfile runs as root user in runtime image (no USER directive). | Accepted. Residual risk: root container execution increases blast radius if container escape occurs, and verbose error logging can expose internals in shared logs. Team carries this temporarily for sprint delivery and will harden runtime user and logging policy next sprint. |
| A06 Vulnerable and outdated components | Yes | Ran npm audit --omit=dev in auth-service on 2026-09-25. Result: 15 vulnerabilities (1 low, 8 moderate, 5 high, 1 critical), including advisories through NestJS transitive dependencies, multer/body-parser, and tar via @mapbox/node-pre-gyp. package-lock.json is present and pinned. | Accepted. Team chose not to run forced major upgrades during sprint close because npm audit fix --force requires breaking upgrades (Nest 12 and related stack). Residual risk: known vulnerable transitive packages remain in runtime until planned dependency upgrade and regression test cycle. |
| A07 Identification and authentication failures | Yes | Checked src/auth/auth.service.ts and src/auth/jwt-auth.guard.ts. Unknown user and wrong password both return AUTH-401 and use dummy verify path to reduce timing leaks. Access token expiry/issuer/signature are enforced for protected requests. Register does not issue tokens. Password minimum length is enforced in DTO validation. | Mitigated. Core authentication controls are in place. Residual risk: lack of rate limiting on login leaves online guessing exposure under sustained attack; tracked in outstanding items. |
| A09 Security logging and monitoring failures | Yes | Checked src/common/logging/redacting.logger.ts and auth/refresh flow logs. Sensitive keys (password, token, authorization, jwt, etc.) are redacted before logging. Login failures and refresh operations emit events, but replay-specific telemetry is not emitted because replay detection flow is not wired. | Mitigated. Redaction controls reduce token leakage in logs. Residual risk: incident visibility is weaker for replay attempts until theft detection is wired and alertable events are emitted. |

## Evidence

| Check | How it was performed | Result |
|---|---|---|
| Route and guard access control | Read src/auth/auth.controller.ts and src/auth/jwt-auth.guard.ts | /auth/me uses JWT-derived identity only and requires bearer token |
| Password and token crypto | Read src/credentials/credentials.service.ts and src/refresh-tokens/refresh-tokens.service.ts | Argon2id hashing, HS256 signed JWT, refresh tokens hashed at rest |
| Weak secret behavior | Read src/config/configuration.ts, src/app.module.ts, src/auth/jwt.strategy.ts | JWT_SECRET required at startup, but fallback literals still present in module/strategy constructors |
| Replay and revocation | Read src/auth/auth.service.ts and src/refresh-tokens/refresh-tokens.service.ts | One-time refresh token revocation is implemented; replay chain revocation path exists but not integrated |
| Vulnerable components | Ran npm audit --omit=dev in auth-service | 15 vulnerabilities reported; some fixes require breaking major upgrades |
| Logging and leakage | Read src/common/logging/redacting.logger.ts and global exception filter | Sensitive key redaction implemented; unhandled error logging still captures error object |

## Outstanding items

| Item | Owner | Target date |
|---|---|---|
| Wire replay detection flow so refresh token replay triggers detectTheftAndRevoke and alert log | Auth service team | 2026-10-02 |
| Add login throttling and lockout policy for repeated failures | Auth service team | 2026-10-02 |
| Remove JWT fallback secret literals and fail closed on missing secret in all code paths | Auth service team | 2026-10-02 |
| Upgrade dependencies to resolve audit findings with compatibility test plan (Nest major bump path) | Auth service team | 2026-10-09 |
| Run container as non-root user in runtime image | Platform/auth service team | 2026-10-09 |
