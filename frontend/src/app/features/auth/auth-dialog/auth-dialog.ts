import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TradeApi } from '../../../api/trade-api.service';
import { AuthDialogService, AuthMode } from '../../../core/auth-dialog.service';
import { NotificationService } from '../../../core/notification.service';
import { SessionService } from '../../../core/session.service';
import { AccountSetupForm } from '../account-setup-form/account-setup-form';
import { LoginForm } from '../login-form/login-form';
import { RegisterForm } from '../register-form/register-form';
import { SignedInEvent } from '../signed-in-event';

const HEADINGS: Record<AuthMode, { title: string; subtitle: string }> = {
  login: { title: 'Welcome back', subtitle: 'Sign in to continue to your dashboard.' },
  register: { title: 'Create your login', subtitle: 'Step 1 of 2: choose how you will sign in.' },
  account: {
    title: 'Open your trading account',
    subtitle: 'Step 2 of 2: tell us about you to link a trading account to your login.',
  },
};

/**
 * Sign-in / register dialog on the native `<dialog>` element (focus trap, Esc and top layer come
 * from the browser). The page behind is blurred through `::backdrop`. Render once in the app shell.
 *
 * Flow: sign in (or register, then sign in) → ask the Trade API whether an account is linked to
 * this user → linked: go to the dashboard; not linked: show the account set-up step.
 */
@Component({
  selector: 'app-auth-dialog',
  imports: [LoginForm, RegisterForm, AccountSetupForm],
  templateUrl: './auth-dialog.html',
  styleUrl: './auth-dialog.css',
})
export class AuthDialog {
  protected readonly authDialog = inject(AuthDialogService);
  private readonly trade = inject(TradeApi);
  private readonly session = inject(SessionService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly element = viewChild<ElementRef<HTMLDialogElement>>('dialogElement');

  protected readonly modes: readonly { id: AuthMode; label: string }[] = [
    { id: 'login', label: 'Sign in' },
    { id: 'register', label: 'Register' },
  ];
  protected readonly heading = computed(() => HEADINGS[this.authDialog.mode()]);

  constructor() {
    effect(() => {
      const node = this.element()?.nativeElement;
      if (!node) {
        return;
      }
      if (this.authDialog.isOpen()) {
        if (!node.open) {
          node.showModal();
        }
      } else if (node.open) {
        node.close();
      }
    });
  }

  protected async onSignedIn({ username, email }: SignedInEvent): Promise<void> {
    let linked = true;
    try {
      linked = (await firstValueFrom(this.trade.accountLink())).linked;
    } catch {
      // Trade API unavailable: carry on to the dashboard, which reports the problem and can retry.
    }
    if (linked) {
      this.notifications.success(`Welcome, ${username}`);
      await this.finish();
      return;
    }
    this.authDialog.setPrefillEmail(email ?? '');
    this.authDialog.setMode('account');
  }

  protected async onAccountCompleted(): Promise<void> {
    this.notifications.success('Your trading account is ready');
    await this.finish();
  }

  /** Closing from any step: a signed-in user without an account still lands on the dashboard. */
  protected async dismiss(): Promise<void> {
    if (this.authDialog.mode() === 'account' && this.session.isLoggedIn()) {
      await this.finish();
    } else {
      this.authDialog.close();
    }
  }

  private async finish(): Promise<void> {
    this.authDialog.close();
    await this.router.navigateByUrl('/dashboard');
  }

  /** Arrow keys move between the two tabs, as in the WAI-ARIA tabs pattern. */
  protected onTabKeydown(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const next: AuthMode = this.authDialog.mode() === 'login' ? 'register' : 'login';
    const target: AuthMode = event.key === 'Home' ? 'login' : event.key === 'End' ? 'register' : next;
    this.authDialog.setMode(target);
    this.element()?.nativeElement.querySelector<HTMLElement>(`#auth-tab-${target}`)?.focus();
  }

  /** Esc: route through `dismiss` so the service state stays in sync with the element. */
  protected onCancel(event: Event): void {
    event.preventDefault();
    void this.dismiss();
  }

  /** Clicks on the blurred backdrop land on the <dialog> element itself (the panel is a child). */
  protected onClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      void this.dismiss();
    }
  }
}
