import { Service, computed, effect, inject, linkedSignal, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { InboxStatus, Notification, NotificationCategory, NotificationPage } from '../api/generated/notifications';
import { NotificationsApi } from '../api/notifications-api.service';
import { AccountOverviewStore, accountIdFromNumber } from './account-overview.store';
import { describeError } from './errors/describe-error';
import { NotificationService } from './notification.service';
import { EMPTY_DATE_RANGE, DateRange, dateRangeError, endOfDayIso, startOfDayIso } from '../shared/ui/date-range/date-range';

/** How often the inbox is read again, which is also how often the bell badge can change on its own. */
export const INBOX_REFRESH_MS = 30_000;

/** What the notifications page shows until the customer changes it: the unread ones. */
export const DEFAULT_STATUSES: readonly InboxStatus[] = [InboxStatus.Unread];

export const INBOX_PAGE_SIZES = [5, 10, 25] as const;

/**
 * The signed-in customer's notification inbox, shared by the bell (the badge) and the panel (the list).
 *
 * It reads one page at a time from the Trade API (`GET /accounts/{id}/notifications`) with the search text, category,
 * status (unread by default), date range and page the customer chose, newest first. A notification opened a moment ago
 * stays on the page, dimmed, until the next refresh or filter change, so it does not vanish under the cursor. Nothing is
 * deleted: the server keeps a read notification with its read time. Reading one is `POST .../read`; the page updates at
 * once and the badge count goes down by one without waiting for the next refresh.
 *
 * The badge count is the server's account-wide unread total (`unreadCount`), which no filter changes, so the bell never
 * follows what the page is filtered to.
 *
 * It re-reads every {@link INBOX_REFRESH_MS} while there is an account, so a new fill or a fired alert shows up on
 * the bell on its own. Idle while signed out or with no account.
 */
@Service()
export class NotificationInboxStore {
  private readonly accounts = inject(AccountOverviewStore);
  private readonly api = inject(NotificationsApi);
  private readonly toasts = inject(NotificationService);

  readonly accountId = computed(() => accountIdFromNumber(this.accounts.linked()?.accountNumber ?? null));

  /** The search text actually applied (the panel debounces what the customer types). */
  readonly query = signal('');
  readonly categories = signal<readonly NotificationCategory[]>([]);
  readonly statuses = signal<readonly InboxStatus[]>(DEFAULT_STATUSES);
  /** Whole days (`YYYY-MM-DD`), empty for no limit; sent as the first and last instant of the day in the user's time zone. */
  readonly dateRange = signal<DateRange>(EMPTY_DATE_RANGE);
  /** 1-based, as the pagination component counts. */
  readonly page = signal(1);
  readonly pageSize = signal<number>(INBOX_PAGE_SIZES[0]);

  /** Read times we set ourselves, so a notification opened a moment ago shows as read before the next refresh. */
  private readonly locallyRead = signal<ReadonlyMap<number, string>>(new Map());

  readonly data = resource({
    params: () => {
      const accountId = this.accountId();
      return accountId === null
        ? undefined
        : {
            accountId,
            q: this.query(),
            categories: this.categories(),
            statuses: this.statuses(),
            from: startOfDayIso(this.dateRange().from),
            to: endOfDayIso(this.dateRange().to),
            page: this.page(),
            size: this.pageSize(),
          };
    },
    loader: ({ params }): Promise<NotificationPage> =>
      firstValueFrom(
        this.api.list(params.accountId, {
          q: params.q,
          categories: params.categories,
          statuses: params.statuses,
          from: params.from,
          to: params.to,
          page: params.page - 1,
          size: params.size,
        }),
      ),
  });

  /** Unread across the account, whatever the filters: it is what the badge shows. */
  readonly unreadCount = linkedSignal<NotificationPage | undefined, number>({
    source: () => (this.data.hasValue() ? this.data.value() : undefined),
    computation: (page, previous) => page?.unreadCount ?? previous?.value ?? 0,
  });

  readonly items = computed<readonly Notification[]>(() => {
    const read = this.locallyRead();
    const loaded = this.data.hasValue() ? this.data.value().items : [];
    return loaded.map((item) => (item.readAt ? item : { ...item, readAt: read.get(item.notificationId) ?? null }));
  });

  /** True while every filter is at its starting value: no text, no category, unread only, any date. */
  readonly isDefaultFilters = computed(
    () =>
      this.query() === '' &&
      this.categories().length === 0 &&
      this.statuses().length === DEFAULT_STATUSES.length &&
      this.statuses().every((status) => DEFAULT_STATUSES.includes(status)) &&
      this.dateRange().from === '' &&
      this.dateRange().to === '',
  );

  readonly totalItems = computed(() => (this.data.hasValue() ? this.data.value().totalItems : 0));
  readonly totalPages = computed(() => Math.max(1, this.data.hasValue() ? this.data.value().totalPages : 1));
  readonly errorMessage = computed(() => {
    const error = this.data.error();
    return error ? describeError(error) : '';
  });

  constructor() {
    effect((onCleanup) => {
      if (this.accountId() === null) {
        return;
      }
      const timer = setInterval(() => {
        this.data.reload();
      }, INBOX_REFRESH_MS);
      onCleanup(() => clearInterval(timer));
    });
  }

  setQuery(text: string): void {
    this.query.set(text.trim());
    this.page.set(1);
  }

  setCategories(categories: readonly NotificationCategory[]): void {
    this.categories.set(categories);
    this.page.set(1);
  }

  /** Unread, read or both. Neither is not a choice: it falls back to unread. */
  setStatuses(statuses: readonly InboxStatus[]): void {
    this.statuses.set(statuses.length === 0 ? DEFAULT_STATUSES : statuses);
    this.page.set(1);
  }

  /** Applies a range only when it is usable (see {@link dateRangeError}); an unusable one changes nothing. */
  setDateRange(range: DateRange): void {
    if (dateRangeError(range) !== '') {
      return;
    }
    this.dateRange.set(range);
    this.page.set(1);
  }

  /** Back to the starting filters: no text, no category, unread only, any date. */
  resetFilters(): void {
    this.query.set('');
    this.categories.set([]);
    this.statuses.set(DEFAULT_STATUSES);
    this.dateRange.set(EMPTY_DATE_RANGE);
    this.page.set(1);
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  reload(): void {
    this.data.reload();
  }

  /** Marks one notification read. Already-read ones are left alone. A failure is shown and nothing changes. */
  async markRead(notification: Notification): Promise<void> {
    const accountId = this.accountId();
    if (accountId === null || notification.readAt || this.locallyRead().has(notification.notificationId)) {
      return;
    }
    try {
      const updated = await firstValueFrom(this.api.markRead(accountId, notification.notificationId));
      const readAt = updated.readAt ?? new Date().toISOString();
      this.locallyRead.update((read) => new Map(read).set(notification.notificationId, readAt));
      this.unreadCount.update((count) => Math.max(0, count - 1));
    } catch (error) {
      this.toasts.error(describeError(error));
    }
  }
}
