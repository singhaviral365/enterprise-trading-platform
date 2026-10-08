import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideApiClients } from '../api/api.config';
import { AccountOverviewStore } from './account-overview.store';
import {
  CHAT_HISTORY_SENT,
  CHAT_MAX_INSTRUMENTS,
  CHAT_MAX_MESSAGES,
  ChatSessionStore,
  MAX_QUESTION,
} from './chat-session.store';
import { SessionService } from './session.service';
import { TEST_TOKENS } from '../testing/trade-http';

const CHAT_URL = '/api/v1/signals/chat';

function answer(text = 'Because.', source = 'GEMINI') {
  return { response: text, source, signal: {}, timestamp: '2026-10-07T10:00:00Z' };
}

describe('ChatSessionStore', () => {
  let store: ChatSessionStore;
  let http: HttpTestingController;
  let linked: ReturnType<typeof signal<object | null>>;

  beforeEach(() => {
    linked = signal<object | null>({ overview: { account: { id: 1001 } } });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        { provide: AccountOverviewStore, useValue: { linked } },
      ],
    });
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ChatSessionStore);
  });

  afterEach(() => http.verify());

  async function reply(text = 'Because.'): Promise<void> {
    (await vi.waitFor(() => http.expectOne(CHAT_URL))).flush(answer(text));
  }

  /** Asks and answers one question, waiting for the whole turn. */
  async function turn(symbol: string, question: string, response = 'Because.'): Promise<void> {
    const asking = store.ask(symbol, question);
    await reply(response);
    await asking;
  }

  it('starts empty', () => {
    expect(store.messages('AAPL')).toEqual([]);
    expect(store.sending()).toBe(false);
  });

  it('sends the question with the account, the symbol and no history at first, then keeps the answer', async () => {
    const asking = store.ask('AAPL', '  Why this signal? ');
    const request = await vi.waitFor(() => http.expectOne(CHAT_URL));

    expect(request.request.body).toEqual({
      accountId: 1001,
      symbol: 'AAPL',
      message: 'Why this signal?',
      conversationHistory: [],
    });
    expect(store.sending()).toBe(true);
    expect(store.sendingSymbol()).toBe('AAPL');
    request.flush(answer('Because the averages agree.'));
    await asking;

    expect(store.sending()).toBe(false);
    expect(store.sendingSymbol()).toBeNull();
    expect(store.messages('AAPL').map((m) => [m.role, m.text])).toEqual([
      ['user', 'Why this signal?'],
      ['assistant', 'Because the averages agree.'],
    ]);
    expect(store.messages('AAPL')[1].source).toBe('GEMINI');
  });

  it('sends the earlier turns with the next question, without problem messages and at most the last ten', async () => {
    for (let i = 1; i <= 7; i++) {
      await turn('AAPL', `question ${i}`, `answer ${i}`);
    }
    const asking = store.ask('AAPL', 'one more');
    const request = await vi.waitFor(() => http.expectOne(CHAT_URL));

    const history = request.request.body.conversationHistory as { role: string; content: string }[];
    expect(history).toHaveLength(CHAT_HISTORY_SENT);
    expect(history[0]).toEqual({ role: 'user', content: 'question 3' });
    expect(history[CHAT_HISTORY_SENT - 1]).toEqual({ role: 'assistant', content: 'answer 7' });
    request.flush(answer());
    await asking;
  });

  it('shows a failure as a problem message in words, leaves it out of the history and lets the next question through', async () => {
    const asking = store.ask('AAPL', 'first');
    (await vi.waitFor(() => http.expectOne(CHAT_URL))).flush(
      { errorCode: 'AST-429', message: 'dev text' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await asking;

    const problem = store.messages('AAPL')[1];
    expect(problem.role).toBe('problem');
    expect(problem.text).toContain('The assistant is busy right now');
    expect(problem.text).not.toContain('dev text');
    expect(store.sending()).toBe(false);

    const next = store.ask('AAPL', 'second');
    const request = await vi.waitFor(() => http.expectOne(CHAT_URL));
    expect(request.request.body.conversationHistory).toEqual([{ role: 'user', content: 'first' }]);
    request.flush(answer());
    await next;
  });

  it('does not start a second question while one is in flight, for any instrument', async () => {
    const first = store.ask('AAPL', 'first');
    const request = await vi.waitFor(() => http.expectOne(CHAT_URL));

    await store.ask('MSFT', 'second');
    http.expectNone(CHAT_URL);
    expect(store.messages('MSFT')).toEqual([]);

    request.flush(answer());
    await first;
  });

  it('sends nothing for an empty question or without a linked account', async () => {
    await store.ask('AAPL', '   ');
    linked.set(null);
    await store.ask('AAPL', 'hello');

    http.expectNone(CHAT_URL);
    expect(store.messages('AAPL')).toEqual([]);
  });

  it('cuts a very long question to the limit', async () => {
    const asking = store.ask('AAPL', 'x'.repeat(MAX_QUESTION + 50));
    const request = await vi.waitFor(() => http.expectOne(CHAT_URL));

    expect((request.request.body.message as string).length).toBe(MAX_QUESTION);
    request.flush(answer());
    await asking;
  });

  it('keeps a separate conversation for each instrument', async () => {
    await turn('AAPL', 'about apple', 'apple answer');
    await turn('MSFT', 'about microsoft', 'microsoft answer');

    expect(store.messages('AAPL').map((m) => m.text)).toEqual(['about apple', 'apple answer']);
    expect(store.messages('MSFT').map((m) => m.text)).toEqual(['about microsoft', 'microsoft answer']);
    expect(store.messages('TSLA')).toEqual([]);
  });

  it('keeps only the most recent instruments and the most recent messages of each', async () => {
    const symbols = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
    for (const symbol of symbols) {
      await turn(symbol, `about ${symbol}`);
    }
    expect(CHAT_MAX_INSTRUMENTS).toBe(5);
    expect(store.messages('A1')).toEqual([]);
    expect(store.messages('A6')).toHaveLength(2);

    // Using A2 again makes it the most recent, so A3 is the next to go.
    await turn('A2', 'again');
    await turn('A7', 'newcomer');
    expect(store.messages('A3')).toEqual([]);
    expect(store.messages('A2').length).toBeGreaterThan(2);

    for (let i = 0; i < CHAT_MAX_MESSAGES; i++) {
      await turn('A7', `q${i}`);
    }
    expect(store.messages('A7')).toHaveLength(CHAT_MAX_MESSAGES);
    expect(store.messages('A7').at(-1)?.role).toBe('assistant');
  });

  it('forgets every conversation when the user signs out', async () => {
    await turn('AAPL', 'hello');
    expect(store.messages('AAPL')).toHaveLength(2);

    TestBed.inject(SessionService).clear();
    TestBed.tick();

    expect(store.messages('AAPL')).toEqual([]);
  });

  it('never writes a conversation to browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await turn('AAPL', 'private question');

    expect(setItem.mock.calls.some(([, value]) => String(value).includes('private question'))).toBe(false);
    setItem.mockRestore();
  });
});
