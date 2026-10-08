import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { AuthDialogService } from '../../../core/auth-dialog.service';
import { ProfileStore } from '../../../core/profile.store';
import { SessionService } from '../../../core/session.service';
import { CompactMoneyPipe, PreferenceCurrencyPipe, PreferenceDatePipe } from '../../../shared/formatting/preference-pipes';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { Tooltip } from '../../../shared/ui/tooltip/tooltip';
import { ChangePasswordForm } from './change-password-form/change-password-form';

/**
 * The person icon in the header and the one pane behind it: who is signed in (auth-service), the trading account
 * (order-service) and the password change. Click to open; Esc, a click elsewhere or leaving the pane with Tab closes it,
 * and Esc returns focus to the button. Each half has its own loading and error state. Below 600px the pane is a bottom sheet.
 */
@Component({
  selector: 'app-profile-menu',
  imports: [ChangePasswordForm, CompactMoneyPipe, PreferenceCurrencyPipe, PreferenceDatePipe, Spinner, Tooltip],
  templateUrl: './profile-menu.html',
  styleUrl: './profile-menu.css',
  host: {
    '(focusout)': 'onFocusOut($event)',
    '(keydown.escape)': 'close(true)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class ProfileMenu {
  protected readonly session = inject(SessionService);
  protected readonly profile = inject(ProfileStore);
  protected readonly account = inject(AccountOverviewStore);
  private readonly authDialog = inject(AuthDialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly pane = viewChild<ElementRef<HTMLElement>>('pane');

  /** The session ended inside the pane (three wrong current passwords); the header sends the user home. */
  readonly signedOut = output<void>();
  protected readonly open = signal(false);
  protected readonly view = signal<'details' | 'password'>('details');

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.view.set('details');
    this.open.set(true);
    this.profile.refresh();
    // The pane exists only once the signal is applied; move focus into it so keyboard users land on it.
    queueMicrotask(() => this.pane()?.nativeElement.focus());
  }

  protected close(returnFocus = false): void {
    const wasOpen = this.open();
    this.open.set(false);
    this.view.set('details');
    if (returnFocus && wasOpen) {
      this.trigger()?.nativeElement.focus();
    }
  }

  protected openAccountSetup(): void {
    this.close();
    this.authDialog.open('account');
  }

  protected onSignedOut(): void {
    this.close();
    this.signedOut.emit();
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !this.host.nativeElement.contains(next)) {
      this.close();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
