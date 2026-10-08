import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  SignalDirection,
  SmaStatus,
  TradeSignal,
  TradeSignalExplanationSourceEnum,
} from '../../../api/generated/signals';
import { SignalsApi } from '../../../api/signals-api.service';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { describeError, errorCodeOf } from '../../../core/errors/describe-error';
import { NotificationService } from '../../../core/notification.service';
import { PreferencesStore } from '../../../core/preferences.store';
import { PreferenceDatePipe, PreferenceDecimalPipe } from '../../../shared/formatting/preference-pipes';
import { Spinner } from '../../../shared/ui/spinner/spinner';

/**
 * The trade signal for one instrument, in the quote screen: a BUY, SELL or HOLD reading with its strength and the numbers it
 * comes from, an explanation in words, how it is worked out and the disclaimer. It is information about a chart, not advice,
 * and says so beside every signal. The chat about it is a separate component, `AssistantChat`.
 *
 * It reads from the Trade API's signals module and calls nothing else. For a customer who has not switched the assistant on,
 * the same card shows the platform's own explanation, a pointer to Settings, and nothing about them goes to the language model.
 */
@Component({
  selector: 'app-signal-card',
  imports: [PreferenceDatePipe, PreferenceDecimalPipe, RouterLink, Spinner],
  templateUrl: './signal-card.html',
  styleUrl: './signal-card.css',
})
export class SignalCard {
  private readonly api = inject(SignalsApi);
  private readonly accounts = inject(AccountOverviewStore);
  private readonly preferences = inject(PreferencesStore);
  private readonly notifications = inject(NotificationService);

  /** The instrument. The parent passes a computed, so this does not change on every price tick. */
  readonly symbol = input.required<string>();

  /** Exposed so the template compares against the generated enums, never string literals. */
  protected readonly SignalDirection = SignalDirection;
  protected readonly SmaStatus = SmaStatus;
  protected readonly SignalExplanationSource = TradeSignalExplanationSourceEnum;

  private readonly accountId = computed(() => this.accounts.linked()?.overview.account.id ?? null);
  /** Whether the customer switched the assistant on in Settings. */
  protected readonly assistantOn = this.preferences.aiAssistantEnabled;

  /** The signal with its explanation. Reloads for another instrument or when the assistant is switched on or off. */
  protected readonly lookup = resource({
    params: () => {
      const accountId = this.accountId();
      return accountId === null ? undefined : { accountId, symbol: this.symbol(), assistant: this.assistantOn() };
    },
    loader: ({ params }) => firstValueFrom(this.api.signal(params.accountId, params.symbol, true)),
  });

  protected readonly data = computed<TradeSignal | null>(() => (this.lookup.hasValue() ? this.lookup.value() : null));
  protected readonly errorMessage = computed(() => {
    const error = this.lookup.error();
    return error ? describeError(error) : '';
  });
  /** A symbol with too little history is not an error to retry; it just has no signal yet. */
  protected readonly noHistory = computed(() => errorCodeOf(this.lookup.error()) === 'SIG-422');

  protected readonly strengthLabel = computed(() => {
    const signal = this.data();
    if (!signal) {
      return '';
    }
    return signal.direction === SignalDirection.Hold ? 'Balance of the indicators' : 'Signal strength';
  });

  protected readonly rsiZone = computed(() => {
    const rsi = this.data()?.rsiValue;
    if (rsi === undefined) {
      return '';
    }
    return rsi >= 70 ? 'overbought range' : rsi <= 30 ? 'oversold range' : 'middle range';
  });

  protected reload(): void {
    this.lookup.reload();
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.notifications.info('Copied to the clipboard.');
    } catch {
      this.notifications.warning('Copying is not available here. Select the text and copy it instead.');
    }
  }
}
