import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthApi } from '../api/auth-api.service';
import { RegisterRequest, UserResponse } from '../api/generated/auth';
import { SessionService } from './session.service';

/**
 * Session orchestration on top of the generated Auth client: logging in starts the session,
 * logging out ends it (and asks the Auth service to revoke the refresh token and clear the cookies). It makes no HTTP calls of its own, and it does not translate failures;
 * a rejected call carries the client's `HttpErrorResponse`, which callers turn into a sentence
 * with `describeError`.
 */
@Service()
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);

  async login(username: string, password: string): Promise<void> {
    const tokens = await firstValueFrom(this.api.login({ username, password }));
    this.session.start(username, tokens);
  }

  register(request: RegisterRequest): Promise<UserResponse> {
    return firstValueFrom(this.api.register(request));
  }

  /** Profile of the signed-in user (`GET /auth/me`; the interceptor adds the token). */
  me(): Promise<UserResponse> {
    return firstValueFrom(this.api.currentUser());
  }

  /**
   * Signs out at once in the UI, then tells the Auth service so it can revoke the refresh token and expire the
   * HttpOnly cookies (script cannot delete those itself). A failure of that call is not shown: the user is signed
   * out locally either way, and the refresh token would only be good for what is left of its seven days.
   */
  logout(): void {
    this.session.clear();
    this.api.logout().subscribe({ error: () => undefined });
  }
}
