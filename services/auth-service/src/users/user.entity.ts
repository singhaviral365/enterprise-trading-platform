import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
@Index('idx_users_username', ['username'], { unique: true })
@Index('idx_users_email', ['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'user_id' })
  id!: number;

  @Column('varchar', { length: 64, unique: true })
  username!: string;

  @Column('varchar', { length: 255, unique: true })
  email!: string;

  @Column('varchar', { length: 255 })
  password_hash!: string;

  @Column('text', { array: true, default: () => `'{CUSTOMER}'` })
  roles!: string[];

  /** A code is emailed at every sign-in. On for every new user; they can switch it off in Settings. */
  @Column('boolean', { default: true })
  two_factor_enabled!: boolean;

  @CreateDateColumn()
  created_on!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
