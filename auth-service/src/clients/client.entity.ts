import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('client')
@Index('idx_client_email', ['email'], { unique: true })
export class Client {
  @PrimaryGeneratedColumn()
  client_id!: number;

  @Column('varchar', { length: 255 })
  client_name!: string;

  @Column('varchar', { length: 255, unique: true })
  email!: string;

  @Column('varchar', { length: 255 })
  password_hash!: string;

  @Column('varchar', { length: 20 })
  phone_no!: string;

  @Column('date')
  dob!: Date;

  @Column('date')
  join_date!: Date;
}
