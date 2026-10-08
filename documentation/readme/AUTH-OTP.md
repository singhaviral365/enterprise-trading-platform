# Email codes: registration, two-step sign-in, forgot password, change password

Registration, two-step sign-in and forgot password send a six-digit code by email. Registration sends it to the address **typed on the
form** (nothing exists yet); the other two send it to the address on the user's own record (`users.email`). Change password sends no
code (it asks for the current password) but mails a notice. Email has three modes (off, dev with MailHog, prod with a real provider; see [EMAIL.md](EMAIL.md)); "Running it" below covers dev.

## Registration verifies the email first

```
POST /auth/register          username + password + email
   taken username / email .. 409 AUTH-409      (nothing is sent)
   fine ..................... 200 { verificationRequired: true, challenge: { challengeId, email: "a***@x.com", expiresIn, resendAfter } }
                             a code was emailed to the address typed; NOTHING is created yet (the password waits, already argon2id-hashed)
POST /auth/register/verify   challengeId + code
   wrong / expired / used .. 401 OTP-401
   right ................... 201 user         <- the login is created here; nobody is signed in
POST /auth/register/resend   challengeId         a fresh code to the same address
```

The Angular register form swaps to the same "Verification code" step as sign-in (masked address, "Send a new code" with a countdown,
"Change my email address"). Only a right code creates the login, so an address nobody can read never becomes one. Afterwards the dialog
returns to the sign-in form with the username filled in. `AUTH_EMAIL_VERIFICATION_ENABLED=false` skips the check (the login is created
at once, `verificationRequired: false`); it is **on by default** and, like all email here, needs `AUTH_EMAIL_ENABLED=true` in development.

## Two-step sign-in (each user's own choice)

Two-step sign-in is a **per-user preference, off until the user turns it on**: Settings > "Sign-in security" > "Two-step sign-in"
(`PUT /auth/me/two-factor { enabled }`, saved at once; stored as `users.two_factor_enabled`). Turning it **on** is refused (`OTP-503`)
if no code could be emailed here, so nobody locks themselves out; turning it off always works. `AUTH_TWO_FACTOR_ENABLED=false` removes
the option for everyone (nobody is asked for a code, whatever they chose).

```
POST /auth/login          username + password
   password wrong ........ 401 AUTH-401        (same answer as ever, same throttling, nothing is sent)
   password right ........ 200 { twoFactorRequired: true, challenge: { challengeId, email: "a***@x.com", expiresIn, resendAfter } }
                           no tokens, no cookie: nobody is signed in
POST /auth/login/verify   challengeId + code
   wrong / expired / used  401 OTP-401         (one answer for all three)
   too many wrong codes .. 429 OTP-429
   right ................. 200 tokens + HttpOnly cookies   <- the session starts here
POST /auth/login/resend   challengeId           a fresh code; the old one stops working
```

In the Angular sign-in dialog the password step swaps to a "Verification code" field. It shows where the code went (partly hidden),
has "Send a new code" (greyed out with a countdown) and "Use a different account".

**Without it** (the default for every user, or `AUTH_TWO_FACTOR_ENABLED=false`) `POST /auth/login` returns the tokens straight away
(`twoFactorRequired: false, tokens: {...}`).

**Registering does not sign the new user in**, so the dialog returns to the sign-in form with the username filled in and a note.

## Change password

The profile icon beside the theme toggle opens a dialog (username, email, member since, two-step status) with a "Change password" button.
The current and the new password are typed together:

```
POST /auth/me/password    currentPassword + newPassword      (cookie session, X-Requested-With header)
   current wrong, 1st / 2nd  403 PWD-403 { attemptsLeft: 2 | 1 }
   current wrong, 3rd ...... 423 PWD-423: THAT session is ended (refresh token revoked, cookies cleared) and stays refused, even with
                             the right password; the dialog signs the user out and goes home
   same as current ......... 422 PWD-422     (not counted as a wrong try)
   breaks the rules ........ 422 VAL-422
   right ................... 200 fresh tokens + cookies: every OTHER session is ended, this one carries on; a notice is emailed
```

The count is per session (the refresh token), so a thief with a stolen access token gets three guesses, not unlimited ones, and one
person's wrong tries do not lock another session. Wrong current passwords answer 403, not 401, because the browser client treats a 401 as
"the session expired" and retries it.

## Forgot password

```
"Forgot password?" under the password field  ->  dialog: username + the email on the account
POST /auth/password/forgot   username + email   always 202 { challengeId, expiresIn, resendAfter }
POST /auth/password/verify   challengeId + code 200 { resetToken, expiresIn }  | 401 OTP-401 | 429 OTP-429
POST /auth/password/reset    resetToken + newPassword   204 | 401 OTP-401 | 422 VAL-422 | 422 PWD-422
then: back to the sign-in form (username filled in, "Your password was changed"), which needs the new password AND a new code
```

The new password has to:

- follow the registration rules (12-128 characters, a capital letter, a number, a special symbol): the dialog shows them as a live
  checklist and the server enforces them (`VAL-422`);
- differ from the username (`VAL-422`);
- differ from the **current** password (`PWD-422`). Only the current one is checked: the service keeps no password history;
- be typed twice (the dialog checks that).

A refused password does **not** use the reset token up, so another can be tried. An accepted one spends it, ends **every** session the user
had (all refresh tokens are revoked), and a "your password was changed" notice is emailed.

## Security decisions

