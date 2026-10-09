import { Component, computed, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { NotificationInboxStore } from '../../core/notification-inbox.store';
import { Tooltip } from '../../shared/ui/tooltip/tooltip';

/** The most the badge shows before it says "99+". */
const BADGE_MAX = 99;

/**
 * The bell in the sidebar's navigation: a link to the notifications page with the unread count on it. The count comes
 * from the shared {@link NotificationInboxStore}, so it stays current wherever the customer is.
 * Rendered by the sidebar, which only exists while the user is signed in.
 */
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, RouterLinkActive, Tooltip],
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.css',
})
export class NotificationBell {
  /** Whether the sidebar is expanded (shows the label next to the bell). */
  readonly expanded = input(false);

  protected readonly inbox = inject(NotificationInboxStore);

  protected readonly unread = computed(() => this.inbox.unreadCount());
  protected readonly badge = computed(() => (this.unread() > BADGE_MAX ? `${BADGE_MAX}+` : String(this.unread())));
  protected readonly label = computed(() =>
    this.unread() > 0 ? `Notifications, ${this.unread()} unread` : 'Notifications',
  );
}
