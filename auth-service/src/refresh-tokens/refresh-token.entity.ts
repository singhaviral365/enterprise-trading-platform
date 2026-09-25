import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('refresh_tokens')
@Index('idx_refresh_tokens_user_id', ['user_id'])
@Index('idx_refresh_tokens_active', ['revoked_at'], { where: 'revoked_at IS NULL' })
export class RefreshToken {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id!: string;

  @Column('bigint', { name: 'user_id' })
  user_id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column('varchar', { length: 255, unique: true })
  token_hash!: string;

  @CreateDateColumn()
  issued_at!: Date;

  @Column('timestamptz')
  expires_at!: Date;

  @Column('timestamptz', { nullable: true })
  revoked_at!: Date | null;
}
