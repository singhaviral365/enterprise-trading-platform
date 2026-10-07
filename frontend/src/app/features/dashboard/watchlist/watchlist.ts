import { Component, DestroyRef, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { AccountOverviewStore, accountIdFromNumber } from '../../../core/account-overview.store';
import { DialogService } from '../../../core/dialog.service';
import { CHANGE_FIELDS, CHANGE_PERCENT_FIELDS, MarketService, quoteNumber } from '../../../core/market.service';
import { NotificationService } from '../../../core/notification.service';
import {
  AlertDelivery,
  AlertDirection,
  AlertStatus,
  MAX_ALERTS_PER_ACCOUNT,
  MAX_ITEMS_PER_WATCHLIST,
  MAX_NAME_LENGTH,
  MAX_WATCHLISTS,
  PriceAlert,
  PriceStatus,
  Watchlist,
  WatchlistError,
  WatchlistItem,
  WatchlistService,
} from '../../../core/watchlist.service';
import { Dropdown, DropdownOption } from '../../../shared/ui/dropdown/dropdown';
import { InstrumentIcon } from '../../../shared/ui/instrument-icon/instrument-icon';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { Tooltip } from '../../../shared/ui/tooltip/tooltip';
import { PreferenceDatePipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';

/** The backend refreshes prices about once a minute; polling twice as often keeps the screen close behind it. */
const REFRESH_MS = 30_000;

type NameForm = 'create' | 'rename';

/** The largest target the API accepts, and how many decimals it keeps. */
const MAX_TARGET = 1_000_000_000;
const TARGET_PATTERN = /^\d+(\.\d{1,4})?$/;

/** Customer watchlists with the latest price beside each stock. Prices come from the Trade API, never computed here. */
@Component({
  selector: 'app-watchlist',
  imports: [Dropdown, PreferenceDatePipe, PreferenceDecimalPipe, InstrumentIcon, Spinner, Tooltip],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.css',
})
export class WatchlistPanel {
  private readonly api = inject(WatchlistService);
  private readonly accounts = inject(AccountOverviewStore);
  private readonly market = inject(MarketService);
  private readonly dialog = inject(DialogService);
  private readonly notifications = inject(NotificationService);

  /** Exposed so the template compares against the generated enums, never string literals. */
  protected readonly PriceStatus = PriceStatus;
  protected readonly AlertStatus = AlertStatus;
  protected readonly AlertDelivery = AlertDelivery;
  protected readonly AlertDirection = AlertDirection;

  protected readonly maxWatchlists = MAX_WATCHLISTS;
  protected readonly maxItems = MAX_ITEMS_PER_WATCHLIST;
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxAlerts = MAX_ALERTS_PER_ACCOUNT;

  /** Numeric account key, or null while the account loads or when the login has no account yet. */
  protected readonly accountId = computed(() => accountIdFromNumber(this.accounts.linked()?.accountNumber ?? null));
  /** True once we know there is no account to show a watchlist for (so no spinner is shown forever). */
  protected readonly noAccount = computed(() => this.accounts.data.hasValue() && this.accountId() === null);

  protected readonly data = resource({
    params: () => this.accountId() ?? undefined,
    loader: ({ params }) => this.api.list(params),
  });

  /** Server state plus local edits: add/remove/rename/create return the full list, so no refetch is needed. */
  protected readonly lists = linkedSignal<readonly Watchlist[]>(() => (this.data.hasValue() ? this.data.value() : []));

  private readonly selectedId = signal<number | null>(null);
  protected readonly selected = computed(() => {
    const lists = this.lists();
    return lists.find((list) => list.watchlistId === this.selectedId()) ?? lists[0] ?? null;
  });

  protected readonly activeId = computed(() => this.selected()?.watchlistId ?? null);

  /** The market board: the tradable instruments the add dropdown offers, and the logos and day changes shown. */
  private readonly board = resource({ loader: () => this.market.getBoard() });

  /**
   * What the "Add a stock" dropdown offers: every tradable instrument on the market board that is not already on this
   * list, as "SYMBOL, name". A native select, so the browser lays the list out and types to jump.
   */
  protected readonly stockOptions = computed<readonly DropdownOption[]>(() => {
    const onList = new Set(this.selected()?.items.map((item) => item.tickerSymbol.toUpperCase()));
    return (this.board.hasValue() ? this.board.value().quotes : [])
      .filter((quote) => !onList.has(quote.symbol.toUpperCase()))
      .map((quote) => ({ value: quote.symbol, label: quote.name ? `${quote.symbol}, ${quote.name}` : quote.symbol }))
      .sort((a, b) => a.value.localeCompare(b.value));
  });
  protected readonly boardUnavailable = computed(() => this.board.error() !== undefined && !this.board.hasValue());

  /**
   * Logo per symbol. The watchlist API carries prices only, so the logos come from the market quotes, the same
   * source (and the same `iconUrl`) the market board uses. A symbol with no quote or no logo gets the
   * two-letter fallback tile from `app-instrument-icon`.
   */
  protected readonly icons = computed(() => {
    const bySymbol = new Map<string, string>();
    for (const quote of this.board.hasValue() ? this.board.value().quotes : []) {
      if (quote.iconUrl) {
        bySymbol.set(quote.symbol.toUpperCase(), quote.iconUrl);
      }
    }
    return bySymbol;
  });

  /** Day change per symbol, read from the market quotes (the watchlist API carries price only). */
  protected readonly changes = computed(() => {
    const bySymbol = new Map<string, { change: number | null; percent: number | null }>();
    for (const quote of this.board.hasValue() ? this.board.value().quotes : []) {
      const change = quoteNumber(quote, CHANGE_FIELDS);
      const percent = quoteNumber(quote, CHANGE_PERCENT_FIELDS);
      if (change !== null || percent !== null) {
        bySymbol.set(quote.symbol.toUpperCase(), { change, percent });
      }
    }
    return bySymbol;
  });

  protected readonly errorMessage = computed(() => {
    const error = this.data.error();
    if (!error) {
      return '';
    }
    return error instanceof WatchlistError ? error.message : 'Your watchlists could not be loaded.';
  });

  protected readonly atListLimit = computed(() => this.lists().length >= MAX_WATCHLISTS);
  protected readonly atItemLimit = computed(() => (this.selected()?.items.length ?? 0) >= MAX_ITEMS_PER_WATCHLIST);

  protected readonly busy = signal(false);
  protected readonly nameForm = signal<NameForm | null>(null);
  protected readonly nameDraft = signal('');
  protected readonly nameError = signal('');
  /** The instrument picked in the add dropdown; empty until the customer chooses one. */
  protected readonly chosenTicker = signal('');
  protected readonly tickerError = signal('');
  protected readonly canAdd = computed(() => this.chosenTicker() !== '' && !this.busy() && !this.atItemLimit());

  // ---- price alerts ----
  protected readonly directionOptions: readonly DropdownOption[] = [
    { value: AlertDirection.Above, label: 'Rises to or above' },
    { value: AlertDirection.Below, label: 'Falls to or below' },
  ];
  /** The ticker whose alert is being edited, or null. */
  protected readonly alertEditing = signal<string | null>(null);
  protected readonly alertDirection = signal<string>(AlertDirection.Above);
  protected readonly alertTarget = signal('');
  protected readonly alertError = signal('');

  /** Active alerts across all the account's lists: what the cap counts. */
  protected readonly activeAlerts = computed(
    () =>
      this.lists()
        .flatMap((list) => list.items)
        .filter((item) => item.alert?.status === AlertStatus.Active).length,
  );
  protected readonly editingItem = computed(
    () => this.selected()?.items.find((item) => item.tickerSymbol === this.alertEditing()) ?? null,
  );
  /** The target as a number once it is a price the API would accept, else null. */
  protected readonly targetValue = computed(() => {
    const raw = this.alertTarget().replace(/,/g, '').trim();
    if (!TARGET_PATTERN.test(raw)) {
      return null;
    }
    const value = Number(raw);
    return value > 0 && value <= MAX_TARGET ? value : null;
  });
  /**
   * Why the target cannot be saved, shown once the customer has typed something. The two "already reached" rules are
   * the API's `ALR-409` seen early: an alert that would fire the moment it is set is refused.
   */
  protected readonly targetProblem = computed(() => {
    if (this.alertTarget().trim() === '') {
      return '';
    }
    const target = this.targetValue();
    if (target === null) {
      return 'Enter a price above 0 with up to 4 decimal places.';
    }
    const price = this.editingItem()?.price ?? null;
    if (price !== null) {
      if (this.alertDirection() === AlertDirection.Above && target <= price) {
        return 'The price is already at or above this. Choose a higher target.';
      }
      if (this.alertDirection() === AlertDirection.Below && target >= price) {
        return 'The price is already at or below this. Choose a lower target.';
      }
    }
    return '';
  });
  /** Set alert is enabled only for a target that passes every rule the form can foresee. */
  protected readonly canSaveAlert = computed(
    () => this.targetValue() !== null && this.targetProblem() === '' && !this.busy(),
  );

  constructor() {
    const timer = setInterval(() => {
      this.data.reload();
      this.board.reload();
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected select(list: Watchlist): void {
    this.selectedId.set(list.watchlistId);
    this.closeNameForm();
    this.tickerError.set('');
  }

  protected openNameForm(form: NameForm): void {
    this.nameDraft.set(form === 'rename' ? (this.selected()?.name ?? '') : '');
    this.nameError.set('');
    this.nameForm.set(form);
  }

  protected closeNameForm(): void {
    this.nameForm.set(null);
    this.nameError.set('');
  }

  protected onNameInput(event: Event): void {
    this.nameDraft.set((event.target as HTMLInputElement).value);
    this.nameError.set('');
  }

  protected onTickerChosen(value: string): void {
    this.chosenTicker.set(value);
    this.tickerError.set('');
  }

  protected async submitName(event: Event): Promise<void> {
    event.preventDefault();
    const form = this.nameForm();
    const accountId = this.accountId();
    const name = this.nameDraft().trim();
    if (!form || accountId === null || this.busy()) {
      return;
    }
    if (!name) {
      this.nameError.set('Give the watchlist a name.');
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      this.nameError.set(`Names can be at most ${MAX_NAME_LENGTH} characters.`);
      return;
    }

    this.busy.set(true);
    try {
      if (form === 'create') {
        const created = await this.api.create(accountId, name);
        this.lists.update((lists) => [...lists, created]);
        this.selectedId.set(created.watchlistId);
      } else {
        const current = this.selected();
        if (!current) {
          return;
        }
        const renamed = await this.api.rename(accountId, current.watchlistId, name);
        this.replace(renamed);
      }
      this.closeNameForm();
    } catch (error) {
      this.nameError.set(this.messageOf(error));
      this.refreshIfGone(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async deleteList(): Promise<void> {
    const list = this.selected();
    const accountId = this.accountId();
    if (!list || accountId === null || this.busy()) {
      return;
    }
    const count = list.items.length;
    const confirmed = await this.dialog.confirm({
      title: 'Delete watchlist',
      message: count
        ? `Delete "${list.name}"? This also removes its ${count} ${count === 1 ? 'stock' : 'stocks'}.`
        : `Delete "${list.name}"?`,
      type: 'warning',
      confirmText: 'Delete',
      cancelText: 'Keep it',
    });
    if (!confirmed) {
      return;
    }

    this.busy.set(true);
    try {
      await this.api.remove(accountId, list.watchlistId);
      this.lists.update((lists) => lists.filter((entry) => entry.watchlistId !== list.watchlistId));
      this.closeNameForm();
    } catch (error) {
      this.notifications.error(this.messageOf(error));
      this.refreshIfGone(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async addStock(event: Event): Promise<void> {
    event.preventDefault();
    const list = this.selected();
    const accountId = this.accountId();
    const ticker = this.chosenTicker().trim().toUpperCase();
    if (!list || accountId === null || this.busy() || !ticker) {
      return;
    }

    this.busy.set(true);
    try {
      this.replace(await this.api.addItem(accountId, list.watchlistId, ticker));
      this.chosenTicker.set('');
      this.tickerError.set('');
    } catch (error) {
      this.tickerError.set(this.messageOf(error));
      this.refreshIfGone(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async removeStock(item: WatchlistItem): Promise<void> {
    const list = this.selected();
    const accountId = this.accountId();
    if (!list || accountId === null || this.busy()) {
      return;
    }

    this.busy.set(true);
    try {
      this.replace(await this.api.removeItem(accountId, list.watchlistId, item.tickerSymbol));
    } catch (error) {
      this.notifications.error(this.messageOf(error));
      this.refreshIfGone(error);
    } finally {
      this.busy.set(false);
    }
  }

  // ---- price alerts: the editor under a row ----

  protected openAlert(item: WatchlistItem): void {
    const existing = item.alert?.status === AlertStatus.Active ? item.alert : null;
    this.alertDirection.set(existing?.direction ?? AlertDirection.Above);
    this.alertTarget.set(existing ? String(existing.targetPrice) : '');
    this.alertError.set('');
    this.alertEditing.set(item.tickerSymbol);
  }

  protected closeAlert(): void {
    this.alertEditing.set(null);
    this.alertError.set('');
  }

  protected onTargetInput(event: Event): void {
    this.alertTarget.set((event.target as HTMLInputElement).value);
    this.alertError.set('');
  }

  protected atAlertLimit(item: WatchlistItem): boolean {
    return this.activeAlerts() >= MAX_ALERTS_PER_ACCOUNT && item.alert?.status !== AlertStatus.Active;
  }

  protected async saveAlert(event: Event): Promise<void> {
    event.preventDefault();
    const list = this.selected();
    const accountId = this.accountId();
    const ticker = this.alertEditing();
    const target = this.targetValue();
    if (!list || accountId === null || ticker === null || target === null || !this.canSaveAlert()) {
      return;
    }

    this.busy.set(true);
    try {
      const updated = await this.api.setAlert(accountId, list.watchlistId, ticker, this.alertDirection() as AlertDirection, target);
      this.replace(updated);
      this.closeAlert();
    } catch (error) {
      this.alertError.set(this.messageOf(error));
      this.refreshIfGone(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected async clearAlert(item: WatchlistItem): Promise<void> {
    const list = this.selected();
    const accountId = this.accountId();
    if (!list || accountId === null || this.busy()) {
      return;
    }

    this.busy.set(true);
    try {
      this.replace(await this.api.clearAlert(accountId, list.watchlistId, item.tickerSymbol));
      if (this.alertEditing() === item.tickerSymbol) {
        this.closeAlert();
      }
    } catch (error) {
      this.notifications.error(this.messageOf(error));
      this.refreshIfGone(error);
    } finally {
      this.busy.set(false);
    }
  }

  /** What the alert chip says: the direction and target, and for a fired alert that it fired. */
  protected alertSummary(alert: PriceAlert): string {
    const side = alert.direction === AlertDirection.Above ? 'Above' : 'Below';
    return `${side} ${alert.targetPrice}`;
  }

  /** How the hand-over to notifications went, in words (colour is never the only signal). */
  protected deliveryLabel(alert: PriceAlert): string {
    switch (alert.delivery) {
      case AlertDelivery.HandedOver:
        return 'Notified';
      case AlertDelivery.Failed:
        return 'Delivery failed';
      default:
        return 'Sending…';
    }
  }

  protected reload(): void {
    this.data.reload();
  }

  private replace(updated: Watchlist): void {
    this.lists.update((lists) => lists.map((entry) => (entry.watchlistId === updated.watchlistId ? updated : entry)));
  }

  private messageOf(error: unknown): string {
    return error instanceof WatchlistError ? error.message : 'Something went wrong. Please try again.';
  }

  /** If the list vanished on the server (deleted elsewhere), pull the real state instead of showing a ghost. */
  private refreshIfGone(error: unknown): void {
    if (error instanceof WatchlistError && error.code === 'WTL-404') {
      this.data.reload();
    }
  }
}
