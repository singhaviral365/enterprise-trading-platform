import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AuthService,
  LoginRequest,
  ProfileService,
  RefreshRequest,
  RegisterRequest,
  TokenResponse,
  UserResponse,
} from './generated/auth';

/**
 * App-facing wrapper over the generated Auth clients. The generated services expose
 * observe/reportProgress overloads; callers here just get the response body.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly auth = inject(AuthService);
  private readonly profile = inject(ProfileService);

  register(request: RegisterRequest): Observable<UserResponse> {
    return this.auth.register(request);
  }

  login(request: LoginRequest): Observable<TokenResponse> {
    return this.auth.login(request);
  }

  refresh(request: RefreshRequest): Observable<TokenResponse> {
    return this.auth.refresh(request);
  }

  currentUser(): Observable<UserResponse> {
    return this.profile.getCurrentUser();
  }
}
