import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OrderSide, Strategy, StrategyStatus, TriggerDirection } from '../../api/generated/strategies';
import { DialogService } from '../../core/dialog.service';
import { describeError } from '../../core/errors/describe-error';
import { NotificationService } from '../../core/notification.service';
import { StrategiesStore } from '../../core/strategies.store';
import { PreferenceCurrencyPipe, PreferenceDatePipe, PreferenceDecimalPipe } from '../../shared/formatting/preference-pipes';
import { InstrumentLabel } from '../../shared/ui/instrument-label/instrument-label';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { StrategyActivity } from './strategy-activity/strategy-activity';
import { StrategyForm } from './strategy-form/strategy-form';
import { canCancel, canSwitchOff, canSwitchOn, statusLook } from './strategy-look';

/**
 * Strategies change on their own: the executor claims one when its trigger is met and stops or expires others. The page
 * re-reads them this often while it is open, so a strategy that just traded shows as done without a reload.
 */
const REFRESH_MS = 15_000;

/**
 * Automated strategies: rules the customer sets once and the platform trades for them. The page creates them, shows what
 * each is doing, lets the customer switch one off the moment they want it to stop (and back on), cancel it, and read the
 * trail of what it did. Nothing is placed from here; the executor-service places each order through the ordinary order route.
 */
@Component({
  selector: 'app-strategies-page',
  imports: [
    InstrumentLabel,
    PreferenceCurrencyPipe,
    PreferenceDatePipe,
    PreferenceDecimalPipe,
    RouterLink,
    Spinner,
    StrategyActivity,
    StrategyForm,
  ],
  templateUrl: './strategies.html',
  styleUrl: './strategies.css',
})
export class StrategiesPage {
  protected readonly store = inject(StrategiesStore);
  private readonly dialog = inject(DialogService);
  private readonly notifications = inject(NotificationService);

  /** Exposed so the template compares against the generated enums, never string literals. */
  protected readonly OrderSide = OrderSide;
  protected readonly TriggerDirection = TriggerDirection;
  protected readonly StrategyStatus = StrategyStatus;
  protected readonly statusLook = statusLook;
  protected readonly canSwitchOff = canSwitchOff;
  protected readonly canSwitchOn = canSwitchOn;
  protected readonly canCancel = canCancel;

  /** Open on a wide screen, closed on a phone, where it would push the list off the first screen. Either way it is one tap away. */
  protected readonly safetyOpen = typeof matchMedia === 'function' ? matchMedia('(min-width: 720px)').matches : true;

  protected readonly formOpen = signal(false);
  /** The strategy whose activity is open. */
  protected readonly expanded = signal<number | null>(null);
  /** The strategy a change is in flight for, so its buttons wait for the answer. */
  protected readonly busy = signal<number | null>(null);

  protected readonly rows = this.store.strategies;
  protected readonly watching = computed(() => this.rows().filter((s) => s.status === StrategyStatus.Active).length);

  constructor() {
    const timer = setInterval(() => {
      if (this.busy() === null && !this.store.data.isLoading()) {
        this.store.reload();
      }
    }, REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected onCreated(strategy: Strategy): void {
    this.formOpen.set(false);
    this.expanded.set(strategy.strategyId);
  }

  protected toggleActivity(strategy: Strategy): void {
    this.expanded.update((open) => (open === strategy.strategyId ? null : strategy.strategyId));
  }

  /** Switching off lands at once: nothing waits for a cycle. */
  protected async switchOff(strategy: Strategy): Promise<void> {
    await this.change(strategy, () => this.store.setEnabled(strategy.strategyId, false), (s) =>
      s.status === StrategyStatus.Disabled
        ? `Strategy #${s.strategyId} is switched off. It will not place any order.`
        : `Strategy #${s.strategyId} was already ${statusLook(s.status).label.toLowerCase()}.`,
    );
  }

  protected async switchOn(strategy: Strategy): Promise<void> {
    await this.change(strategy, () => this.store.setEnabled(strategy.strategyId, true), (s) =>
      `Strategy #${s.strategyId} is watching ${s.symbol} again. It waits for the price to move through your level.`,
    );
  }

  protected async cancel(strategy: Strategy): Promise<void> {
    const confirmed = await this.dialog.confirm({
      type: 'warning',
      title: 'Cancel this strategy?',
      message: `Strategy #${strategy.strategyId} will stop watching ${strategy.symbol} for good. An order that has already been placed is not affected. This cannot be undone.`,
      confirmText: 'Cancel strategy',
      cancelText: 'Keep it',
    });
    if (!confirmed) {
      return;
    }
    await this.change(strategy, () => this.store.cancel(strategy.strategyId), (s) => `Strategy #${s.strategyId} is cancelled.`);
  }

  private async change(
    strategy: Strategy,
    action: () => Promise<Strategy>,
    message: (updated: Strategy) => string,
  ): Promise<void> {
    this.busy.set(strategy.strategyId);
    try {
      this.notifications.success(message(await action()));
    } catch (error) {
      this.notifications.error(describeError(error));
      // Whatever was refused, the list may be out of date: look again.
      this.store.reload();
    } finally {
      this.busy.set(null);
    }
  }
}
