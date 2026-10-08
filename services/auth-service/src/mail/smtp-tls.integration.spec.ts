import { AddressInfo } from 'net';
import { SMTPServer, SMTPServerAuthentication, SMTPServerAuthenticationResponse, SMTPServerSession } from 'smtp-server';
import * as nodemailer from 'nodemailer';
import { MailSettings } from './mail.config';
import { SmtpEmailSender, transportOptions } from './smtp-email-sender';

/**
 * The prod path for real: an in-process SMTP server that offers STARTTLS and requires authentication, so the sender is shown to negotiate TLS
 * and log in, with no network and no real mail. The server's certificate is its own self-signed one, so the test client (and only the test
 * client) accepts it; the sender's real options never turn certificate checking off (see the unit test of `transportOptions`).
 */
describe('SmtpEmailSender against an SMTP server that wants STARTTLS and authentication', () => {
  let server: SMTPServer;
  let port: number;
  let received: { from: string; to: string[]; raw: string; user: string | undefined; secure: boolean }[];

  const prod = (over: Partial<MailSettings> = {}): MailSettings => ({
    mode: 'prod',
    enabled: true,
    host: '127.0.0.1',
    port,
    tls: 'starttls',
    user: 'api-user',
    password: 'api-secret',
    from: 'noreply@etpteamriya.com',
    fromDomains: ['etpteamriya.com'],
    allowedRecipientDomains: [],
    replyTo: null,
    usedLegacySwitch: false,
    ...over,
  });

  /** The real options with the one change a self-signed test certificate needs. */
  const senderFor = (settings: MailSettings) =>
    new SmtpEmailSender(
      settings,
      nodemailer.createTransport({
        ...transportOptions(settings),
        pool: false,
        tls: { minVersion: 'TLSv1.2', rejectUnauthorized: false },
      }),
    );

  beforeAll(async () => {
    // smtp-server warns about its built-in test certificate on every start; that certificate is exactly what this test wants.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    received = [];
    server = new SMTPServer({
      authOptional: false,
      disabledCommands: [],
      onAuth(auth: SMTPServerAuthentication, _session: SMTPServerSession, callback: (error: Error | null | undefined, response?: SMTPServerAuthenticationResponse) => void) {
        if (auth.username === 'api-user' && auth.password === 'api-secret') {
          callback(null, { user: auth.username });
        } else {
          callback(new Error('Invalid username or password'));
        }
      },
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
            to: session.envelope.rcptTo.map((r) => r.address),
            raw: Buffer.concat(chunks).toString('utf8'),
            user: typeof session.user === 'string' ? session.user : undefined,
            secure: session.secure,
          });
          callback();
        });
      },
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    received = [];
  });

  it('upgrades to TLS, authenticates, and delivers a multipart message', async () => {
    await senderFor(prod()).send('customer@example.com', 'Your sign-in code is 123456', 'Your code is 123456.\n\nIt works for 5 minutes.');

    expect(received).toHaveLength(1);
    expect(received[0].secure).toBe(true);
    expect(received[0].user).toBe('api-user');
    expect(received[0].from).toBe('noreply@etpteamriya.com');
    expect(received[0].to).toEqual(['customer@example.com']);
    expect(received[0].raw).toContain('Subject: Your sign-in code is 123456');
    expect(received[0].raw).toContain('Content-Type: multipart/alternative');
    expect(received[0].raw).toContain('Content-Type: text/plain');
    expect(received[0].raw).toContain('Content-Type: text/html');
  });

  it('is refused with the wrong password, and nothing is delivered', async () => {
    await expect(senderFor(prod({ password: 'wrong' })).send('customer@example.com', 'Hi', 'Body')).rejects.toThrow();

    expect(received).toHaveLength(0);
  });

  it('does not send in the clear when the server cannot do TLS: STARTTLS is required, not optional', async () => {
    const plain = new SMTPServer({ authOptional: true, disabledCommands: ['STARTTLS'], onData: (stream, _session, callback) => stream.on('end', () => callback()).resume() });
    await new Promise<void>((resolve) => plain.listen(0, '127.0.0.1', resolve));
    const plainPort = (plain.server.address() as AddressInfo).port;

    await expect(senderFor(prod({ port: plainPort })).send('customer@example.com', 'Hi', 'Body')).rejects.toThrow();

    await new Promise<void>((resolve) => plain.close(() => resolve()));
  });
});
