import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersRepository {
  private readonly userRepository: Repository<User>;

  constructor(private dataSource: DataSource) {
    this.userRepository = this.dataSource.getRepository(User);
  }

  /**
   * Create a new user and save to database.
   */
  async create(user: Partial<User>): Promise<User> {
    const newUser = this.userRepository.create(user);
    return this.userRepository.save(newUser);
  }

  /**
   * Find user by username.
   */
  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username },
    });
  }

  /**
   * Find user by id.
   */
  async findById(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }



  /**
   * Check if username already exists.
   */
  async usernameExists(username: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { username },
    });
    return user !== null;
  }

  /**
   * Check if email already exists.
   */
  async emailExists(email: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { email },
    });
    return user !== null;
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  /**
   * Create a new user.
   */
  async createUser(
    username: string,
    passwordHash: string,
    roles: string[] = ['CUSTOMER'],
    email: string = `${username}@local.auth`,
  ): Promise<User> {
    // Email is NOT NULL: callers that do not collect one get a placeholder derived from the username.
    return this.usersRepository.create({
      username,
      email,
      password_hash: passwordHash,
      roles,
    });
  }

  /**
   * Find user by username.
   */
  async getUserByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findByUsername(username);
  }

  /**
   * Find user by id.
   */
  async getUserById(id: number): Promise<User | null> {
    return this.usersRepository.findById(id);
  }

  /**
   * Check if username is available.
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const exists = await this.usersRepository.usernameExists(username);
    return !exists;
  }
}
