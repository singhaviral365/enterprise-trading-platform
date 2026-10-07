import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Tooltip } from '../../shared/ui/tooltip/tooltip';
import { NotificationBell } from '../notifications/notification-bell';

export interface SidebarItem {
  /** Router path, e.g. `/dashboard`. */
  readonly route: string;
  readonly label: string;
  /** Font Awesome classes, e.g. `fas fa-chart-line`. */
  readonly icon: string;
}

/** Collapsible navigation rail. The app shell only renders it while the user is logged in. */
@Component({
  selector: 'app-sidebar',
  imports: [NotificationBell, RouterLink, RouterLinkActive, Tooltip],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  readonly open = input(false);
  readonly items = input.required<readonly SidebarItem[]>();
}
