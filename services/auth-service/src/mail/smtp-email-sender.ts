import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { EmailSender } from './email-sender';
import { MailSettings, domainOf } from './mail.config';

/** The recipient's domain is not on the allow-list of this deployment, so nothing was sent. Callers treat it as "not deliverable". */
export class RecipientNotAllowedError extends Error {
  constructor(domain: string) {
    super(`Mail to the domain "${domain}" is not allowed in this deployment (AUTH_EMAIL_ALLOWED_RECIPIENT_DOMAINS).`);
    this.name = 'RecipientNotAllowedError';
  }
}

/**
 * What nodemailer is given for these settings, as plain data so every mode can be checked without a network.
 *
 * - `dev` is plain SMTP to a local catcher: no TLS, no authentication.
 * - `prod` talks to a provider: STARTTLS (`requireTLS`) or an implicit-TLS connection (`secure`), TLS 1.2 or newer, the certificate is
 *   always verified (never turned off), authentication is sent, and the connection is pooled and rate-limited to stay under the
 *   provider's quota.
 * Timeouts are the same in both: 5 s to connect and greet, 10 s of silence on the socket.
 */
export function transportOptions(settings: MailSettings): SMTPTransport.Options & Pick<SMTPPool.Options, 'pool' | 'maxConnections' | 'rateLimit' | 'rateDelta'> {
  const options: SMTPTransport.Options & Pick<SMTPPool.Options, 'pool' | 'maxConnections' | 'rateLimit' | 'rateDelta'> = {
    host: settings.host,
    port: settings.port,
    secure: settings.tls === 'implicit',
    requireTLS: settings.tls === 'starttls',
    ignoreTLS: settings.tls === 'none',
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000,
  };
  if (settings.user && settings.password) {
    options.auth = { user: settings.user, pass: settings.password };
  }
  if (settings.tls !== 'none') {
    options.tls = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  }
  if (settings.mode === 'prod') {
    options.pool = true;
    options.maxConnections = 3;
    options.rateLimit = 5;
    options.rateDelta = 1000;
  }
  return options;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A small HTML version of a plain-text message: paragraphs for blank-line gaps, line breaks inside them. Everything is escaped. */
export function htmlFromText(body: string): string {
  const paragraphs = body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 12px">${escapeHtml(paragraph.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1f2937">${paragraphs}</div>`;
}

/**
 * Sends through an SMTP server, for the two modes that send anything. One class, because nodemailer already covers both: the difference
 * is the settings (see {@link transportOptions}). Each message goes out as plain text and a small HTML version. Only the provider's
 * answer (the message id) is logged, never the body (it carries one-time codes) or the password.
 */
export class SmtpEmailSender implements EmailSender {
  private readonly logger = new Logger(SmtpEmailSender.name);

  constructor(
    private readonly settings: MailSettings,
    private readonly transport: Pick<Transporter, 'sendMail'> = nodemailer.createTransport(transportOptions(settings)),
  ) {}

  enabled(): boolean {
    return true;
  }

  async send(to: string, subject: string, body: string, html?: string): Promise<void> {
    const allowed = this.settings.allowedRecipientDomains;
    if (allowed.length > 0 && !allowed.includes('*') && !allowed.includes(domainOf(to))) {
      throw new RecipientNotAllowedError(domainOf(to));
    }
    const info = await this.transport.sendMail({
      from: this.settings.from,
      to,
      ...(this.settings.replyTo ? { replyTo: this.settings.replyTo } : {}),
      subject: subject.replace(/[\r\n]+/g, ' ').trim(),
      text: body,
      html: html ?? htmlFromText(body),
    });
    const messageId = (info as { messageId?: string } | undefined)?.messageId;
    this.logger.log(`Mail accepted by the server${messageId ? ` (message id ${messageId})` : ''}`);
  }
}
