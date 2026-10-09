import { Service, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthApi } from '../api/auth-api.service';
import {
  ForgotPasswordResponse,
  OtpChallenge,
  RegisterRequest,
  ResetTokenResponse,
  UserResponse,
} from '../api/generated/auth';
import { SessionService } from './session.service';

/**
 * Session orchestration on top of the generated Auth client: logging in starts the session,
 * logging out ends it (and asks the Auth service to revoke the refresh token and clear the cookies). It makes no HTTP calls of its own, and it does not translate failures;
 * a rejected call carries the client's `HttpErrorResponse`, which callers turn into a sentence
 * with `describeError`.
 */
/** What step one of registering led to: a code to type, or (email check switched off) a login that already exists. */
export type RegisterOutcome =
  | { readonly kind: 'code-required'; readonly challenge: OtpChallenge }
  | { readonly kind: 'registered'; readonly user: UserResponse };

/** What step one of signing in led to: a session, or a code to type. */
export type LoginOutcome =
  | { readonly kind: 'signed-in' }
  | { readonly kind: 'code-required'; readonly challenge: OtpChallenge };

@Service()
export class AuthService {
  private readonly api = inject(AuthApi);
  private readonly session = inject(SessionService);

  /**
   * Step one. With two-step sign-in on (the default) no session exists afterwards: a code was emailed and the caller
   * has to finish with {@link verifyLogin}. With it off the session starts here, as it always did.
   */
  async login(username: string, password: string): Promise<LoginOutcome> {
    const result = await firstValueFrom(this.api.login({ username, password }));
    if (result.twoFactorRequired && result.challenge) {
      return { kind: 'code-required', challenge: result.challenge };
    }
    if (result.tokens) {
      this.session.start(username, result.tokens);
      return { kind: 'signed-in' };
    }
    throw new Error('The sign-in answer held neither a code to enter nor a session.');
  }

  /** Step two: the emailed code. A right one starts the session. */
  async verifyLogin(username: string, challengeId: string, code: string): Promise<void> {
    const tokens = await firstValueFrom(this.api.verifyLogin({ challengeId, code }));
    this.session.start(username, tokens);
  }

  /** Emails a fresh code for a sign-in that is waiting for one. */
  resendLoginCode(challengeId: string): Promise<OtpChallenge> {
    return firstValueFrom(this.api.resendLoginCode({ challengeId }));
  }

  /** Forgot password, step one. The answer is the same whether or not the details matched an account. */
  requestPasswordReset(username: string, email: string): Promise<ForgotPasswordResponse> {
    return firstValueFrom(this.api.forgotPassword({ username, email }));
  }

  resendResetCode(challengeId: string): Promise<ForgotPasswordResponse> {
    return firstValueFrom(this.api.resendResetCode({ challengeId }));
  }

  /** Forgot password, step two: a right code returns the one-time token that allows step three. */
  verifyResetCode(challengeId: string, code: string): Promise<ResetTokenResponse> {
    return firstValueFrom(this.api.verifyResetCode({ challengeId, code }));
  }

  /** Forgot password, step three. Nobody is signed in afterwards: they sign in again with the new password. */
  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.api.resetPassword({ resetToken, newPassword }));
  }

  /**
   * Step one of registering. With the email check on (the default) nothing is created yet: a code was emailed to the
   * address typed and the caller finishes with {@link verifyRegistration}. Nobody is signed in either way.
   */
  async register(request: RegisterRequest): Promise<RegisterOutcome> {
    const answer = await firstValueFrom(this.api.register(request));
    if (answer.verificationRequired && answer.challenge) {
      return { kind: 'code-required', challenge: answer.challenge };
    }
    if (answer.user) {
      return { kind: 'registered', user: answer.user };
    }
    throw new Error('The registration answer held neither a code to enter nor a login.');
  }

  /** Step two of registering: a right code creates the login. */
  verifyRegistration(challengeId: string, code: string): Promise<UserResponse> {
    return firstValueFrom(this.api.verifyRegistration({ challengeId, code }));
  }

  resendRegistrationCode(challengeId: string): Promise<OtpChallenge> {
    return firstValueFrom(this.api.resendRegistrationCode({ challengeId }));
  }

  /** Switches two-step sign-in on or off for the signed-in user; the answer is their profile with the new setting. */
  setTwoFactor(enabled: boolean): Promise<UserResponse> {
    return firstValueFrom(this.api.setTwoFactor({ enabled }));
  }

  /**
   * Changes the password of the signed-in user. The server ends every session and issues a fresh pair for this one, so the
   * user stays signed in; only the session's expiry is renewed here. A wrong current password rejects with `PWD-403` (and
   * how many tries are left); the third ends the session, `PWD-423`, and the caller signs the user out.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const tokens = await firstValueFrom(this.api.changePassword({ currentPassword, newPassword }));
    this.session.renew(tokens);
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
