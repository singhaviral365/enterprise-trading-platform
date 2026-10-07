import { DisabledEmailSender } from './disabled-email-sender';
import { assertMailIsDevOnly, mailSettings } from './mail.config';
import { loginCodeMessage, maskEmail, passwordChangedMessage, passwordResetCodeMessage } from './otp-messages';
import { SmtpEmailSender } from './smtp-email-sender';

describe('mail settings', () => {
  it('is off, on MailHog defaults, unless it is switched on', () => {
    expect(mailSettings({})).toEqual({ enabled: false, host: 'localhost', port: 1025, from: 'noreply@etpteamriya.com' });
  });

  it('reads the switch, host, port and sender from the environment', () => {
    expect(
      mailSettings({
        AUTH_EMAIL_ENABLED: 'true',
        AUTH_EMAIL_SMTP_HOST: ' mailhog ',
        AUTH_EMAIL_SMTP_PORT: '2525',
        AUTH_EMAIL_FROM: 'auth@example.test',
      }),
    ).toEqual({ enabled: true, host: 'mailhog', port: 2525, from: 'auth@example.test' });
  });

  it('only a literal "true" switches it on, and a bad port falls back', () => {
    expect(mailSettings({ AUTH_EMAIL_ENABLED: '1' }).enabled).toBe(false);
    expect(mailSettings({ AUTH_EMAIL_ENABLED: 'TRUE' }).enabled).toBe(false);
    expect(mailSettings({ AUTH_EMAIL_SMTP_PORT: 'abc' }).port).toBe(1025);
  });
});

describe('assertMailIsDevOnly', () => {
  const on = (host = 'localhost') => ({ enabled: true, host, port: 1025, from: 'x@y.z' });

  it('allows email off anywhere', () => {
    expect(() => assertMailIsDevOnly({ ...on(), enabled: false }, { NODE_ENV: 'production' })).not.toThrow();
  });

  it.each(['localhost', '127.0.0.1', '::1', 'mailhog', 'LOCALHOST'])('allows the local host %s in development', (host) => {
    expect(() => assertMailIsDevOnly(on(host), { NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertMailIsDevOnly(on(host), {})).not.toThrow();
  });

  it.each(['production', 'prod', 'staging', 'PRODUCTION'])('refuses email while NODE_ENV is %s', (environment) => {
    expect(() => assertMailIsDevOnly(on(), { NODE_ENV: environment })).toThrow('development only');
  });

  it.each(['smtp.example.com', '10.0.0.5', 'localhost.evil.test'])('refuses the non-local SMTP host %s', (host) => {
    expect(() => assertMailIsDevOnly(on(host), { NODE_ENV: 'development' })).toThrow('AUTH_EMAIL_SMTP_HOST');
  });
});

describe('senders', () => {
  it('the default sender says it is off and refuses to send', async () => {
    const sender = new DisabledEmailSender();

    expect(sender.enabled()).toBe(false);
    await expect(sender.send()).rejects.toThrow('not enabled');
  });

  it('the SMTP sender passes the message on, with the configured sender address', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const sender = new SmtpEmailSender({ enabled: true, host: 'localhost', port: 1025, from: 'noreply@x.test' }, { sendMail });

    await sender.send('a@b.co', 'Hello', 'Body');

    expect(sender.enabled()).toBe(true);
    expect(sendMail).toHaveBeenCalledWith({ from: 'noreply@x.test', to: 'a@b.co', subject: 'Hello', text: 'Body' });
  });

  it('the SMTP sender cannot be used to inject a header through the subject', async () => {
    const sendMail = jest.fn().mockResolvedValue({});
    const sender = new SmtpEmailSender({ enabled: true, host: 'localhost', port: 1025, from: 'n@x.test' }, { sendMail });

    await sender.send('a@b.co', 'Hi\r\nBcc: evil@example.com', 'Body');

    expect(sendMail.mock.calls[0][0].subject).toBe('Hi Bcc: evil@example.com');
  });

  it('the SMTP sender fails when the mail server does', async () => {
    const sender = new SmtpEmailSender(
      { enabled: true, host: 'localhost', port: 1025, from: 'n@x.test' },
      { sendMail: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) },
    );

    await expect(sender.send('a@b.co', 'Hi', 'Body')).rejects.toThrow('ECONNREFUSED');
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
