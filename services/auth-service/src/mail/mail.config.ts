/**
 * Email settings, read from the environment, and the rules each mode must obey. Nothing here sends anything: it describes where mail
 * would go and refuses to start the service when that is unsafe.
 *
 * | `AUTH_EMAIL_MODE` | Purpose | Sender | Guard |
 * |---|---|---|---|
 * | `off` (default) | Nothing is sent. Every other environment | `DisabledEmailSender` | Nothing to check; SMTP variables present are ignored (one log line says so) |
 * | `dev` | See mail locally without delivering it (MailHog) | SMTP, no TLS, no auth | The host must be local; refused when `NODE_ENV` is production, prod or staging |
 * | `prod` | Deliver to real addresses | SMTP to a provider over TLS with authentication | The host must not be local, TLS is required, a user and password are required, `AUTH_EMAIL_FROM` must be on `AUTH_EMAIL_FROM_DOMAINS`; and a deployment whose `NODE_ENV` is not `production` (staging, a demo) must set `AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS` so it cannot mail real customers |
 *
 * The mode is chosen explicitly and independently of whether the process is "production-like": the compose stack runs
 * `NODE_ENV=production` and a test deployment may still want real mail. `AUTH_EMAIL_ENABLED=true` is kept for one release as an alias
 * for `AUTH_EMAIL_MODE=dev`.
 *
 * | Variable | Default | Meaning |
 * |---|---|---|
 * | `AUTH_EMAIL_MODE` | `off` | `off`, `dev` or `prod` |
 * | `AUTH_EMAIL_SMTP_HOST` / `AUTH_EMAIL_SMTP_PORT` | `localhost` / 1025 (dev), 587 (prod, 465 with `implicit`) | The SMTP server |
 * | `AUTH_EMAIL_SMTP_TLS` | `none` (dev), `starttls` (prod) | `starttls`, `implicit` or `none`. `prod` refuses `none` |
 * | `AUTH_EMAIL_SMTP_USER` / `AUTH_EMAIL_SMTP_PASSWORD` | none | Credentials; required in `prod`, never logged |
 * | `AUTH_EMAIL_FROM` | `noreply@etpteamriya.com` | The sender address |
 * | `AUTH_EMAIL_FROM_DOMAINS` | none | Comma list of domains `AUTH_EMAIL_FROM` may be on; required in `prod` |
 * | `AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS` | none | Comma list: mail goes only to these domains. `*` means any recipient, said on purpose. Empty means no restriction, allowed only in `prod` with `NODE_ENV=production` |
 * | `AUTH_EMAIL_REPLY_TO` | none | Optional Reply-To address |
 */
export type MailMode = 'off' | 'dev' | 'prod';
export type MailTls = 'starttls' | 'implicit' | 'none';

export interface MailSettings {
  readonly mode: MailMode;
  /** Anything but `off`: a sender that really sends is wired. */
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly tls: MailTls;
  readonly user: string | null;
  readonly password: string | null;
  readonly from: string;
  readonly fromDomains: readonly string[];
  readonly allowedRecipientDomains: readonly string[];
  readonly replyTo: string | null;
  /** The deprecated `AUTH_EMAIL_ENABLED` switch chose the mode (so the service can say so once). */
  readonly usedLegacySwitch: boolean;
}

/** Hosts an SMTP server may have in `dev` mode. `mailhog` is the Docker Compose service name; `host.docker.internal` is the Windows host seen from a container. */
export const LOCAL_SMTP_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '::1', 'mailhog', 'host.docker.internal'];

/** Environments where `dev` mode must never be used, whatever else is configured. */
const NON_DEV_ENVIRONMENTS: readonly string[] = ['production', 'prod', 'staging'];

export const DEFAULT_FROM = 'noreply@etpteamriya.com';

const MODES: readonly MailMode[] = ['off', 'dev', 'prod'];
const TLS_VALUES: readonly MailTls[] = ['starttls', 'implicit', 'none'];

function list(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

function text(raw: string | undefined): string | null {
  const value = (raw ?? '').trim();
  return value.length > 0 ? value : null;
}

/** The domain part of an address, lowercased; empty if it has none. */
export function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return at >= 0 ? address.slice(at + 1).trim().toLowerCase() : '';
}

function parseMode(env: NodeJS.ProcessEnv): { mode: MailMode; legacy: boolean } {
  const raw = (env.AUTH_EMAIL_MODE ?? '').trim().toLowerCase();
  if (raw !== '') {
    if (!MODES.includes(raw as MailMode)) {
      throw new Error(`AUTH_EMAIL_MODE must be one of ${MODES.join(', ')} (got "${env.AUTH_EMAIL_MODE}").`);
    }
    return { mode: raw as MailMode, legacy: false };
  }
  return env.AUTH_EMAIL_ENABLED === 'true' ? { mode: 'dev', legacy: true } : { mode: 'off', legacy: false };
}

