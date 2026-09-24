import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Create initial auth schema: users and refresh_tokens tables.
 * 
 * Design Decision:
 * - Users table includes email and optional client fields (client_name, phone_no, dob)
 * - No separate client table (consolidation for simplicity)
 * - Single source of truth for authentication
 * - Matches auth-api.yaml contract requirements
 */
export class InitAuthSchema1695000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table with auth + optional client fields
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'username',
            type: 'varchar',
            length: '64',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'password_hash',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'account_id',
            type: 'bigint',
            isNullable: false,
          },
          {
            name: 'roles',
            type: 'text',
            isArray: true,
            default: "'{CUSTOMER}'",
            isNullable: false,
          },
          {
            name: 'client_name',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'phone_no',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'dob',
            type: 'date',
            isNullable: true,
          },
          {
            name: 'created_on',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'idx_users_username',
        columnNames: ['username'],
      }),
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'idx_users_email',
        columnNames: ['email'],
      }),
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'idx_users_account_id',
        columnNames: ['account_id'],
      }),
    );

    // Create refresh_tokens table
    await queryRunner.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'token_hash',
            type: 'varchar',
            length: '255',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'issued_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'expires_at',
            type: 'timestamptz',
            isNullable: false,
          },
          {
            name: 'revoked_at',
            type: 'timestamptz',
            isNullable: true,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // Create indexes for refresh_tokens
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'idx_refresh_tokens_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        name: 'idx_refresh_tokens_active',
        columnNames: ['revoked_at'],
        where: 'revoked_at IS NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refresh_tokens', true, true, true);
    await queryRunner.dropTable('users', true, true, true);
  }
}
