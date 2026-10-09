import { DisabledEmailSender } from './disabled-email-sender';
import {
  MailSettings,
  assertMailSettings,
  domainOf,
  ignoredSmtpVariables,
  isLocalHost,
  mailSettings,
} from './mail.config';
import { loginCodeMessage, maskEmail, passwordChangedMessage, passwordResetCodeMessage } from './otp-messages';
import { RecipientNotAllowedError, SmtpEmailSender, htmlFromText, transportOptions } from './smtp-email-sender';

const settings = (over: Partial<MailSettings> = {}): MailSettings => ({
  mode: 'dev',
  enabled: true,
  host: 'localhost',
  port: 1025,
  tls: 'none',
  user: null,
  password: null,
  from: 'noreply@etpteamriya.com',
  fromDomains: [],
  allowedRecipientDomains: [],
  replyTo: null,
  usedLegacySwitch: false,
  ...over,
});

const prod = (over: Partial<MailSettings> = {}): MailSettings =>
  settings({
    mode: 'prod',
    host: 'smtp.mail-provider.example',
    port: 587,
    tls: 'starttls',
    user: 'api-user',
    password: 'api-secret',
    fromDomains: ['etpteamriya.com'],
    ...over,
  });

describe('mail settings', () => {
  it('is off, and needs nothing else, unless a mode is chosen', () => {
    expect(mailSettings({})).toEqual({
      mode: 'off',
      enabled: false,
      host: '',
      port: 0,
      tls: 'none',
      user: null,
      password: null,
      from: '',
      fromDomains: [],
      allowedRecipientDomains: [],
      replyTo: null,
      usedLegacySwitch: false,
    });
  });

  it('reads the mode, host, port, sender and reply-to from the environment', () => {
    expect(
      mailSettings({
        AUTH_EMAIL_MODE: ' DEV ',
        MAILHOG_SMTP_PORT: '1025',
        AUTH_EMAIL_SMTP_HOST: ' mailhog ',
        AUTH_EMAIL_SMTP_PORT: '2525',
        AUTH_EMAIL_FROM: 'auth@example.test',
        AUTH_EMAIL_REPLY_TO: 'help@example.test',
      }),
    ).toMatchObject({ mode: 'dev', enabled: true, host: 'mailhog', port: 2525, from: 'auth@example.test', replyTo: 'help@example.test' });
  });

  it('refuses a mode it does not know, naming the variable', () => {
    expect(() => mailSettings({ AUTH_EMAIL_MODE: 'live' })).toThrow('AUTH_EMAIL_MODE must be one of off, dev, prod');
    expect(() => mailSettings({ AUTH_EMAIL_SMTP_TLS: 'ssl' })).toThrow('AUTH_EMAIL_SMTP_TLS must be one of');
  });

  it('keeps AUTH_EMAIL_ENABLED=true as an alias for dev, and says it was used; the mode wins when both are set', () => {
    const dev = { MAILHOG_HOST: 'localhost', MAILHOG_SMTP_PORT: '1025', AUTH_EMAIL_FROM: 'a@b.test' };
    expect(mailSettings({ ...dev, AUTH_EMAIL_ENABLED: 'true' })).toMatchObject({ mode: 'dev', enabled: true, usedLegacySwitch: true });
    expect(mailSettings({ AUTH_EMAIL_ENABLED: '1' }).mode).toBe('off');
    expect(mailSettings({ AUTH_EMAIL_ENABLED: 'TRUE' }).mode).toBe('off');
    expect(mailSettings({ AUTH_EMAIL_ENABLED: 'true', AUTH_EMAIL_MODE: 'off' })).toMatchObject({ mode: 'off', usedLegacySwitch: false });
  });

  it('uses the standard port of the TLS mode in prod, MailHog in dev, and falls back to those on a bad port', () => {
    const from = { AUTH_EMAIL_FROM: 'a@b.test' };
    expect(mailSettings({ ...from, AUTH_EMAIL_MODE: 'prod' })).toMatchObject({ tls: 'starttls', port: 587 });
    expect(mailSettings({ ...from, AUTH_EMAIL_MODE: 'prod', AUTH_EMAIL_SMTP_TLS: 'implicit' })).toMatchObject({ tls: 'implicit', port: 465 });
    const dev = { ...from, AUTH_EMAIL_MODE: 'dev', MAILHOG_HOST: 'mail.local', MAILHOG_SMTP_PORT: '2525' };
    expect(mailSettings({ ...dev, AUTH_EMAIL_SMTP_PORT: 'abc' })).toMatchObject({ port: 2525, host: 'mail.local' });
  });

  it('needs a sender once mail is on, and the MailHog address in dev, and names the key to fill in', () => {
    expect(() => mailSettings({ AUTH_EMAIL_MODE: 'prod' })).toThrow('auth.email.from');
    expect(() => mailSettings({ AUTH_EMAIL_MODE: 'dev', AUTH_EMAIL_FROM: 'a@b.test' })).toThrow('services.mailhog');
  });

  it('reads credentials and the two domain lists, lowercased and trimmed', () => {
    const read = mailSettings({
      AUTH_EMAIL_MODE: 'prod',
      AUTH_EMAIL_FROM: 'a@b.test',
      AUTH_EMAIL_SMTP_USER: ' u ',
      AUTH_EMAIL_SMTP_PASSWORD: ' p ',
      AUTH_EMAIL_FROM_DOMAINS: 'Example.com, other.org ,',
      AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS: ' Me.test',
    });

    expect(read).toMatchObject({ user: 'u', password: 'p', fromDomains: ['example.com', 'other.org'], allowedRecipientDomains: ['me.test'] });
  });

  it('knows which SMTP variables are set while mail is off, so they can be reported as ignored', () => {
    expect(ignoredSmtpVariables({})).toEqual([]);
    expect(ignoredSmtpVariables({ AUTH_EMAIL_SMTP_HOST: 'x', AUTH_EMAIL_SMTP_PASSWORD: ' ', AUTH_EMAIL_SMTP_TLS: 'none' })).toEqual([
      'AUTH_EMAIL_SMTP_HOST',
      'AUTH_EMAIL_SMTP_TLS',
    ]);
  });

  it('takes the domain of an address', () => {
    expect(domainOf('A@Example.COM')).toBe('example.com');
    expect(domainOf('no-at-sign')).toBe('');
  });
});

