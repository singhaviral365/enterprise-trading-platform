import { Service, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ChatTurn, ChatTurnRoleEnum, ExplanationSource } from '../api/generated/signals';
import { SignalsApi } from '../api/signals-api.service';
import { AccountOverviewStore } from './account-overview.store';
import { describeError } from './errors/describe-error';
import { SessionService } from './session.service';

export interface ChatMessage {
  readonly id: number;
  readonly role: 'user' | 'assistant' | 'problem';
  readonly text: string;
  readonly source?: ExplanationSource;
}

/** The server keeps no conversation, so the last ten turns are sent with each question. */
export const CHAT_HISTORY_SENT = 10;
export const MAX_QUESTION = 500;
/** How many instruments keep a conversation, and how many messages each keeps. Older ones are dropped. */
export const CHAT_MAX_INSTRUMENTS = 5;
export const CHAT_MAX_MESSAGES = 50;

/**
 * The assistant conversations of this browser session, one per instrument, held in memory only: the chat pane and the inline
 * chat both read them, so moving the chat between places (the side pane, inside the quote, Buy / Sell and back) loses nothing.
 * Never written to browser storage; cleared when the user signs out.
 *
 * `ask` is the whole of a turn: it adds the question, sends it with the last ten turns (the server keeps none), and adds the
 * answer or a problem message. Only one question is in flight at a time, across every instrument.
 */
@Service()
export class ChatSessionStore {
  private readonly api = inject(SignalsApi);
  private readonly accounts = inject(AccountOverviewStore);
  private readonly session = inject(SessionService);

  private readonly conversations = signal<ReadonlyMap<string, readonly ChatMessage[]>>(new Map());
  private nextId = 0;

  /** Whether a question is waiting for its answer. */
  readonly sending = signal(false);
  /** The symbol the in-flight question is about, or null. */
  readonly sendingSymbol = signal<string | null>(null);

  private readonly accountId = computed(() => this.accounts.linked()?.overview.account.id ?? null);

  constructor() {
    // Signing out ends every conversation.
    effect(() => {
      if (!this.session.isLoggedIn()) {
        untracked(() => this.clear());
      }
    });
  }

  /** The conversation for one instrument; empty if there is none. */
  messages(symbol: string): readonly ChatMessage[] {
    return this.conversations().get(symbol) ?? [];
  }

  async ask(symbol: string, text: string): Promise<void> {
    const message = text.trim().slice(0, MAX_QUESTION);
    const accountId = this.accountId();
    if (!message || accountId === null || this.sending()) {
      return;
    }

    const history: ChatTurn[] = this.messages(symbol)
      .filter((m) => m.role !== 'problem')
      .slice(-CHAT_HISTORY_SENT)
      .map((m) => ({
        role: m.role === 'user' ? ChatTurnRoleEnum.User : ChatTurnRoleEnum.Assistant,
        content: m.text,
      }));

    this.push(symbol, { id: this.nextId++, role: 'user', text: message });
    this.sending.set(true);
    this.sendingSymbol.set(symbol);
    try {
      const answer = await firstValueFrom(this.api.chat({ accountId, symbol, message, conversationHistory: history }));
      this.push(symbol, { id: this.nextId++, role: 'assistant', text: answer.response, source: answer.source });
    } catch (error) {
      this.push(symbol, { id: this.nextId++, role: 'problem', text: describeError(error) });
    } finally {
      this.sending.set(false);
      this.sendingSymbol.set(null);
    }
  }

  clear(): void {
    this.conversations.set(new Map());
  }

  private push(symbol: string, message: ChatMessage): void {
    this.conversations.update((all) => {
      const next = new Map(all);
      const kept = [...(next.get(symbol) ?? []), message].slice(-CHAT_MAX_MESSAGES);
      // Re-inserting moves the instrument to the end, so the map's order is "least recently used first".
      next.delete(symbol);
      next.set(symbol, kept);
      while (next.size > CHAT_MAX_INSTRUMENTS) {
        next.delete(next.keys().next().value as string);
      }
      return next;
    });
  }
}
