import { Component, DestroyRef, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import { AccountOverviewStore, accountIdFromNumber } from '../../../core/account-overview.store';
import { DialogService } from '../../../core/dialog.service';
import { CHANGE_FIELDS, CHANGE_PERCENT_FIELDS, MarketService, quoteNumber } from '../../../core/market.service';
import { NotificationService } from '../../../core/notification.service';
import {
  MAX_ITEMS_PER_WATCHLIST,
  MAX_NAME_LENGTH,
  MAX_TICKER_LENGTH,
  MAX_WATCHLISTS,
  PriceStatus,
  Watchlist,
  WatchlistError,
  WatchlistItem,
  WatchlistService,
} from '../../../core/watchlist.service';
import { InstrumentIcon } from '../../../shared/ui/instrument-icon/instrument-icon';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { Tooltip } from '../../../shared/ui/tooltip/tooltip';
import { PreferenceDatePipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';

/** The backend refreshes prices about once a minute; polling twice as often keeps the screen close behind it. */
const REFRESH_MS = 30_000;

type NameForm = 'create' | 'rename';

/** Customer watchlists with the latest price beside each stock. Prices come from the Trade API, never computed here. */
@Component({
  selector: 'app-watchlist',
  imports: [PreferenceDatePipe, PreferenceDecimalPipe, InstrumentIcon, Spinner, Tooltip],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.css',
})
export class WatchlistPanel {
  private readonly api = inject(WatchlistService);
  private readonly accounts = inject(AccountOverviewStore);
  private readonly market = inject(MarketService);
  private readonly dialog = inject(DialogService);
  private readonly notifications = inject(NotificationService);

  /** Exposed so the template compares against the generated enum, never string literals. */
  protected readonly PriceStatus = PriceStatus;

  protected readonly maxWatchlists = MAX_WATCHLISTS;
  protected readonly maxItems = MAX_ITEMS_PER_WATCHLIST;
  protected readonly maxNameLength = MAX_NAME_LENGTH;
  protected readonly maxTickerLength = MAX_TICKER_LENGTH;

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

  /** Tradable symbols, offered as suggestions in the add box. Free text is still accepted. */
  private readonly board = resource({ loader: () => this.market.getBoard() });
  protected readonly symbolSuggestions = computed(() => {
    const onList = new Set(this.selected()?.items.map((item) => item.tickerSymbol.toUpperCase()));
    return (this.board.hasValue() ? this.board.value().quotes : [])
      .map((quote) => quote.symbol)
      .filter((symbol) => !onList.has(symbol.toUpperCase()));
  });

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
  protected readonly tickerDraft = signal('');
  protected readonly tickerError = signal('');

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

  protected onTickerInput(event: Event): void {
    this.tickerDraft.set((event.target as HTMLInputElement).value);
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
    const ticker = this.tickerDraft().trim().toUpperCase();
    if (!list || accountId === null || this.busy()) {
      return;
    }
    if (!ticker) {
      this.tickerError.set('Enter a ticker symbol, for example AAPL.');
      return;
    }

    this.busy.set(true);
    try {
      this.replace(await this.api.addItem(accountId, list.watchlistId, ticker));
      this.tickerDraft.set('');
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
