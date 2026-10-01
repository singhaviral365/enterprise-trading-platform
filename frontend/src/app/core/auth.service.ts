import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AUTH_API_URL } from './api.config';
import { AuthTokens, SessionService } from './session.service';

/** UserResponseDto in the Auth service. */
export interface AuthUser {
  readonly id: number;
  readonly username: string;
  readonly email?: string;
  readonly roles: readonly string[];
  readonly createdOn: string;
}

/** Error thrown by `AuthService`; `message` is safe to show to the user as-is. */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Talks to the Auth service (contracts/auth-api.yaml) and keeps SessionService in step. */
@Service()
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly baseUrl = inject(AUTH_API_URL);

  async login(username: string, password: string): Promise<void> {
    try {
      const tokens = await firstValueFrom(
        this.http.post<AuthTokens>(`${this.baseUrl}/auth/login`, { username, password }),
      );
      this.session.start(username, tokens);
    } catch (error) {
      throw toAuthError(error, 'login');
    }
  }

  async register(username: string, password: string, email: string): Promise<AuthUser> {
    try {
      return await firstValueFrom(
        this.http.post<AuthUser>(`${this.baseUrl}/auth/register`, { username, password, email }),
      );
    } catch (error) {
      throw toAuthError(error, 'register');
    }
  }

  /** Profile of the signed-in user (`GET /auth/me`). */
  async me(): Promise<AuthUser> {
    const token = this.session.accessToken();
    return firstValueFrom(
      this.http.get<AuthUser>(`${this.baseUrl}/auth/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    );
  }

  logout(): void {
    this.session.clear();
  }
}

function toAuthError(error: unknown, action: 'login' | 'register'): AuthError {
  if (!(error instanceof HttpErrorResponse)) {
    return new AuthError('Something went wrong. Please try again.', -1);
  }
  const body: unknown = error.error;
  const errorCode =
    typeof body === 'object' && body !== null && 'errorCode' in body && typeof body.errorCode === 'string'
      ? body.errorCode
      : undefined;
  const serverMessage =
    typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
      ? body.message
      : '';

  switch (error.status) {
    case 0:
      return new AuthError(
        'Cannot reach the sign-in service. Check your connection and try again.',
        0,
        errorCode,
      );
    case 401:
      return new AuthError('Incorrect username or password.', 401, errorCode);
    case 409:
      return new AuthError('That username or email is already registered. Please choose another.', 409, errorCode);
    case 400:
    case 422:
      if (action === 'register' && serverMessage && serverMessage !== 'Invalid input') {
        return new AuthError(`${serverMessage}.`, error.status, errorCode);
      }
      return new AuthError(
        action === 'register'
          ? 'Please check your details: usernames use letters, numbers, dots, underscores or hyphens, the email must be valid, and passwords need at least 12 characters.'
          : 'Please check your username and password.',
        error.status,
        errorCode,
      );
    case 429:
      return new AuthError('Too many attempts. Please wait a moment and try again.', 429, errorCode);
    default:
      return new AuthError(
        'The sign-in service is having trouble right now. Please try again later.',
        error.status,
        errorCode,
      );
  }
}
