import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PreferencesStore } from './core/preferences.store';
import { SessionService } from './core/session.service';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';
import { Sidebar, SidebarItem } from './layout/sidebar/sidebar';
import { AuthDialog } from './features/auth/auth-dialog/auth-dialog';
import { ChatAssistant } from './shared/ui/chat-assistant/chat-assistant';
import { Dialog } from './shared/ui/dialog/dialog';
import { NotificationCenter } from './shared/ui/notification/notification';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, Sidebar, Dialog, AuthDialog, NotificationCenter, ChatAssistant],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly session = inject(SessionService);
  /** Injected here so the preferences load (and the formats, theme and chatbot icon follow them) from the first page. */
  protected readonly preferences = inject(PreferencesStore);
  protected readonly sidebarOpen = signal(false);

  /** Placeholder navigation: replace with the real routes as feature pages are added. */
  protected readonly navItems: readonly SidebarItem[] = [
    { route: '/dashboard', label: 'Dashboard', icon: 'fas fa-gauge-high' },
    { route: '/market', label: 'Market data', icon: 'fas fa-chart-line' },
    { route: '/positions', label: 'Positions', icon: 'fas fa-layer-group' },
    { route: '/orders', label: 'Order history', icon: 'fas fa-clock-rotate-left' },
    { route: '/settings', label: 'Settings', icon: 'fas fa-gear' },
    // { route: '/showcase', label: 'Components', icon: 'fas fa-puzzle-piece' },
  ];

  protected toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
  }
}