describe('assertMailSettings: off', () => {
  it('passes anywhere, whatever else is configured', () => {
    expect(() => assertMailSettings(settings({ mode: 'off', enabled: false, host: 'smtp.real.example' }), { NODE_ENV: 'production' })).not.toThrow();
  });
});

describe('assertMailSettings: dev', () => {
  it.each(['localhost', '127.0.0.1', '::1', 'mailhog', 'LOCALHOST', 'host.docker.internal'])('allows the local host %s in development', (host) => {
    expect(isLocalHost(host)).toBe(true);
    expect(() => assertMailSettings(settings({ host }), { NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertMailSettings(settings({ host }), {})).not.toThrow();
  });

  it.each(['production', 'prod', 'staging', 'PRODUCTION'])('refuses dev mail while NODE_ENV is %s, and points to prod mode', (environment) => {
    expect(() => assertMailSettings(settings(), { NODE_ENV: environment })).toThrow('AUTH_EMAIL_MODE=prod');
  });

  it.each(['smtp.example.com', '10.0.0.5', 'localhost.evil.test'])('refuses the non-local SMTP host %s', (host) => {
    expect(() => assertMailSettings(settings({ host }), { NODE_ENV: 'development' })).toThrow('AUTH_EMAIL_SMTP_HOST');
  });
});

describe('assertMailSettings: prod', () => {
  it('accepts a real provider over TLS with credentials, from a configured domain, in production', () => {
    expect(() => assertMailSettings(prod(), { NODE_ENV: 'production' })).not.toThrow();
  });

  it('is fine in a non-production deployment only with a recipient allow-list', () => {
    expect(() => assertMailSettings(prod(), { NODE_ENV: 'development' })).toThrow('AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS');
    expect(() => assertMailSettings(prod(), {})).toThrow('AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS');
    expect(() => assertMailSettings(prod({ allowedRecipientDomains: ['me.test'] }), { NODE_ENV: 'staging' })).not.toThrow();
  });

  it.each(['localhost', 'mailhog', '127.0.0.1'])('refuses the local host %s', (host) => {
    expect(() => assertMailSettings(prod({ host }), { NODE_ENV: 'production' })).toThrow('not the local host');
  });

  it('refuses a connection without TLS', () => {
    expect(() => assertMailSettings(prod({ tls: 'none' }), { NODE_ENV: 'production' })).toThrow('AUTH_EMAIL_SMTP_TLS');
    expect(() => assertMailSettings(prod({ tls: 'implicit', port: 465 }), { NODE_ENV: 'production' })).not.toThrow();
  });

  it('refuses missing credentials', () => {
    expect(() => assertMailSettings(prod({ user: null }), { NODE_ENV: 'production' })).toThrow('AUTH_EMAIL_SMTP_USER and AUTH_EMAIL_SMTP_PASSWORD');
    expect(() => assertMailSettings(prod({ password: null }), { NODE_ENV: 'production' })).toThrow('AUTH_EMAIL_SMTP_USER and AUTH_EMAIL_SMTP_PASSWORD');
  });

  it('wants the sender address on a configured domain', () => {
    expect(() => assertMailSettings(prod({ fromDomains: [] }), { NODE_ENV: 'production' })).toThrow('AUTH_EMAIL_FROM_DOMAINS');
    expect(() => assertMailSettings(prod({ from: 'noreply@elsewhere.test' }), { NODE_ENV: 'production' })).toThrow('must be on one of AUTH_EMAIL_FROM_DOMAINS');
  });

  it('reports every problem at once, never the password', () => {
    let message = '';
    try {
      assertMailSettings(prod({ host: 'localhost', tls: 'none', user: null, password: 'topsecret', fromDomains: [] }), { NODE_ENV: 'production' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('not configured safely');
    expect(message).toContain('not the local host');
    expect(message).toContain('AUTH_EMAIL_SMTP_TLS');
    expect(message).toContain('AUTH_EMAIL_FROM_DOMAINS');
    expect(message).not.toContain('topsecret');
  });
});

describe('transport options', () => {
  it('dev is plain SMTP to a local catcher: no TLS, no authentication, no pool', () => {
    const options = transportOptions(settings());

    expect(options).toMatchObject({ host: 'localhost', port: 1025, secure: false, requireTLS: false, ignoreTLS: true });
    expect(options.auth).toBeUndefined();
    expect(options.tls).toBeUndefined();
    expect(options.pool).toBeUndefined();
  });

  it('prod with STARTTLS requires it, authenticates, verifies the certificate on TLS 1.2 or newer, and pools within a rate limit', () => {
    const options = transportOptions(prod());

    expect(options).toMatchObject({ host: 'smtp.mail-provider.example', port: 587, secure: false, requireTLS: true, ignoreTLS: false });
    expect(options.auth).toEqual({ user: 'api-user', pass: 'api-secret' });
    expect(options.tls).toEqual({ minVersion: 'TLSv1.2', rejectUnauthorized: true });
    expect(options).toMatchObject({ pool: true, maxConnections: 3, rateLimit: 5, rateDelta: 1000 });
  });

  it('prod with implicit TLS connects over TLS from the start', () => {
    const options = transportOptions(prod({ tls: 'implicit', port: 465 }));

    expect(options).toMatchObject({ port: 465, secure: true, requireTLS: false, ignoreTLS: false });
    expect(options.tls?.rejectUnauthorized).toBe(true);
  });

  it('keeps the same timeouts in every mode', () => {
    for (const options of [transportOptions(settings()), transportOptions(prod())]) {
      expect(options).toMatchObject({ connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000 });
    }
  });
});

describe('senders', () => {
  it('the default sender says it is off and refuses to send', async () => {
    const sender = new DisabledEmailSender();

    expect(sender.enabled()).toBe(false);
    await expect(sender.send()).rejects.toThrow('not enabled');
  });

  it('the SMTP sender passes the message on as text and a small HTML version, from the configured address', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: '<abc@x>' });
    const sender = new SmtpEmailSender(settings({ from: 'noreply@x.test' }), { sendMail });

    await sender.send('a@b.co', 'Hello', 'Your code is 123456');

    expect(sender.enabled()).toBe(true);
    const sent = sendMail.mock.calls[0][0];
    expect(sent).toMatchObject({ from: 'noreply@x.test', to: 'a@b.co', subject: 'Hello', text: 'Your code is 123456' });
    expect(sent.html).toContain('Your code is 123456');
    expect(sent.html).toContain('<p');
  });

  it('uses the HTML it is given, and adds a Reply-To only when one is configured', async () => {
    const sendMail = jest.fn().mockResolvedValue({});

    await new SmtpEmailSender(settings(), { sendMail }).send('a@b.co', 'Hi', 'Body', '<b>Custom</b>');
    await new SmtpEmailSender(settings({ replyTo: 'help@x.test' }), { sendMail }).send('a@b.co', 'Hi', 'Body');

    expect(sendMail.mock.calls[0][0].html).toBe('<b>Custom</b>');
    expect(sendMail.mock.calls[0][0].replyTo).toBeUndefined();
    expect(sendMail.mock.calls[1][0].replyTo).toBe('help@x.test');
  });

  it('cannot be used to inject a header through the subject', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const sender = new SmtpEmailSender(settings(), { sendMail });

    await sender.send('a@b.co', 'Hi\r\nBcc: evil@example.com', 'Body');

    expect(sendMail.mock.calls[0][0].subject).toBe('Hi Bcc: evil@example.com');
  });

  it('fails when the mail server does', async () => {
    const sender = new SmtpEmailSender(settings(), { sendMail: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });

    await expect(sender.send('a@b.co', 'Hi', 'Body')).rejects.toThrow('ECONNREFUSED');
  });

  it('sends only to the allowed domains when there is an allow-list, and says nothing was sent otherwise', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const sender = new SmtpEmailSender(prod({ allowedRecipientDomains: ['me.test'] }), { sendMail });

    await sender.send('Someone@ME.test', 'Hi', 'Body');
    await expect(sender.send('customer@gmail.com', 'Hi', 'Body')).rejects.toThrow(RecipientNotAllowedError);
    await expect(sender.send('customer@gmail.com', 'Hi', 'Body')).rejects.toThrow('gmail.com');

    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('treats * in the allow-list as anyone, which also satisfies the non-production requirement', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const settings = prod({ allowedRecipientDomains: ['*'] });

    expect(() => assertMailSettings(settings, { NODE_ENV: 'development' })).not.toThrow();
    await new SmtpEmailSender(settings, { sendMail }).send('customer@gmail.com', 'Hi', 'Body');

    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('never writes the body, the code in it, or the password to the log', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const sender = new SmtpEmailSender(prod({ password: 'topsecret-pw' }), { sendMail: jest.fn().mockResolvedValue({ messageId: '<m1@x>' }) });

    await sender.send('a@b.co', 'Your code', 'Code 482913');

    const written = [...log.mock.calls, ...stdout.mock.calls].flat().join(' ');
    log.mockRestore();
    stdout.mockRestore();
    expect(written).not.toContain('482913');
    expect(written).not.toContain('topsecret-pw');
  });
});

describe('htmlFromText', () => {
  it('makes paragraphs and line breaks, and escapes everything', () => {
    const html = htmlFromText('Hello <b>you</b> & "co"\nsecond line\n\nNext paragraph');

    expect(html).toContain('Hello &lt;b&gt;you&lt;/b&gt; &amp; &quot;co&quot;<br>second line');
    expect(html.match(/<p /g)).toHaveLength(2);
    expect(html).not.toContain('<b>');
  });
});

describe('messages', () => {
  it('a sign-in code email carries the code, its lifetime and no link', () => {
    const message = loginCodeMessage('482913', 300);

    expect(message.subject).toContain('482913');
    expect(message.body).toContain('482913');
    expect(message.body).toContain('5 minutes');
    expect(message.body).not.toMatch(/https?:/);
  });

  it('a reset code email says it can be ignored, and a change notice says what happened', () => {
    expect(passwordResetCodeMessage('111222', 600).body).toContain('ignore this email');
    expect(passwordResetCodeMessage('111222', 600).body).toContain('10 minutes');
    expect(passwordChangedMessage().body).toContain('signed out everywhere');
    expect(loginCodeMessage('111222', 30).body).toContain('1 minute');
  });

  it('masks an address down to its first letter and domain', () => {
    expect(maskEmail('aviralsingh00028@gmail.com')).toBe('a***@gmail.com');
    expect(maskEmail('x@y.co')).toBe('x***@y.co');
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@nodomainuser')).toBe('***');
  });
});
