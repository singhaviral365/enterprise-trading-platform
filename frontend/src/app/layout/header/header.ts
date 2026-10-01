import { Component, inject, input, output } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { SessionService } from '../../core/session.service';
import { ThemeService } from '../../core/theme.service';
import { Tooltip } from '../../shared/ui/tooltip/tooltip';
import { AccountMenu } from './account-menu/account-menu';

@Component({
  selector: 'app-header',
  imports: [RouterLink, Tooltip, AccountMenu],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  protected readonly session = inject(SessionService);
  protected readonly theme = inject(ThemeService);
  protected readonly authDialog = inject(AuthDialogService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);

  /** Only used to expose the sidebar's expanded state to assistive tech. */
  readonly sidebarOpen = input(false);
  readonly toggleSidebar = output<void>();

  protected logout(): void {
    this.auth.logout();
    this.notifications.success('Logout successful');
    void this.router.navigateByUrl('/');
  }
}
