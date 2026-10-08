import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PreferencesStore } from './core/preferences.store';
import { SessionService } from './core/session.service';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';
import { Sidebar, SidebarItem } from './layout/sidebar/sidebar';
import { AuthDialog } from './features/auth/auth-dialog/auth-dialog';
import { Dialog } from './shared/ui/dialog/dialog';
import { NotificationCenter } from './shared/ui/notification/notification';
import { AnimatedCatComponent } from './shared/ui/animated-cat/animated-cat';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, Sidebar, Dialog, AuthDialog, NotificationCenter, AnimatedCatComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly session = inject(SessionService);
  /** Injected here so the preferences load (and the formats, theme and signal assistant follow them) from the first page. */
  protected readonly preferences = inject(PreferencesStore);
  protected readonly sidebarOpen = signal(false);

  /** The signed-in pages. */
  protected readonly navItems: readonly SidebarItem[] = [
    { route: '/dashboard', label: 'Dashboard', icon: 'fas fa-gauge-high' },
    { route: '/market', label: 'Market data', icon: 'fas fa-chart-line' },
    { route: '/portfolio', label: 'Portfolio', icon: 'fas fa-chart-pie' },
    { route: '/orders', label: 'Order history', icon: 'fas fa-clock-rotate-left' },
    { route: '/strategies', label: 'Strategies', icon: 'fas fa-robot' },
    { route: '/settings', label: 'Settings', icon: 'fas fa-gear' },
    // { route: '/showcase', label: 'Components', icon: 'fas fa-puzzle-piece' },
  ];

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }
}
