import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountOverviewStore } from '../../core/account-overview.store';
import type { DropdownOption } from '../../shared/ui/dropdown/dropdown';
import { MultiDropdown } from '../../shared/ui/multi-dropdown/multi-dropdown';
import { Pagination } from '../../shared/ui/pagination/pagination';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { Tooltip } from '../../shared/ui/tooltip/tooltip';

const PAGE_SIZE = 10;

/**
 * What the linked account holds right now: one row per symbol with quantity, average cost and cost
 * basis (quantity x average cost), filterable by symbol. Reads from the shared account store, so it
 * stays current with orders as they fill.
 */
@Component({
  selector: 'app-positions',
  imports: [CurrencyPipe, DecimalPipe, MultiDropdown, Pagination, RouterLink, Spinner, Tooltip],
  templateUrl: './positions.html',
  styleUrl: './positions.css',
})
export class Positions {
  protected readonly store = inject(AccountOverviewStore);

  protected readonly allPositions = computed(() =>
    [...(this.store.linked()?.overview.positions ?? [])].sort((a, b) => a.symbol.localeCompare(b.symbol)),
  );
  protected readonly currency = computed(() => this.store.linked()?.overview.balance.currency ?? null);

  protected readonly symbolOptions = computed<readonly DropdownOption[]>(() =>
    this.allPositions().map((position) => ({ value: position.symbol, label: position.symbol })),
  );
  /** Empty means "no filter". */
  protected readonly symbols = signal<readonly string[]>([]);

  protected readonly rows = computed(() => {
    const symbols = this.symbols();
    return this.allPositions()
      .filter((position) => symbols.length === 0 || symbols.includes(position.symbol))
      .map((position) => ({ ...position, costBasis: position.quantity * position.averageCost }));
  });
  protected readonly totalCostBasis = computed(() => this.rows().reduce((sum, row) => sum + row.costBasis, 0));

  protected readonly page = linkedSignal<readonly string[], number>({
    source: this.symbols,
    computation: () => 1,
  });
  protected readonly pageSize = PAGE_SIZE;
  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.rows().length / PAGE_SIZE)));
  protected readonly pageRows = computed(() => {
    const page = Math.min(this.page(), this.totalPages());
    return this.rows().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });

  protected resetFilters(): void {
    this.symbols.set([]);
  }
}
