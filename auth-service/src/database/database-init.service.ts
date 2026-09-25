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
      // After TypeORM synchronize, ensure users_user_id_seq starts from 1001
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
      // Ensure next generated user_id is at least 1001 while preserving existing rows.
      await queryRunner.query(
        `SELECT setval(
            'users_user_id_seq',
            GREATEST(COALESCE((SELECT MAX(user_id) FROM users), 1000), 1000),
            true
         )`,
      );
      this.logger.log(
        'DatabaseInitService',
        'Database: users_user_id_seq set for next value >= 1001',
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
