import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AuthService,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  OtpChallenge,
  ProfileService,
  RefreshRequest,
  ChangePasswordRequest,
  RegisterRequest,
  RegisterResponse,
  ResendCodeRequest,
  ResetPasswordRequest,
  ResetTokenResponse,
  TokenResponse,
  TwoFactorRequest,
  UserResponse,
  VerifyCodeRequest,
} from './generated/auth';

/**
 * App-facing wrapper over the generated Auth clients. The generated services expose
 * observe/reportProgress overloads; callers here just get the response body.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly auth = inject(AuthService);
  private readonly profile = inject(ProfileService);

  /** Step one of registering: the answer holds a challenge (a code was emailed to the address typed) or, if the check is off, the user. */
  register(request: RegisterRequest): Observable<RegisterResponse> {
    return this.auth.register(request);
  }

  /** Step two of registering: the emailed code creates the login. */
  verifyRegistration(request: VerifyCodeRequest): Observable<UserResponse> {
    return this.auth.verifyRegistration(request);
  }

  resendRegistrationCode(request: ResendCodeRequest): Observable<OtpChallenge> {
    return this.auth.resendRegistrationCode(request);
  }

  /** Switches two-step sign-in on or off for the signed-in user. */
  setTwoFactor(request: TwoFactorRequest): Observable<UserResponse> {
    return this.profile.setTwoFactor(request);
  }

  /** Changes the signed-in user's password; the answer is the fresh session. */
  changePassword(request: ChangePasswordRequest): Observable<TokenResponse> {
    return this.profile.changePassword(request);
  }

  /** Step one of signing in: the answer holds either a challenge (a code was emailed) or, if two-step is off, the tokens. */
  login(request: LoginRequest): Observable<LoginResponse> {
    return this.auth.login(request);
  }

  /** Step two of signing in: the emailed code for a challenge. */
  verifyLogin(request: VerifyCodeRequest): Observable<TokenResponse> {
    return this.auth.verifyLogin(request);
  }

  resendLoginCode(request: ResendCodeRequest): Observable<OtpChallenge> {
    return this.auth.resendLoginCode(request);
  }

  /** Forgot password: always answers the same way, whether or not the details matched an account. */
  forgotPassword(request: ForgotPasswordRequest): Observable<ForgotPasswordResponse> {
    return this.auth.forgotPassword(request);
  }

  resendResetCode(request: ResendCodeRequest): Observable<ForgotPasswordResponse> {
    return this.auth.resendResetCode(request);
  }

  verifyResetCode(request: VerifyCodeRequest): Observable<ResetTokenResponse> {
    return this.auth.verifyResetCode(request);
  }

  resetPassword(request: ResetPasswordRequest): Observable<unknown> {
    return this.auth.resetPassword(request);
  }

  /** Without a body the Auth service reads the HttpOnly `refresh_token` cookie, which is what the browser uses. */
  refresh(request: RefreshRequest = {}): Observable<TokenResponse> {
    return this.auth.refresh(request);
  }

  /** Revokes the refresh token and clears the session cookies. */
  logout(): Observable<void> {
    return this.auth.logout();
  }

  currentUser(): Observable<UserResponse> {
    return this.profile.getCurrentUser();
  }
}
