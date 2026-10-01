import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountOverviewStore } from '../../core/account-overview.store';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { Spinner } from '../../shared/ui/spinner/spinner';

const PAGE_SIZE = 10;

/**
 * What the linked account holds right now: one row per symbol with quantity, average cost and cost
 * basis (quantity x average cost). Reads from the shared account store, so it
 * stays current with orders as they fill.
 */
@Component({
  selector: 'app-positions',
  imports: [CurrencyPipe, DecimalPipe, Pagination, RouterLink, Spinner],
  templateUrl: './positions.html',
  styleUrl: './positions.css',
})
export class Positions {
  protected readonly store = inject(AccountOverviewStore);

  protected readonly allPositions = computed(() =>
    [...(this.store.linked()?.overview.positions ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol)),
  );
  protected readonly currency = computed(() => this.store.linked()?.overview.balance.currency ?? null);

  protected readonly rows = computed(() =>
    this.allPositions().map((position) => ({ ...position, costBasis: position.quantity * position.averageCost })),
  );
  protected readonly totalCostBasis = computed(() => this.rows().reduce((sum, row) => sum + row.costBasis, 0));

  /** 1-based page; `pageRows` clamps it if a refresh leaves fewer rows. */
  protected readonly page = signal(1);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.rows().length / PAGE_SIZE)));
  protected readonly pageRows = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    return this.rows().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });
}
