import { Module } from '@nestjs/common';
import { AccountsClient } from './accounts.client';
import { RedactingLogger } from '../common/logging/redacting.logger';

@Module({
  providers: [AccountsClient, RedactingLogger],
  exports: [AccountsClient],
})
export class AccountsModule {}
