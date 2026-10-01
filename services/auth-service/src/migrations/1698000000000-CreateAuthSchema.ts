import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAuthSchema1698000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
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
            isUnique: true,
            isNullable: false,
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
            default: `'{CUSTOMER}'`,
            isNullable: false,
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
        checks: [
          {
            expression: `LENGTH(username) >= 3 AND LENGTH(username) <= 64`,
            name: 'chk_username_length',
          },
          {
            expression: `username ~ '^[a-zA-Z0-9._-]+$'`,
            name: 'chk_username_pattern',
          },
          {
            expression: `account_id > 0`,
            name: 'chk_account_id',
          },
          {
            expression: `array_length(roles, 1) > 0`,
            name: 'chk_roles_not_empty',
          },
        ],
      }),
      true,
    );

    // Create indices for users table
    await queryRunner.createIndex(
      'users',
      new TableIndex({
        columnNames: ['username'],
        name: 'idx_users_username',
      }),
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        columnNames: ['account_id'],
        name: 'idx_users_account_id',
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
            isUnique: true,
            isNullable: false,
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
            referencedColumnNames: ['id'],
            referencedTableName: 'users',
            onDelete: 'CASCADE',
            name: 'fk_refresh_tokens_user_id',
          },
        ],
        checks: [
          {
            expression: `expires_at > issued_at`,
            name: 'chk_token_expiry',
          },
          {
            expression: `revoked_at IS NULL OR revoked_at >= issued_at`,
            name: 'chk_revoked_logic',
          },
        ],
      }),
      true,
    );

    // Create indices for refresh_tokens table
    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        columnNames: ['user_id'],
        name: 'idx_refresh_tokens_user_id',
      }),
    );

    await queryRunner.createIndex(
      'refresh_tokens',
      new TableIndex({
        columnNames: ['revoked_at'],
        name: 'idx_refresh_tokens_active',
        where: 'revoked_at IS NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refresh_tokens', true);
    await queryRunner.dropTable('users', true);
  }
}
