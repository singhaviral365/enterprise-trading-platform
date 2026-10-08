import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormField, form, maxLength, required, submit } from '@angular/forms/signals';

import { ExplanationSource } from '../../../api/generated/signals';
import { ChatSessionStore, MAX_QUESTION } from '../../../core/chat-session.store';
import { NotificationService } from '../../../core/notification.service';
import { PreferencesStore } from '../../../core/preferences.store';
import { Spinner } from '../../../shared/ui/spinner/spinner';

/** What the customer can tap instead of typing. Each is an ordinary question about the signal on screen. */
const QUICK_QUESTIONS: readonly string[] = [
  'Why this signal?',
  'What does the RSI tell me?',
  'How strong is it?',
  'What would change it?',
];

let nextChatId = 0;

/**
 * A short chat about one instrument's trade signal, for a customer who switched the AI assistant on in Settings: four
 * suggested questions, the conversation, and a box to type in. It renders nothing, and sends nothing to the model, while the
 * assistant is off.
 *
 * `layout` says where it lives: `pane` is a tall panel (in the split view's aside) whose conversation fills the height and
 * whose input stays at the bottom; `inline` is the compact card inside the quote detail, used when there is no room for the
 * pane. The conversation itself is held by {@link ChatSessionStore}, so it survives moving between the two, opening Buy / Sell
 * and coming back, and picking the same instrument again. It does not need the signal to have loaded.
 */
@Component({
  selector: 'app-assistant-chat',
  imports: [FormField, Spinner],
  templateUrl: './assistant-chat.html',
  styleUrl: './assistant-chat.css',
  host: { '[class.is-pane]': "layout() === 'pane'" },
})
export class AssistantChat {
  private readonly chats = inject(ChatSessionStore);
  private readonly preferences = inject(PreferencesStore);
  private readonly notifications = inject(NotificationService);

  /** The instrument. */
  readonly symbol = input.required<string>();
  readonly layout = input<'pane' | 'inline'>('inline');

  protected readonly ExplanationSource = ExplanationSource;
  protected readonly quickQuestions = QUICK_QUESTIONS;
  protected readonly assistantOn = this.preferences.aiAssistantEnabled;
  protected readonly titleId = `assistant-chat-title-${nextChatId}`;
  protected readonly questionId = `assistant-chat-question-${nextChatId++}`;

  protected readonly messages = computed(() => this.chats.messages(this.symbol()));
  /** A question is in flight, for any instrument: only one at a time. */
  protected readonly sending = this.chats.sending;
  /** The answer being waited for belongs to this instrument. */
  protected readonly thinking = computed(() => this.chats.sending() && this.chats.sendingSymbol() === this.symbol());

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
      this.thinking();
      queueMicrotask(() => {
        const element = this.log()?.nativeElement;
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      });
    });
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.chatForm, async () => {
      const text = this.question().text;
      this.chatForm.text().value.set('');
      await this.ask(text);
    });
  }

  protected ask(text: string): Promise<void> {
    return this.chats.ask(this.symbol(), text);
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
