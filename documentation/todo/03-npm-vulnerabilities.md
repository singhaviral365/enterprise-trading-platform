# 03 · auth-service npm vulnerabilities

Status: **package.json edited, not installed.** I did not run `npm install`; you run it and re-audit.
Source: `services/auth-service/npm-audit.json` (73 findings: 1 critical, 50 high, 18 moderate, 4 low).

## 1. Why it is more than overrides

`overrides` can force a patched **transitive** package, and that is used wherever it is safe. But most findings sit on
**direct** dependencies whose only fix is a newer major (and npm refuses an override that contradicts a direct dependency
range unless it uses `$name`). The audit's main root causes:

| Root cause | Fix |
|---|---|
| `@nestjs/core`, `common`, `platform-express`, `testing` `<=11.1.17` (and 10.x) | Nest 11 line (`^11.2.7`) |
| `@nestjs/cli`, `schematics` (pull `@angular-devkit/*`, `webpack`, `glob`, `chokidar`, `inquirer`/`tmp`) | `@nestjs/cli ^11.0.24`, `@nestjs/schematics ^11.1.0` |
| `@nestjs/config` (lodash) | `^4.0.4` |
| `@nestjs/swagger` (js-yaml, lodash) | `^11.4.7` |
| `@nestjs/typeorm` (uuid) | `^11.0.3` |
| `@nestjs/passport` | `^11.0.5` (matches Nest 11) |
| `argon2` -> `@mapbox/node-pre-gyp` -> `tar` (critical) | `argon2 ^0.45.1` (no `node-pre-gyp`) |
| `nodemailer <=10.0.5` | `^10.0.16` (ships its own types, so `@types/nodemailer` is removed) |
| `@typescript-eslint/*` 6.x (minimatch, globby, fast-glob) | `^8.71.1` (+ `eslint ^8.57.0` as they require) |
| `uuid <11.1.1` | `^11.1.1` (direct) and `"uuid": "$uuid"` override so every nested copy follows |

## 2. `overrides` added

```json
"overrides": {
  "uuid": "$uuid",
  "lodash": "^4.18.1",
  "qs": "^6.16.0",
  "multer": "^2.4.0",
  "tmp": "^0.2.7",
  "tar": "^7.5.22",
  "@angular-devkit/core": { "ajv": "^8.18.0" }
}
```
`ajv` is scoped to `@angular-devkit/core` because ESLint still needs ajv 6; a global override would break it.
`body-parser` is deliberately **not** overridden: Express 5 (Nest 11) uses body-parser 2.

`allowScripts` was updated to the new `@nestjs/core` and `argon2` versions.

## 3. What will still be reported (no patched release exists)

I checked the registry: the latest published versions are still inside the vulnerable ranges, so **no override can fix these**:

| Package | Latest | Vulnerable | Pulled in by |
|---|---|---|---|
| `braces` | 3.0.3 | `<=3.0.3` | `micromatch` -> `jest-*`, `@jest/*`, `babel-jest`, `fast-glob`, `globby`, `chokidar 3` ... (dev tooling only) |
| `sprintf-js` | 1.1.3 | `<=1.1.3` | `argparse` -> `js-yaml 3` -> `@istanbuljs/load-nyc-config` -> `babel-plugin-istanbul` (jest coverage) |

Both chains are **test/lint tooling, not runtime**: after the changes the production dependency tree should be clean. Check with
`npm audit --omit=dev`. When `braces`/`sprintf-js` publish fixes, `npm update braces sprintf-js` (or an override) closes the rest.

## 4. What to check after `npm install`
1. `npm audit --omit=dev` -> expect 0. `npm audit` -> expect only the `braces`/`sprintf-js` chains above.
2. `npm run build` and `npm test` (166 tests, 90/85 coverage thresholds). Likely trouble spots, all from Nest 11 / Express 5:
   - Express 5 changes: `req.query` is read-only and parsed with the "simple" parser by default; wildcard routes need names (`/*splat`). No wildcard routes or `@All` handlers exist in `src`, so none are expected.
   - `@types/express` is still 4.x; if the compiler complains about request/response types, bump it to `^5.0.0`.
   - `nodemailer` 10: `createTransport`/`sendMail` are unchanged; the bundled types replace `@types/nodemailer`.
   - `argon2` 0.45: `argon2id` options are the same; the first install compiles/loads a prebuilt binary through `node-gyp-build`.
3. Regenerate and commit `package-lock.json`. The Dockerfile uses the lock file, so a stale one will fail `npm ci`.
4. Re-run `npm audit --json > npm-audit.json` if you want the file refreshed.
