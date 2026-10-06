import { Component, computed, inject, input, output } from '@angular/core';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import type { MarketRow } from '../../../core/market-row';
import { MarketService, convertCurrency } from '../../../core/market.service';
import { PreferencesStore } from '../../../core/preferences.store';
import { InstrumentIcon } from '../instrument-icon/instrument-icon';
import { PreferenceCurrencyPipe, PreferenceDatePipe, PreferenceDecimalPipe } from '../../formatting/preference-pipes';

/**
 * The top of every trade screen: logo, symbol, name, asset class and quote date, then the price card (price, what
 * it comes to in the account currency, change, previous close). The market page's quote and the positions page's
 * Buy / Sell both show it, through `TradePanel`, so the second screen looks the same wherever it was opened from.
 * The heading carries `id="detail-title"`, which `SplitView` uses to name the pane or dialog.
 */
@Component({
  selector: 'app-quote-summary',
  imports: [PreferenceCurrencyPipe, PreferenceDatePipe, PreferenceDecimalPipe, InstrumentIcon],
  templateUrl: './quote-summary.html',
  styleUrl: './quote-summary.css',
})
export class QuoteSummary {
  readonly row = input.required<MarketRow>();
  /** The close button was pressed. */
  readonly closed = output<void>();

  private readonly market = inject(MarketService);
  private readonly store = inject(AccountOverviewStore);
  private readonly preferences = inject(PreferencesStore);

  /**
   * What the live price comes to in the customer's chosen currency (their account's own unless they picked another in
   * Settings), for instruments quoted in a different one; null when the currencies match or the exchange rates have
   * not loaded. It is an estimate only: orders always settle in the account's currency.
   */
  protected readonly accountEquivalent = computed(() => {
    const row = this.row();
    const target = this.store.linked() ? this.preferences.preferredCurrency() : null;
    if (row.quote.price === null || !row.currency || !target || row.currency === target) {
      return null;
    }
    const amount = convertCurrency(this.market.fxRates(), row.quote.price, row.currency, target);
    return amount === null ? null : { amount, currency: target };
  });

  /** The quote's timestamp (asOf), shown as a date in the header; null when missing or unparseable. */
  protected readonly asOf = computed(() => {
    const value = this.row().quote.details?.['asOf'];
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
  });
}
