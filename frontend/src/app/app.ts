import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SessionService } from './core/session.service';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';
import { Sidebar, SidebarItem } from './layout/sidebar/sidebar';
import { AuthDialog } from './features/auth/auth-dialog/auth-dialog';
import { Dialog } from './shared/ui/dialog/dialog';
import { NotificationCenter } from './shared/ui/notification/notification';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, Sidebar, Dialog, AuthDialog, NotificationCenter],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly session = inject(SessionService);
  protected readonly sidebarOpen = signal(false);

  /** Placeholder navigation: replace with the real routes as feature pages are added. */
  protected readonly navItems: readonly SidebarItem[] = [
    { route: '/dashboard', label: 'Dashboard', icon: 'fas fa-gauge-high' },
    { route: '/orders', label: 'Order history', icon: 'fas fa-clock-rotate-left' },
    { route: '/showcase', label: 'Components', icon: 'fas fa-puzzle-piece' },
  ];

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }
}
