import { Component, DestroyRef, computed, inject, signal } from '@angular/core';

import { Notification, NotificationCategory } from '../../api/generated/notifications';
import { INBOX_PAGE_SIZES, NotificationInboxStore } from '../../core/notification-inbox.store';
import { PreferenceDatePipe } from '../../shared/formatting/preference-pipes';
import type { DropdownOption } from '../../shared/ui/dropdown/dropdown';
import { MultiDropdown } from '../../shared/ui/multi-dropdown/multi-dropdown';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { Spinner } from '../../shared/ui/spinner/spinner';

/** Wait this long after the last keystroke before searching, so typing does not fire a request per letter. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The notifications page: search, category filter, the list (newest first) and pagination. It holds only what the
 * customer is typing; everything that is loaded lives in {@link NotificationInboxStore}. Opening a notification marks
 * it read.
 */
@Component({
  selector: 'app-notifications-page',
  imports: [MultiDropdown, Pagination, PreferenceDatePipe, Spinner],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export class Notifications {
  protected readonly store = inject(NotificationInboxStore);

  protected readonly pageSizes = INBOX_PAGE_SIZES;
  protected readonly categoryOptions: readonly DropdownOption[] = [
    { value: NotificationCategory.OrderStatus, label: 'Order updates' },
    { value: NotificationCategory.WatchlistAlerts, label: 'Watchlist alerts' },
  ];

  /** What is in the search box right now; the store only hears about it after the debounce. */
  protected readonly searchDraft = signal(this.store.query());
  protected readonly categories = computed<readonly string[]>(() => this.store.categories());
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.searchTimer) {
        clearTimeout(this.searchTimer);
      }
    });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchDraft.set(value);
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.store.setQuery(value), SEARCH_DEBOUNCE_MS);
  }

  protected onCategories(selected: readonly string[]): void {
    this.store.setCategories(selected as readonly NotificationCategory[]);
  }

  protected open(notification: Notification): void {
    void this.store.markRead(notification);
  }

  protected iconOf(notification: Notification): string {
    return notification.category === NotificationCategory.OrderStatus ? 'fas fa-receipt' : 'fas fa-bell';
  }

  protected filtering(): boolean {
    return this.store.query() !== '' || this.store.categories().length > 0;
  }
}
