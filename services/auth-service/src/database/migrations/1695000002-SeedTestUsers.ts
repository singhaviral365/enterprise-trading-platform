import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed test users data based on provided client list.
 * 
 * NOTE: Password hashes are placeholder bcrypt hashes ($2b$12$...).
 * In production:
 * - Register users through API to get proper Argon2id hashes
 * - Or run a separate password update script
 * - Never manually insert plaintext passwords
 */
export class SeedTestUsers1695000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Insert 10 test users based on provided client data
    await queryRunner.query(
      `
      INSERT INTO users (
        username, email, password_hash, account_id, roles, 
        client_name, phone_no, dob, created_on, updated_at
      ) VALUES
        ('john.smith', 'john.smith@example.com', 
         '$2b$12$clienthash001', 1, ARRAY['CUSTOMER'], 
         'John Smith', '+353850000001', '1985-04-12', NOW(), NOW()),
        
        ('olivia.martin', 'olivia.martin@example.com', 
         '$2b$12$clienthash002', 1, ARRAY['CUSTOMER'], 
         'Olivia Martin', '+353850000002', '1990-08-21', NOW(), NOW()),
        
        ('david.taylor', 'david.taylor@example.com', 
         '$2b$12$clienthash003', 1, ARRAY['CUSTOMER'], 
         'David Taylor', '+353850000003', '1978-02-18', NOW(), NOW()),
        
        ('sophia.anderson', 'sophia.anderson@example.com', 
         '$2b$12$clienthash004', 1, ARRAY['CUSTOMER'], 
         'Sophia Anderson', '+353850000004', '1995-10-03', NOW(), NOW()),
        
        ('james.thomas', 'james.thomas@example.com', 
         '$2b$12$clienthash005', 1, ARRAY['CUSTOMER'], 
         'James Thomas', '+353850000005', '1982-12-29', NOW(), NOW()),
        
        ('liam.harris', 'liam.harris@example.com', 
         '$2b$12$clienthash006', 1, ARRAY['CUSTOMER'], 
         'Liam Harris', '+353850000006', '1988-03-15', NOW(), NOW()),
        
        ('amelia.walker', 'amelia.walker@example.com', 
         '$2b$12$clienthash007', 1, ARRAY['CUSTOMER'], 
         'Amelia Walker', '+353850000007', '1992-11-07', NOW(), NOW()),
        
        ('noah.hall', 'noah.hall@example.com', 
         '$2b$12$clienthash008', 1, ARRAY['CUSTOMER'], 
         'Noah Hall', '+353850000008', '1975-06-25', NOW(), NOW()),
        
        ('mia.allen', 'mia.allen@example.com', 
         '$2b$12$clienthash009', 1, ARRAY['CUSTOMER'], 
         'Mia Allen', '+353850000009', '1998-01-30', NOW(), NOW()),
        
        ('oliver.young', 'oliver.young@example.com', 
         '$2b$12$clienthash010', 1, ARRAY['CUSTOMER'], 
         'Oliver Young', '+353850000010', '1986-09-17', NOW(), NOW())
      
      ON CONFLICT (username) DO NOTHING
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Delete all test users
    await queryRunner.query(
      `
      DELETE FROM users WHERE email LIKE '%example.com'
      `,
    );
  }
}
