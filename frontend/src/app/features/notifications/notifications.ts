import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

import { InboxStatus, Notification, NotificationCategory } from '../../api/generated/notifications';
import { INBOX_PAGE_SIZES, NotificationInboxStore } from '../../core/notification-inbox.store';
import { PreferenceDatePipe } from '../../shared/formatting/preference-pipes';
import { DateRange, DateRangeControl } from '../../shared/ui/date-range/date-range';
import type { DropdownOption } from '../../shared/ui/dropdown/dropdown';
import { MultiDropdown } from '../../shared/ui/multi-dropdown/multi-dropdown';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { Tooltip } from '../../shared/ui/tooltip/tooltip';

/** Wait this long after the last keystroke before searching, so typing does not fire a request per letter. */
const SEARCH_DEBOUNCE_MS = 300;

const CATEGORY_LABELS: Readonly<Record<NotificationCategory, string>> = {
  [NotificationCategory.OrderStatus]: 'Order update',
  [NotificationCategory.WatchlistAlerts]: 'Watchlist alert',
  [NotificationCategory.StrategyExecution]: 'Strategy',
};

/**
 * The notifications page: search, category, status (unread by default) and date-range filters with a reset button, the
 * list (newest first) and pagination. It holds only what the customer is typing; everything that is loaded lives in
 * {@link NotificationInboxStore}. Opening a notification marks it read. The filters start from their defaults every time
 * the page opens.
 */
@Component({
  selector: 'app-notifications-page',
  imports: [DateRangeControl, MultiDropdown, Pagination, PreferenceDatePipe, Spinner, Tooltip],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export class Notifications {
  protected readonly store = inject(NotificationInboxStore);

  protected readonly pageSizes = INBOX_PAGE_SIZES;
  protected readonly categoryOptions: readonly DropdownOption[] = [
    { value: NotificationCategory.OrderStatus, label: 'Order updates' },
    { value: NotificationCategory.WatchlistAlerts, label: 'Watchlist alerts' },
    { value: NotificationCategory.StrategyExecution, label: 'Strategy executions' },
  ];
  protected readonly statusOptions: readonly DropdownOption[] = [
    { value: InboxStatus.Unread, label: 'Unread' },
    { value: InboxStatus.Read, label: 'Read' },
  ];

  /** What is in the search box right now; the store only hears about it after the debounce. */
  protected readonly searchDraft = signal('');
  protected readonly categories = computed<readonly string[]>(() => this.store.categories());
  protected readonly statuses = computed<readonly string[]>(() => this.store.statuses());
  /** What the date inputs show, including a range the store refused because it is unusable. */
  protected readonly dateDraft = signal<DateRange>(this.store.dateRange());
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.store.resetFilters();
    this.dateDraft.set(this.store.dateRange());
    inject(DestroyRef).onDestroy(() => this.clearSearchTimer());
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchDraft.set(value);
    this.clearSearchTimer();
    this.searchTimer = setTimeout(() => this.store.setQuery(value), SEARCH_DEBOUNCE_MS);
  }

  protected onCategories(selected: readonly string[]): void {
    this.store.setCategories(selected as readonly NotificationCategory[]);
  }

  protected onStatuses(selected: readonly string[]): void {
    this.store.setStatuses(selected as readonly InboxStatus[]);
  }

  protected onDateRange(range: DateRange): void {
    this.dateDraft.set(range);
    this.store.setDateRange(range);
  }

  protected resetFilters(): void {
    this.clearSearchTimer();
    this.searchDraft.set('');
    this.dateDraft.set({ from: '', to: '' });
    this.store.resetFilters();
  }

  protected open(notification: Notification): void {
    void this.store.markRead(notification);
  }

  protected iconOf(notification: Notification): string {
    switch (notification.category) {
      case NotificationCategory.OrderStatus:
        return 'fas fa-receipt';
      case NotificationCategory.StrategyExecution:
        return 'fas fa-robot';
      default:
        return 'fas fa-bell';
    }
  }

  protected categoryLabel(notification: Notification): string {
    return CATEGORY_LABELS[notification.category];
  }

  private clearSearchTimer(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }
}
