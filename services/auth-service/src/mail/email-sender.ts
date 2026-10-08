/** Injection token for whichever sender is wired (see `MailModule`). Callers depend on this, never on SMTP. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  /** False for the sender that sends nothing, so callers can refuse early instead of promising a delivery. */
  enabled(): boolean;

  /**
   * Sends one message: the plain text, and a small HTML version of it (made from the text unless `html` is given). Rejects when the
   * mail server does not accept it, or when the recipient is not on the allow-list of a staging deployment. The subject is one line
   * (any line break is removed) so a header cannot be injected through it. The body is never logged: it holds one-time codes.
   */
  send(to: string, subject: string, body: string, html?: string): Promise<void>;
}
