import { Module } from '@nestjs/common';
import { DisabledEmailSender } from './disabled-email-sender';
import { EMAIL_SENDER, EmailSender } from './email-sender';
import { assertMailIsDevOnly, mailSettings } from './mail.config';
import { SmtpEmailSender } from './smtp-email-sender';

/**
 * Wires exactly one sender. Email is off by default and `SmtpEmailSender` is not even created unless it is switched on
 * (and the settings pass the development-only check), so a production deployment cannot send mail by accident.
 */
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: (): EmailSender => {
        const settings = mailSettings();
        assertMailIsDevOnly(settings);
        return settings.enabled ? new SmtpEmailSender(settings) : new DisabledEmailSender();
      },
    },
  ],
  exports: [EMAIL_SENDER],
})
export class MailModule {}