| Decision | Why |
|---|---|
| The code goes only to the address on the user record | No request field chooses a destination: nothing to abuse as a mail relay |
| Forgot password answers identically for any username/email (same status, shape, and the mail is sent in the background so timing matches) | It cannot be used to find out who is registered. A wrong guess gets a challenge id that can never verify; resending it is answered like a success |
| Codes come from `crypto.randomInt`, are never stored: only an HMAC (`AUTH_OTP_SECRET`, else the JWT secret) | A copy of the table does not reveal a usable code |
| A code works once, for 5 minutes (a reset: 10) | `AUTH_OTP_TTL_SECONDS`, `AUTH_OTP_RESET_TTL_SECONDS` |
| 5 wrong guesses kill a code, counted atomically before the check | Parallel guesses cannot exceed the limit. `AUTH_OTP_MAX_ATTEMPTS` |
| Guesses are also throttled per caller (5, then 5 minutes), across new challenges | A client cannot spread guesses over fresh challenges |
| At most 3 emails per challenge, 30 s apart | `AUTH_OTP_MAX_SENDS`, `AUTH_OTP_RESEND_COOLDOWN_SECONDS` |
| Asking for a reset is throttled per caller | No mail bombing |
| A sign-in code that cannot be sent is `OTP-503` | A user is never told a code is on its way when it is not |
| A registration code, a sign-in code and a reset code cannot be swapped | The purpose is part of the lookup |
| Wrong, expired, used and unknown codes are all `OTP-401` | A caller cannot tell which, or probe which challenges exist |
| A sign-in code and a reset code cannot be swapped | The purpose is part of the lookup |
| Neither the code nor the address is ever logged | Only the challenge id, user id and a reason class |

## Running it

Email is development only, in the same four layers as the Trade API's notification email:

| Layer | What it does |
|---|---|
| Off by default | `AUTH_EMAIL_ENABLED` must be exactly `true` |
| Different bean | When off, `DisabledEmailSender` is wired; `SmtpEmailSender` is not even created |
| Start-up guard | The service refuses to start with email on under `NODE_ENV=production`/`prod`/`staging`, or with an SMTP host other than `localhost`, `127.0.0.1`, `::1`, `mailhog` |
| Compose | MailHog is not in `docker-compose.yml`: run it on your machine (SMTP 1025, web UI 8025) |

Registration needs email too, so **the service refuses to start with the registration email check on (the default) and email off**,
and says how to fix it: `AUTH_EMAIL_ENABLED=true` with MailHog, or `AUTH_EMAIL_VERIFICATION_ENABLED=false`. (Two-step sign-in being
on offer does not stop the service starting: it is each user's choice, and switching it on is refused if no mail can be sent.)

```bash
# MailHog (SMTP on 1025, web interface on 8025): run the MailHog executable on your machine

# the auth service, in development
AUTH_EMAIL_ENABLED=true  npm run start:dev          # from services/auth-service; MailHog on localhost:1025
```

| Variable | Default | |
|---|---|---|
| `AUTH_EMAIL_VERIFICATION_ENABLED` | `true` | `false` creates the login without checking the email address |
| `AUTH_TWO_FACTOR_ENABLED` | `true` | `false` removes the per-user two-step option for everyone |
| `AUTH_EMAIL_ENABLED` | `false` | `true` only in development |
| `AUTH_EMAIL_SMTP_HOST` / `_PORT` | `localhost` / `1025` | Must be a local host |
| `AUTH_EMAIL_FROM` | `noreply@etpteamriya.com` | |
| `AUTH_OTP_*` | see above | Limits |

**Docker Compose** is production-like (`NODE_ENV=production`), where email is refused, so it runs with the registration email check **off**
and two-step sign-in **off** by default. To use MailHog with it:
`AUTH_NODE_ENV=development AUTH_EMAIL_ENABLED=true AUTH_EMAIL_VERIFICATION_ENABLED=true AUTH_TWO_FACTOR_ENABLED=true` with MailHog running on your machine.

**The table.** `otp_challenges` (and `users.two_factor_enabled`) is created by the auth service itself on every start-up (`CREATE TABLE ... IF NOT EXISTS`), in any
environment, so it does not matter how the database was prepared (TypeORM `synchronize` only runs under `NODE_ENV=development`).
It needs `users` to exist and a database user that may create tables; if that fails the log says so and points at
[`databases/PostgreSQL/migrations/add_auth_otp_challenges.sql`](../../databases/PostgreSQL/migrations/add_auth_otp_challenges.sql),
which you can run by hand instead (idempotent; nothing is dropped). `auth_setup.sql` has it for new databases.

**End-to-end tests** (Playwright) read codes from MailHog's API (`E2E_MAILHOG_URL`, default `http://localhost:8025`), so MailHog must be
running for any journey that registers or signs in with two-step on; the seeded users have two-step off, so a plain sign-in needs no mail.
`services/auth-service/test_e2e.sh` / `.ps1` call the old one-step register and login: run the service with
`AUTH_EMAIL_VERIFICATION_ENABLED=false` for them.

## Where the code is

| Part | Where |
|---|---|
| Flow | `auth-service/src/auth/login-flow.service.ts`, `password-reset.service.ts`, `registration-flow.service.ts`, `account-security.service.ts` (two-step switch, change password), `password-attempts.service.ts` (three tries per session) |
| Codes: create, check, spend | `src/otp/otp.service.ts` (+ `otp-challenges.repository.ts`, atomic conditional UPDATEs) |
| Settings and start-up guards | `src/otp/otp.config.ts`, `src/mail/mail.config.ts` |
| Email | `src/mail/` (`EmailSender`, `SmtpEmailSender`, `DisabledEmailSender`, `otp-messages.ts`) |
| Contract | `contracts/auth-api.yaml` |
| Angular | `features/auth/login-form` and `register-form` (code steps), `features/auth/forgot-password-form`, `layout/header/profile-menu`, `features/settings` (two-step switch), `core/auth.service.ts` |
