/**
 * Email settings, read from the environment. Email is for DEVELOPMENT ONLY (MailHog, a local SMTP catcher that shows
 * what was "sent" at http://localhost:8025 and delivers nothing). It is off unless `AUTH_EMAIL_ENABLED=true`, and
 * `assertMailIsDevOnly` refuses to start the service if it is switched on anywhere that does not look like a
 * developer's machine. Nothing here sends anything: it only describes where mail would go.
 */
export interface MailSettings {
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly from: string;
}

/** Hosts an SMTP server may have while email is enabled. `mailhog` is the Docker Compose service name. */
export const LOCAL_SMTP_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '::1', 'mailhog'];

/** Environments where email must never be switched on, whatever else is configured. */
const NON_DEV_ENVIRONMENTS: readonly string[] = ['production', 'prod', 'staging'];

const DEFAULT_FROM = 'noreply@etpteamriya.com';

export function mailSettings(env: NodeJS.ProcessEnv = process.env): MailSettings {
  const port = parseInt(env.AUTH_EMAIL_SMTP_PORT || '', 10);
  return {
    enabled: env.AUTH_EMAIL_ENABLED === 'true',
    host: (env.AUTH_EMAIL_SMTP_HOST || 'localhost').trim(),
    port: Number.isFinite(port) && port > 0 ? port : 1025,
    from: (env.AUTH_EMAIL_FROM || DEFAULT_FROM).trim(),
  };
}

/** Stops the service from starting with email enabled outside development, or pointed at a non-local server. */
export function assertMailIsDevOnly(settings: MailSettings, env: NodeJS.ProcessEnv = process.env): void {
  if (!settings.enabled) {
    return;
  }
  const environment = (env.NODE_ENV || '').toLowerCase();
  if (NON_DEV_ENVIRONMENTS.includes(environment)) {
    throw new Error(
      `AUTH_EMAIL_ENABLED=true is not allowed when NODE_ENV=${environment}: email is for development only.`,
    );
  }
  if (!LOCAL_SMTP_HOSTS.includes(settings.host.toLowerCase())) {
    throw new Error(
      `AUTH_EMAIL_SMTP_HOST must be one of ${LOCAL_SMTP_HOSTS.join(', ')} while email is enabled ` +
        `(got "${settings.host}"): email is for development only.`,
    );
  }
}
