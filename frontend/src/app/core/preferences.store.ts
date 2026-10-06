import { Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PreferencesApi } from '../api/preferences-api.service';
import { AccountOverviewStore, accountIdFromNumber } from './account-overview.store';
import { FormatPreferences } from './format-preferences';
import {
  PreferenceValues,
  Preferences,
  defaultPreferences,
  landingRoute,
  valuesOf,
} from './preferences';
import { SessionService } from './session.service';
import { ThemeService } from './theme.service';

export type PreferencesState = 'idle' | 'loading' | 'ready' | 'error';

/** How long sign-in waits for the customer's landing page before opening the dashboard instead. */
export const LANDING_WAIT_MS = 1500;

/**
 * The signed-in customer's preferences, loaded once per sign-in and shared by everything that follows one: the
 * date, time and number formats (through `FormatPreferences`), the theme, the chatbot icon, the page the app opens
 * on, the order ticket's starting type and the currency estimates are shown in.
 *
 * One `GET` per sign-in and one `PUT` per save; the app never polls. While nothing has loaded (or nothing has ever
 * been saved) every reader gets the defaults, so a failed load degrades to "the app as it was", never to an error
 * on some unrelated page. The settings screen is the one place that reports a failure.
 *
 * Preferences belong to the account, so they load when the linked account is known (`AccountOverviewStore`) and
 * clear on sign-out.
 */
@Service()
export class PreferencesStore {
  private readonly api = inject(PreferencesApi);
  private readonly overview = inject(AccountOverviewStore);
  private readonly session = inject(SessionService);
  private readonly formats = inject(FormatPreferences);
  private readonly theme = inject(ThemeService);

  private readonly saved = signal<Preferences | null>(null);
  private readonly loadState = signal<PreferencesState>('idle');
  /** One request per account at a time, so the sign-in path and the store's own load share a single call. */
  private readonly inFlight = new Map<number, Promise<Preferences | null>>();

  readonly state = this.loadState.asReadonly();
  /** The linked account's id, or null while it loads, on error, or when the user has no account. */
  readonly accountId = computed(() => accountIdFromNumber(this.overview.linked()?.accountNumber ?? null));
  /** The account's own currency; what the display currency defaults to. */
  private readonly accountCurrency = computed(() => this.overview.linked()?.overview.balance.currency ?? null);

  /** What applies right now: the saved preferences, else the defaults. */
  readonly current = computed<PreferenceValues>(() => {
    const saved = this.saved();
    return saved ? valuesOf(saved) : defaultPreferences(this.accountCurrency());
  });
  /** True once the customer has saved at least once (the server answers `updatedAt` only then). */
  readonly customised = computed(() => this.saved()?.updatedAt != null);

  readonly aiAssistantEnabled = computed(() => this.current().aiAssistantEnabled);
  readonly defaultOrderType = computed(() => this.current().defaultOrderType);
  readonly landingRoute = computed(() => landingRoute(this.current().landingPage));
  /** The currency estimates are shown in: the saved choice, else the account's own. */
  readonly preferredCurrency = computed<string>(() =>
    this.customised() ? this.current().preferredCurrency : (this.accountCurrency() ?? this.current().preferredCurrency),
  );
  /** The digit-grouping locale (`en-US` or `en-IN`), for the few places that format with `Intl` directly. */
  readonly numberLocale = this.formats.locale;

  constructor() {
    // Load when the account is known. Reading `saved` here is untracked: only the account id drives a load.
    effect(() => {
      const accountId = this.accountId();
      if (accountId !== null) {
        untracked(() => void this.loadFor(accountId));
      }
    });

    // Signing out forgets everything, so the next customer on this browser starts from the defaults.
    effect(() => {
      if (!this.session.isLoggedIn()) {
        untracked(() => this.clear());
      }
    });

    // Follow the saved preferences: formats everywhere, and the theme once the customer has chosen one.
    effect(() => {
      const values = this.current();
      this.formats.apply(values);
      if (this.customised()) {
        this.theme.apply(values.theme);
      }
    });
  }

  /**
   * Loads the account's preferences, or returns the ones already loaded. A failure is not thrown: the answer is
   * null, the state is `error`, and the defaults stay in force.
   */
  loadFor(accountId: number): Promise<Preferences | null> {
    if (this.saved()?.accountId === accountId) {
      return Promise.resolve(this.saved());
    }
    const running = this.inFlight.get(accountId);
    if (running) {
      return running;
    }
    this.loadState.set('loading');
    const request = firstValueFrom(this.api.get(accountId))
      .then((preferences) => {
        if (this.session.isLoggedIn()) {
          this.saved.set(preferences);
          this.loadState.set('ready');
        }
        return preferences;
      })
      .catch(() => {
        this.loadState.set('error');
        return null;
      })
      .finally(() => this.inFlight.delete(accountId));
    this.inFlight.set(accountId, request);
    return request;
  }

  /**
   * The route to open on right after sign-in: the customer's chosen landing page, read now so the very first page is
   * the right one. Sign-in must never hang on this, so a slow or failed read gives up after `waitMs` and the answer
   * is the dashboard (the default); the preferences still finish loading in the background.
   */
  async landingRouteFor(accountId: number, waitMs = LANDING_WAIT_MS): Promise<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const giveUp = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, waitMs);
    });
    try {
      await Promise.race([this.loadFor(accountId), giveUp]);
    } finally {
      clearTimeout(timer);
    }
    return this.landingRoute();
  }

  /** Tries again after a failed load. */
  reload(): void {
    const accountId = this.accountId();
    if (accountId !== null) {
      this.saved.set(null);
      void this.loadFor(accountId);
    }
  }

  /** Saves the whole document. Rejects with the client's `HttpErrorResponse`; the caller words it. */
  async save(values: PreferenceValues): Promise<Preferences> {
    const accountId = this.accountId();
    if (accountId === null) {
      throw new Error('There is no linked account to save preferences for.');
    }
    const stored = await firstValueFrom(this.api.replace(accountId, values));
    this.saved.set(stored);
    this.loadState.set('ready');
    return stored;
  }

  private clear(): void {
    this.saved.set(null);
    this.loadState.set('idle');
    this.inFlight.clear();
    this.formats.reset();
  }
}
