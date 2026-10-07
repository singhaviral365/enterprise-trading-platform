import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailSender } from './email-sender';
import { MailSettings } from './mail.config';

/**
 * Sends through a local SMTP server (MailHog, in development). Plain SMTP with no authentication and no TLS: it is only
 * ever created for a local host, which `assertMailIsDevOnly` has already checked. A real provider would be a different
 * class behind an explicit setting and a secrets manager; it is not part of this.
 */
export class SmtpEmailSender implements EmailSender {
  constructor(
    private readonly settings: MailSettings,
    private readonly transport: Pick<Transporter, 'sendMail'> = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: false,
      ignoreTLS: true,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    }),
  ) {}

  enabled(): boolean {
    return true;
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    await this.transport.sendMail({
      from: this.settings.from,
      to,
      subject: subject.replace(/[\r\n]+/g, ' ').trim(),
      text: body,
    });
  }
}
