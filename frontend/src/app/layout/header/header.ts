import { Component, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NotificationService } from '../../core/notification.service';
import { SessionService } from '../../core/session.service';
import { ThemeService } from '../../core/theme.service';
import { Tooltip } from '../../shared/ui/tooltip/tooltip';

@Component({
  selector: 'app-header',
  imports: [RouterLink, Tooltip],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Only used to expose the sidebar's expanded state to assistive tech. */
  readonly sidebarOpen = input(false);
  readonly toggleSidebar = output<void>();

  protected logout(): void {
    this.session.logout();
    this.notifications.success('Logout successful');
    void this.router.navigateByUrl('/');
  }
}
