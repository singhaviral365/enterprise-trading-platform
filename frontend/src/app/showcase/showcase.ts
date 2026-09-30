import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { DialogService } from '../core/dialog.service';
import { NotificationService } from '../core/notification.service';
import { SessionService } from '../core/session.service';
import { Dropdown, DropdownOption } from '../shared/ui/dropdown/dropdown';
import { Multiselect, MultiselectOption } from '../shared/ui/multiselect/multiselect';
import { Pagination } from '../shared/ui/pagination/pagination';
import { Spinner } from '../shared/ui/spinner/spinner';
import { Tooltip } from '../shared/ui/tooltip/tooltip';

interface Trade {
  readonly id: number;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: number;
  readonly price: number;
  readonly status: 'FILLED' | 'PENDING' | 'REJECTED';
}

const STATUS_CLASS: Record<Trade['status'], string> = {
  FILLED: 'is-success',
  PENDING: 'is-warning',
  REJECTED: 'is-error',
};

const PAGE_SIZE = 3;

/** Preview of the shared UI components and global styles. Delete this folder and its route when no longer needed. */
@Component({
  selector: 'app-showcase',
  imports: [CurrencyPipe, Dropdown, Multiselect, Pagination, Spinner, Tooltip],
  templateUrl: './showcase.html',
  styleUrl: './showcase.css',
})
export class Showcase {
  protected readonly session = inject(SessionService);
  private readonly dialog = inject(DialogService);
  private readonly notifications = inject(NotificationService);

  protected readonly sectors: readonly DropdownOption[] = [
    { value: 'tech', label: 'Technology' },
    { value: 'finance', label: 'Financials' },
    { value: 'energy', label: 'Energy' },
    { value: 'health', label: 'Healthcare', disabled: true },
  ];
  protected readonly sector = signal('');
  protected readonly sectorInvalid = computed(() => this.submitted() && this.sector() === '');

  protected readonly symbols: readonly MultiselectOption[] = [
    { id: 'AAPL', label: 'AAPL' },
    { id: 'MSFT', label: 'MSFT' },
    { id: 'TSLA', label: 'TSLA' },
    { id: 'JPM', label: 'JPM' },
  ];
  protected readonly watchlist = signal<readonly (string | number)[]>(['AAPL']);

  private readonly trades: readonly Trade[] = [
    { id: 1, symbol: 'AAPL', side: 'BUY', quantity: 50, price: 189.32, status: 'FILLED' },
    { id: 2, symbol: 'MSFT', side: 'SELL', quantity: 20, price: 411.05, status: 'FILLED' },
    { id: 3, symbol: 'TSLA', side: 'BUY', quantity: 15, price: 243.8, status: 'PENDING' },
    { id: 4, symbol: 'JPM', side: 'BUY', quantity: 100, price: 198.11, status: 'REJECTED' },
    { id: 5, symbol: 'AAPL', side: 'SELL', quantity: 10, price: 190.4, status: 'FILLED' },
    { id: 6, symbol: 'MSFT', side: 'BUY', quantity: 5, price: 409.9, status: 'PENDING' },
    { id: 7, symbol: 'TSLA', side: 'SELL', quantity: 30, price: 245.15, status: 'FILLED' },
  ];
  protected readonly page = signal(1);
  protected readonly totalPages = Math.ceil(this.trades.length / PAGE_SIZE);
  protected readonly pageRows = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.trades.slice(start, start + PAGE_SIZE);
  });

  protected readonly submitted = signal(false);
  protected readonly saving = signal(false);
  protected readonly pageLoading = signal(false);

  protected statusClass(status: Trade['status']): string {
    return `status ${STATUS_CLASS[status]}`;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.sector() === '') {
      return;
    }
    this.saving.set(true);
    setTimeout(() => {
      this.saving.set(false);
      this.notifications.success('Saved');
    }, 1500);
  }

  protected showPageSpinner(): void {
    this.pageLoading.set(true);
    setTimeout(() => this.pageLoading.set(false), 1500);
  }

  protected notify(type: 'success' | 'error' | 'warning' | 'info'): void {
    this.notifications.show(`This is a ${type} notification`, type);
  }

  protected async cancelOrder(): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Cancel order',
      message: 'This will cancel the pending order. This cannot be undone.',
      type: 'warning',
      confirmText: 'Cancel order',
      cancelText: 'Keep order',
    });
    this.notifications.info(confirmed ? 'Order cancelled' : 'Order kept');
  }
}
