import { Component, computed, inject, input, resource } from '@angular/core';

import { Strategy } from '../../../api/generated/strategies';
import { describeError } from '../../../core/errors/describe-error';
import { StrategiesStore } from '../../../core/strategies.store';
import { PreferenceDatePipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';
import { Spinner } from '../../../shared/ui/spinner/spinner';
import { outcomeLook } from '../strategy-look';

/**
 * What one strategy did and why, newest first: every time its trigger was met, the price that triggered it, and what came
 * of it (an order, or the limit or switch-off that held it back). This is what answers "why did it, or did it not, trade?"
 * and what a switch-off made while a strategy was running is shown on.
 */
@Component({
  selector: 'app-strategy-activity',
  imports: [PreferenceDatePipe, PreferenceDecimalPipe, Spinner],
  templateUrl: './strategy-activity.html',
  styleUrl: './strategy-activity.css',
})
export class StrategyActivity {
  private readonly store = inject(StrategiesStore);

  readonly strategy = input.required<Strategy>();

  protected readonly outcomeLook = outcomeLook;

  /** Reloaded when the strategy moves (its `updatedAt` changes), so a new run appears without reopening the panel. */
  protected readonly runs = resource({
    params: () => ({ id: this.strategy().strategyId, revision: this.strategy().updatedAt }),
    loader: ({ params }) => this.store.runs(params.id),
  });

  protected readonly rows = computed(() => (this.runs.hasValue() ? this.runs.value() : []));
  protected readonly errorMessage = computed(() => {
    const error = this.runs.error();
    return error ? describeError(error) : '';
  });
}
