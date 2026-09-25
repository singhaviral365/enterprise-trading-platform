import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedactingLogger } from '../common/logging/redacting.logger';

@Injectable()
export class DatabaseInitService implements OnModuleInit {
  constructor(
    private dataSource: DataSource,
    private logger: RedactingLogger,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    try {
      // After TypeORM synchronize, ensure users_user_id_seq starts from 1000
      await this.resetUserIdSequence();
    } catch (error) {
      this.logger.error('DatabaseInitService', 'Failed to initialize database', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - let the app continue even if this fails
    }
  }

  private async resetUserIdSequence(): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      // Reset the sequence to start from 1000
      // This ensures new user_ids begin at 1000, not 1
      await queryRunner.query(
        'SELECT setval(\'users_user_id_seq\', 1000, false)',
      );
      this.logger.log(
        'DatabaseInitService',
        'Database: users_user_id_seq reset to START 1000',
      );
    } catch (error) {
      this.logger.warn(
        'DatabaseInitService',
        'Database: Could not reset user_id sequence (may already be set)',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    } finally {
      await queryRunner.release();
    }
  }
}
