import { EmailSender } from './email-sender';

/** What is wired unless email is explicitly switched on, so every non-development environment gets this. */
export class DisabledEmailSender implements EmailSender {
  enabled(): boolean {
    return false;
  }

  async send(): Promise<void> {
    throw new Error('Email is not enabled in this environment');
  }
}
