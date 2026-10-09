import { Logger, Module } from '@nestjs/common';
import { DisabledEmailSender } from './disabled-email-sender';
import { EMAIL_SENDER, EmailSender } from './email-sender';
import { assertMailSettings, ignoredSmtpVariables, mailSettings } from './mail.config';
import { SmtpEmailSender } from './smtp-email-sender';

/**
 * Wires exactly one sender, by `AUTH_EMAIL_MODE`. `off` (the default) wires the sender that sends nothing, and `SmtpEmailSender` is not
 * even created unless a sending mode passed its safety rules (`assertMailSettings`), so a deployment cannot send mail by accident.
 */
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: (): EmailSender => {
        const logger = new Logger('MailModule');
        const settings = mailSettings();
        assertMailSettings(settings);
        if (settings.usedLegacySwitch) {
          logger.warn('AUTH_EMAIL_ENABLED=true is deprecated and now means AUTH_EMAIL_MODE=dev; set AUTH_EMAIL_MODE instead.');
        }
        if (!settings.enabled) {
          const ignored = ignoredSmtpVariables();
          if (ignored.length > 0) {
            logger.log(`Email is off (AUTH_EMAIL_MODE=off), so ${ignored.join(', ')} ${ignored.length === 1 ? 'is' : 'are'} ignored.`);
          }
          return new DisabledEmailSender();
        }
        logger.log(`Email is on in ${settings.mode} mode through ${settings.host}:${settings.port} (TLS: ${settings.tls}).`);
        return new SmtpEmailSender(settings);
      },
    },
  ],
  exports: [EMAIL_SENDER],
})
export class MailModule {}
