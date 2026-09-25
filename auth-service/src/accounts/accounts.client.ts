import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { RedactingLogger } from '../common/logging/redacting.logger';

export interface CreateAccountRequest {
  client_name: string;
  phone_no: string;
  email: string;
  dob?: string;
}

export interface CreateAccountResponse {
  accountId: number;
  accountNumber: string;
  status: string;
  message: string;
}

export interface GetAccountResponse {
  accountId: number;
  accountNumber: string;
  accountStatus: string;
  balance: string;
  purchasingPower: string;
}

/**
 * HTTP client for trade-api communication.
 * Handles account creation and verification.
 */
@Injectable()
export class AccountsClient {
  private readonly httpClient: AxiosInstance;
  private readonly tradeApiUrl: string;

  constructor(private readonly redactingLogger: RedactingLogger) {
    this.tradeApiUrl = process.env.TRADE_API_URL || 'http://localhost:8080';
    this.httpClient = axios.create({
      baseURL: this.tradeApiUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create a new account + client in trade-api.
   * Called during profile setup when user opts to create new account.
   */
  async createAccount(
    userId: number,
    request: CreateAccountRequest,
  ): Promise<CreateAccountResponse> {
    const payload = {
      ...request,
      user_id: userId,
    };

    try {
      this.redactingLogger.log(
        'AccountsClient',
        'Creating account in trade-api',
        { userId },
      );

      const response = await this.httpClient.post<CreateAccountResponse>(
        '/api/accounts/create',
        payload,
      );

      this.redactingLogger.log(
        'AccountsClient',
        'Account created successfully',
        { userId, accountId: response.data.accountId },
      );

      return response.data;
    } catch (error) {
      this.redactingLogger.error(
        'AccountsClient',
        'Failed to create account',
        { userId, error: error instanceof Error ? error.message : 'Unknown error' },
      );
      throw error;
    }
  }

  /**
   * Verify if an account exists in trade-api.
   * Called during profile setup when user opts to link existing account.
   */
  async getAccount(accountId: number): Promise<GetAccountResponse> {
    try {
      this.redactingLogger.log(
        'AccountsClient',
        'Verifying account exists',
        { accountId },
      );

      const response = await this.httpClient.get<GetAccountResponse>(
        `/api/accounts/${accountId}`,
      );

      this.redactingLogger.log(
        'AccountsClient',
        'Account verified successfully',
        { accountId, status: response.data.accountStatus },
      );

      return response.data;
    } catch (error) {
      this.redactingLogger.error(
        'AccountsClient',
        'Failed to verify account',
        { accountId, error: error instanceof Error ? error.message : 'Unknown error' },
      );
      throw error;
    }
  }

  /**
   * Link an existing account to a user in trade-api.
   * Called during profile setup when user links to existing account.
   */
  async linkAccount(userId: number, accountId: number): Promise<void> {
    const payload = {
      user_id: userId,
      account_id: accountId,
    };

    try {
      this.redactingLogger.log(
        'AccountsClient',
        'Linking account to user',
        { userId, accountId },
      );

      await this.httpClient.post<void>('/api/accounts/link', payload);

      this.redactingLogger.log(
        'AccountsClient',
        'Account linked successfully',
        { userId, accountId },
      );
    } catch (error) {
      this.redactingLogger.error(
        'AccountsClient',
        'Failed to link account',
        {
          userId,
          accountId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      throw error;
    }
  }
}
