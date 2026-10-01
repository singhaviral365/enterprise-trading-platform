import { Service, computed, inject, resource } from '@angular/core';
import { AccountError, AccountOverview, AccountService } from './account.service';
import { SessionService } from './session.service';

export type AccountOverviewState =
  | { readonly linked: false }
  | { readonly linked: true; readonly accountNumber: string; readonly overview: AccountOverview };

/**
 * The signed-in user's linked account, loaded once and shared by the dashboard and the header's
 * account menu. Reloads when the user changes or an account is created; idle while signed out.
 */
@Service()
export class AccountOverviewStore {
  private readonly session = inject(SessionService);
  private readonly accounts = inject(AccountService);

  readonly data = resource({
    params: () =>
      this.session.isLoggedIn()
        ? { user: this.session.username(), revision: this.accounts.revision() }
        : undefined,
    loader: async (): Promise<AccountOverviewState> => {
      const link = await this.accounts.getLinkStatus();
      if (!link.linked || link.accountId === null || link.accountNumber === null) {
        return { linked: false };
      }
      const overview = await this.accounts.getOverview(link.accountId);
      return { linked: true, accountNumber: link.accountNumber, overview };
    },
  });

  /** The linked account, or null while loading, on error, or when none is linked. */
  readonly linked = computed(() => {
    const value = this.data.hasValue() ? this.data.value() : null;
    return value?.linked ? value : null;
  });

  readonly errorMessage = computed(() => {
    const error = this.data.error();
    if (!error) {
      return '';
    }
    return error instanceof AccountError ? error.message : 'We could not load your account. Please try again.';
  });

  reload(): void {
    this.data.reload();
  }
}
