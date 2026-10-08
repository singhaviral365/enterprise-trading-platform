import { Service, computed, inject, resource, signal } from '@angular/core';

import { UserResponse } from '../api/generated/auth';
import { AuthService } from './auth.service';
import { describeError } from './errors/describe-error';
import { SessionService } from './session.service';

/**
 * Who is signed in (`GET /auth/me`): username, email, member since, two-step sign-in.
 *
 * Nothing is requested until the profile pane is first opened (`refresh()`), and every later opening reads it again,
 * keeping the last answer on screen meanwhile. Idle while signed out.
 */
@Service()
export class ProfileStore {
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly wanted = signal(false);

  readonly data = resource({
    params: () => (this.wanted() && this.session.isLoggedIn() ? { user: this.session.username() } : undefined),
    loader: (): Promise<UserResponse> => this.auth.me(),
  });

  readonly user = computed(() => (this.data.hasValue() ? this.data.value() : null));
  readonly loading = computed(() => this.data.isLoading() && !this.data.hasValue());
  readonly errorMessage = computed(() => {
    const error = this.data.error();
    return error ? describeError(error) : '';
  });

  /** The first call starts the load; later calls read the profile again. */
  refresh(): void {
    if (this.wanted()) {
      this.data.reload();
    } else {
      this.wanted.set(true);
    }
  }
}
