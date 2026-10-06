import { DOCUMENT, Service, effect, inject, signal } from '@angular/core';

import { Theme } from './preferences';

const STORAGE_KEY = 'theme';

@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly dark = signal(this.readInitialTheme());

  readonly isDark = this.dark.asReadonly();

  constructor() {
    effect(() => {
      const theme = this.dark() ? 'dark' : 'light';
      this.document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Storage can be unavailable (private mode, blocked site data); the theme still applies.
      }
    });
  }

  toggle(): void {
    this.dark.update((isDark) => !isDark);
  }

  /**
   * Applies the theme the customer saved in Settings. `SYSTEM` follows the device. The header button still flips the
   * theme for the moment; this is what is applied again the next time the preferences load.
   */
  apply(theme: Theme): void {
    this.dark.set(theme === Theme.System ? this.systemPrefersDark() : theme === Theme.Dark);
  }

  private readInitialTheme(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return stored === 'dark';
      }
    } catch {
      // fall through to the system preference
    }
    return this.systemPrefersDark();
  }

  private systemPrefersDark(): boolean {
    return this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }
}
