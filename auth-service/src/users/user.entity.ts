import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
@Index('idx_users_username', ['username'], { unique: true })
@Index('idx_users_email', ['email'], { unique: true })
@Index('idx_users_account_id', ['account_id'])
export class User {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('varchar', { length: 64, unique: true })
  username!: string;

  @Column('varchar', { length: 255, unique: true })
  email!: string;

  @Column('varchar', { length: 255 })
  password_hash!: string;

  @Column('bigint')
  account_id!: number;

  @Column('text', { array: true, default: () => `'{CUSTOMER}'` })
  roles!: string[];

  @Column('varchar', { length: 255, nullable: true })
  client_name!: string | null;

  @Column('varchar', { length: 20, nullable: true })
  phone_no!: string | null;

  @Column('date', { nullable: true })
  dob!: Date | null;

  @CreateDateColumn()
  created_on!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
