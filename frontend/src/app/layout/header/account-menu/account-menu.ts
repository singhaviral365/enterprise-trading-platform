import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { AuthDialogService } from '../../../core/auth-dialog.service';
import { SessionService } from '../../../core/session.service';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { PreferenceCurrencyPipe, PreferenceDatePipe } from '../../../shared/formatting/preference-pipes';

/**
 * The username chip in the header. Hovering, focusing or clicking it reveals the linked account's
 * details (disclosure pattern: the button toggles a panel and reports it via aria-expanded).
 * Clicking pins it open; Esc or clicking elsewhere closes it.
 */
@Component({
  selector: 'app-account-menu',
  imports: [PreferenceCurrencyPipe, PreferenceDatePipe, Spinner],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.css',
  host: {
    '(mouseenter)': 'hovering.set(true)',
    '(mouseleave)': 'hovering.set(false)',
    '(focusout)': 'onFocusOut($event)',
    '(keydown.escape)': 'close(true)',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class AccountMenu {
  protected readonly session = inject(SessionService);
  protected readonly store = inject(AccountOverviewStore);
  private readonly authDialog = inject(AuthDialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');

  protected readonly hovering = signal(false);
  protected readonly pinned = signal(false);

  protected toggle(): void {
    this.pinned.update((open) => !open);
  }

  protected close(returnFocus = false): void {
    const wasOpen = this.pinned() || this.hovering();
    this.pinned.set(false);
    this.hovering.set(false);
    if (returnFocus && wasOpen) {
      this.trigger()?.nativeElement.focus();
    }
  }

  protected openAccountSetup(): void {
    this.close();
    this.authDialog.open('account');
  }

  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.host.nativeElement.contains(next)) {
      this.pinned.set(false);
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.pinned.set(false);
    }
  }
}
