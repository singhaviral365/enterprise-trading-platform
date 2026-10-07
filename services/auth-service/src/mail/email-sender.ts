/** Injection token for whichever sender is wired (see `MailModule`). Callers depend on this, never on SMTP. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  /** False for the sender that sends nothing, so callers can refuse early instead of promising a delivery. */
  enabled(): boolean;

  /**
   * Sends one plain-text message. Rejects when the mail server does not accept it. The subject is one line (any line
   * break is removed) so a header cannot be injected through it.
   */
  send(to: string, subject: string, body: string): Promise<void>;
}