export function mailSettings(env: NodeJS.ProcessEnv = process.env): MailSettings {
  const { mode, legacy } = parseMode(env);

  const rawTls = (env.AUTH_EMAIL_SMTP_TLS ?? '').trim().toLowerCase();
  if (rawTls !== '' && !TLS_VALUES.includes(rawTls as MailTls)) {
    throw new Error(`AUTH_EMAIL_SMTP_TLS must be one of ${TLS_VALUES.join(', ')} (got "${env.AUTH_EMAIL_SMTP_TLS}").`);
  }
  const tls: MailTls = rawTls !== '' ? (rawTls as MailTls) : mode === 'prod' ? 'starttls' : 'none';

  const port = parseInt(env.AUTH_EMAIL_SMTP_PORT || '', 10);
  const defaultPort = mode === 'prod' ? (tls === 'implicit' ? 465 : 587) : 1025;

  return {
    mode,
    enabled: mode !== 'off',
    host: (env.AUTH_EMAIL_SMTP_HOST || 'localhost').trim(),
    port: Number.isFinite(port) && port > 0 ? port : defaultPort,
    tls,
    user: text(env.AUTH_EMAIL_SMTP_USER),
    password: text(env.AUTH_EMAIL_SMTP_PASSWORD),
    from: (env.AUTH_EMAIL_FROM || DEFAULT_FROM).trim(),
    fromDomains: list(env.AUTH_EMAIL_FROM_DOMAINS),
    allowedRecipientDomains: list(env.AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS),
    replyTo: text(env.AUTH_EMAIL_REPLY_TO),
    usedLegacySwitch: legacy,
  };
}

/** True for a host that is the developer's own machine (or the Docker Compose catcher). */
export function isLocalHost(host: string): boolean {
  return LOCAL_SMTP_HOSTS.includes(host.trim().toLowerCase());
}

/**
 * Stops the service from starting with email set up unsafely: the rules of each mode (see the table at the top of the file). `off`
 * always passes. Every failure names the variable to change.
 */
export function assertMailSettings(settings: MailSettings, env: NodeJS.ProcessEnv = process.env): void {
  const environment = (env.NODE_ENV || '').toLowerCase();

  if (settings.mode === 'dev') {
    if (NON_DEV_ENVIRONMENTS.includes(environment)) {
      throw new Error(
        `AUTH_EMAIL_MODE=dev is not allowed when NODE_ENV=${environment}: dev mail is for development only. ` +
          'Use AUTH_EMAIL_MODE=prod with a real provider, or AUTH_EMAIL_MODE=off.',
      );
    }
    if (!isLocalHost(settings.host)) {
      throw new Error(
        `AUTH_EMAIL_SMTP_HOST must be one of ${LOCAL_SMTP_HOSTS.join(', ')} in dev mode ` +
          `(got "${settings.host}"): dev mail is for development only.`,
      );
    }
    return;
  }

  if (settings.mode === 'prod') {
    const problems: string[] = [];
    if (isLocalHost(settings.host)) {
      problems.push(`AUTH_EMAIL_SMTP_HOST must be a real provider in prod mode, not the local host "${settings.host}"`);
    }
    if (settings.tls === 'none') {
      problems.push('AUTH_EMAIL_SMTP_TLS must be starttls or implicit in prod mode (a provider connection without TLS is refused)');
    }
    if (!settings.user || !settings.password) {
      problems.push('AUTH_EMAIL_SMTP_USER and AUTH_EMAIL_SMTP_PASSWORD are required in prod mode');
    }
    if (settings.fromDomains.length === 0) {
      problems.push('AUTH_EMAIL_FROM_DOMAINS must list the domain(s) mail is sent from in prod mode');
    } else if (!settings.fromDomains.includes(domainOf(settings.from))) {
      problems.push(`AUTH_EMAIL_FROM (${settings.from}) must be on one of AUTH_EMAIL_FROM_DOMAINS (${settings.fromDomains.join(', ')})`);
    }
    if (environment !== 'production' && settings.allowedRecipientDomains.length === 0) {
      problems.push(
        `AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS is required in prod mode when NODE_ENV is not production (it is "${environment || 'unset'}"), ` +
          'so a staging or demo deployment cannot mail real customers',
      );
    }
    if (problems.length > 0) {
      throw new Error(`AUTH_EMAIL_MODE=prod is not configured safely: ${problems.join('; ')}.`);
    }
  }
}

/** Names the SMTP variables that are set while mail is off, so a half-configured deployment is not a silent mystery. */
export function ignoredSmtpVariables(env: NodeJS.ProcessEnv = process.env): string[] {
  return ['AUTH_EMAIL_SMTP_HOST', 'AUTH_EMAIL_SMTP_PORT', 'AUTH_EMAIL_SMTP_USER', 'AUTH_EMAIL_SMTP_PASSWORD', 'AUTH_EMAIL_SMTP_TLS'].filter(
    (name) => (env[name] ?? '').trim() !== '',
  );
}
