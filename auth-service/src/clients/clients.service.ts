import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { Client } from './client.entity';

@Injectable()
export class ClientsRepository {
  private readonly clientRepository: Repository<Client>;

  constructor(private dataSource: DataSource) {
    this.clientRepository = this.dataSource.getRepository(Client);
  }

  async findByEmail(email: string): Promise<Client | null> {
    return this.clientRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(clientId: number): Promise<Client | null> {
    return this.clientRepository.findOne({
      where: { client_id: clientId },
    });
  }

  async emailExists(email: string): Promise<boolean> {
    const count = await this.clientRepository.countBy({
      email: email.toLowerCase(),
    });
    return count > 0;
  }

  async create(
    clientName: string,
    email: string,
    passwordHash: string,
    phoneNo: string,
    dob: Date,
  ): Promise<Client> {
    const client = this.clientRepository.create({
      client_name: clientName,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      phone_no: phoneNo,
      dob: dob,
      join_date: new Date(),
    });

    return this.clientRepository.save(client);
  }

  async updatePasswordHash(
    clientId: number,
    passwordHash: string,
  ): Promise<Client | null> {
    await this.clientRepository.update(clientId, {
      password_hash: passwordHash,
    });
    return this.findById(clientId);
  }
}

@Injectable()
export class ClientsService {
  constructor(private readonly clientsRepository: ClientsRepository) {}

  async getClientByEmail(email: string): Promise<Client | null> {
    return this.clientsRepository.findByEmail(email);
  }

  async getClientById(clientId: number): Promise<Client | null> {
    return this.clientsRepository.findById(clientId);
  }

  async isEmailAvailable(email: string): Promise<boolean> {
    return !(await this.clientsRepository.emailExists(email));
  }

  async createClient(
    clientName: string,
    email: string,
    passwordHash: string,
    phoneNo: string,
    dob: Date,
  ): Promise<Client> {
    return this.clientsRepository.create(
      clientName,
      email,
      passwordHash,
      phoneNo,
      dob,
    );
  }

  async updatePassword(
    clientId: number,
    newPasswordHash: string,
  ): Promise<Client | null> {
    return this.clientsRepository.updatePasswordHash(clientId, newPasswordHash);
  }
}
