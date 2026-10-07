import { Component, ElementRef, computed, effect, inject, input, linkedSignal, resource, signal, viewChild } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  ChatTurn,
  ChatTurnRoleEnum,
  ExplanationSource,
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

interface ChatMessage {
  readonly id: number;
  readonly role: 'user' | 'assistant' | 'problem';
  readonly text: string;
  readonly source?: ExplanationSource;
}

/** What the customer can tap instead of typing. Each is an ordinary question about the signal on screen. */
const QUICK_QUESTIONS: readonly string[] = [
  'Why this signal?',
  'What does the RSI tell me?',
  'How strong is it?',
  'What would change it?',
];

/** The server keeps no conversation, so the last ten turns are sent with each question. */
const HISTORY_SENT = 10;
const MAX_QUESTION = 500;

/**
 * The trade signal for one instrument, in the quote screen: a BUY, SELL or HOLD reading with its strength and the numbers it
 * comes from, an explanation in words, and, for a customer who switched the AI assistant on in Settings, a short chat about
 * it. It is information about a chart, not advice, and says so beside every signal.
 *
 * It reads from the Trade API's signals module and calls nothing else. For a customer who has not switched the assistant on,
 * the same screen shows the platform's own explanation and nothing about them goes to the language model.
 */
@Component({
  selector: 'app-signal-advisor',
  imports: [FormField, PreferenceDatePipe, PreferenceDecimalPipe, RouterLink, Spinner],
  templateUrl: './signal-advisor.html',
  styleUrl: './signal-advisor.css',
})
export class SignalAdvisor {
  private readonly api = inject(SignalsApi);
  private readonly accounts = inject(AccountOverviewStore);
  private readonly preferences = inject(PreferencesStore);
  private readonly notifications = inject(NotificationService);

  /** The instrument. The parent passes a computed, so this does not change on every price tick. */
  readonly symbol = input.required<string>();

  /** Exposed so the template compares against the generated enums, never string literals. */
  protected readonly SignalDirection = SignalDirection;
  protected readonly SmaStatus = SmaStatus;
  protected readonly ExplanationSource = ExplanationSource;
  protected readonly SignalExplanationSource = TradeSignalExplanationSourceEnum;
  protected readonly quickQuestions = QUICK_QUESTIONS;
  protected readonly maxQuestion = MAX_QUESTION;

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

  /** The conversation for this instrument; a different one starts empty. */
  protected readonly messages = linkedSignal<string, readonly ChatMessage[]>({
    source: () => this.symbol(),
    computation: () => [],
  });
  protected readonly sending = signal(false);
  private nextId = 0;

  private readonly question = signal({ text: '' });
  protected readonly chatForm = form(this.question, (path) => {
    required(path.text, { message: 'Type a question.' });
    maxLength(path.text, MAX_QUESTION, { message: `Questions can be at most ${MAX_QUESTION} characters.` });
  });

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  constructor() {
    // Keeps the newest message in view.
    effect(() => {
      this.messages();
      queueMicrotask(() => {
        const element = this.log()?.nativeElement;
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      });
    });
  }

  protected reload(): void {
    this.lookup.reload();
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.chatForm, async () => {
      const text = this.question().text;
      this.chatForm.text().value.set('');
      await this.ask(text);
    });
  }

  protected async ask(text: string): Promise<void> {
    const message = text.trim().slice(0, MAX_QUESTION);
    const accountId = this.accountId();
    if (!message || accountId === null || this.sending()) {
      return;
    }

    const history: ChatTurn[] = this.messages()
      .filter((m) => m.role !== 'problem')
      .slice(-HISTORY_SENT)
      .map((m) => ({
        role: m.role === 'user' ? ChatTurnRoleEnum.User : ChatTurnRoleEnum.Assistant,
        content: m.text,
      }));

    this.push({ id: this.nextId++, role: 'user', text: message });
    this.sending.set(true);
    try {
      const answer = await firstValueFrom(
        this.api.chat({ accountId, symbol: this.symbol(), message, conversationHistory: history }),
      );
      this.push({ id: this.nextId++, role: 'assistant', text: answer.response, source: answer.source });
    } catch (error) {
      this.push({ id: this.nextId++, role: 'problem', text: describeError(error) });
    } finally {
      this.sending.set(false);
    }
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.notifications.info('Copied to the clipboard.');
    } catch {
      this.notifications.warning('Copying is not available here. Select the text and copy it instead.');
    }
  }

  private push(message: ChatMessage): void {
    this.messages.update((list) => [...list, message]);
  }
}
