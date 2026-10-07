import { Service, computed, effect, inject, linkedSignal, resource, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Notification, NotificationCategory, NotificationPage } from '../api/generated/notifications';
import { NotificationsApi } from '../api/notifications-api.service';
import { AccountOverviewStore, accountIdFromNumber } from './account-overview.store';
import { describeError } from './errors/describe-error';
import { NotificationService } from './notification.service';

/** How often the inbox is read again, which is also how often the bell badge can change on its own. */
export const INBOX_REFRESH_MS = 30_000;

/** A notification read longer ago than this drops out of the list (the server applies the same rule). */
export const READ_RETENTION_MS = 60 * 60 * 1000;

export const INBOX_PAGE_SIZES = [5, 10, 25] as const;

/**
 * The signed-in customer's notification inbox, shared by the bell (the badge) and the panel (the list).
 *
 * It reads one page at a time from the Trade API (`GET /accounts/{id}/notifications`) with the search text, category
 * filter and page the customer chose, newest first. Unread notifications are listed, and so are ones read within the
 * last hour, dimmed, so a message just opened does not vanish under the cursor; an hour later it drops out (it is
 * not deleted: the server keeps it with its read time). Reading one is `POST .../read`; the page updates at once and
 * the badge count goes down by one without waiting for the next refresh.
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
  /** 1-based, as the pagination component counts. */
  readonly page = signal(1);
  readonly pageSize = signal<number>(INBOX_PAGE_SIZES[0]);

  private readonly now = signal(Date.now());
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
            page: this.page(),
            size: this.pageSize(),
          };
    },
    loader: ({ params }): Promise<NotificationPage> =>
      firstValueFrom(
        this.api.list(params.accountId, {
          q: params.q,
          categories: params.categories,
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
    const now = this.now();
    const loaded = this.data.hasValue() ? this.data.value().items : [];
    return loaded
      .map((item) => (item.readAt ? item : { ...item, readAt: read.get(item.notificationId) ?? null }))
      .filter((item) => !item.readAt || now - Date.parse(item.readAt) < READ_RETENTION_MS);
  });

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
        this.now.set(Date.now());
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
