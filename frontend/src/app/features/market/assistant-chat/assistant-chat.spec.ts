import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { provideApiClients } from '../../../api/api.config';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { NotificationService } from '../../../core/notification.service';
import { PreferencesStore } from '../../../core/preferences.store';
import { AssistantChat } from './assistant-chat';

const CHAT_URL = '/api/v1/signals/chat';

function answer(text: string, source = 'GEMINI') {
  return { response: text, source, signal: {}, timestamp: '2026-10-07T10:00:00Z' };
}

describe('AssistantChat', () => {
  let fixture: ComponentFixture<AssistantChat>;
  let http: HttpTestingController;
  let root: HTMLElement;
  let assistant: ReturnType<typeof signal<boolean>>;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string) => byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function create(options: { assistantOn?: boolean; layout?: 'pane' | 'inline' } = {}) {
    assistant = signal(options.assistantOn ?? true);
    await TestBed.configureTestingModule({
      imports: [AssistantChat],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        { provide: AccountOverviewStore, useValue: { linked: signal({ overview: { account: { id: 1001 } } }) } },
        { provide: PreferencesStore, useValue: { aiAssistantEnabled: assistant } },
        { provide: NotificationService, useValue: { info: vi.fn(), warning: vi.fn() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AssistantChat);
    fixture.componentRef.setInput('symbol', 'AAPL');
    fixture.componentRef.setInput('layout', options.layout ?? 'inline');
    root = fixture.nativeElement as HTMLElement;
    await settle();
  }

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('renders nothing and sends nothing while the assistant is off', async () => {
    await create({ assistantOn: false });

    expect(byTestId('assistant-chat')).toBeNull();
    expect(byTestId('signal-question')).toBeNull();
  });

  it('is usable on its own: it never asks for the signal, so an instrument with no signal can still be asked about', async () => {
    await create();

    // http.verify() in afterEach fails if a signal request had been made.
    expect(byTestId('assistant-chat')).toBeTruthy();
    expect(byTestId('signal-question')).toBeTruthy();
    expect(text('assistant-chat-symbol')).toBe('AAPL');
  });

  it('offers suggested questions and a box to type one', async () => {
    await create();

    const quick = [...root.querySelectorAll('.quick button')].map((b) => b.textContent?.trim());
    expect(quick).toEqual(['Why this signal?', 'What does the RSI tell me?', 'How strong is it?', 'What would change it?']);
  });

  it('sends a suggested question and shows the answer with where it came from', async () => {
    await create();

    root.querySelector<HTMLButtonElement>('.quick button')!.click();
    const request = await vi.waitFor(() => http.expectOne(CHAT_URL));
    expect(request.request.body).toEqual({
      accountId: 1001,
      symbol: 'AAPL',
      message: 'Why this signal?',
      conversationHistory: [],
    });
    request.flush(answer('Because the averages agree.'));
    await settle();

    const log = text('signal-chat-log');
    expect(log).toContain('Why this signal?');
    expect(log).toContain('Because the averages agree.');
    expect(log).toContain('AI assistant');
  });

  it('sends what was typed, clears the box, and sends the conversation as history with the next question', async () => {
    await create();
    const input = byTestId<HTMLInputElement>('signal-question')!;

    input.value = 'And the RSI?';
    input.dispatchEvent(new Event('input'));
    await settle();
    byTestId<HTMLButtonElement>('signal-send')!.click();
    (await vi.waitFor(() => http.expectOne(CHAT_URL))).flush(answer('It is in the middle range.', 'FALLBACK'));
    await settle();
    expect(input.value).toBe('');
    expect(text('signal-chat-log')).toContain('Standard answer');

    input.value = 'Thanks, and what could change it?';
    input.dispatchEvent(new Event('input'));
    await settle();
    byTestId<HTMLButtonElement>('signal-send')!.click();
    const second = await vi.waitFor(() => http.expectOne(CHAT_URL));
    expect(second.request.body.conversationHistory).toEqual([
      { role: 'user', content: 'And the RSI?' },
      { role: 'assistant', content: 'It is in the middle range.' },
    ]);
    second.flush(answer('A new close.'));
    await settle();
  });

  it('will not send an empty question', async () => {
    await create();

    expect(byTestId<HTMLButtonElement>('signal-send')!.disabled).toBe(true);
    http.expectNone(CHAT_URL);
  });

  it('shows a refusal as a sentence in the conversation, never the servers own words', async () => {
    await create();

    root.querySelector<HTMLButtonElement>('.quick button')!.click();
    (await vi.waitFor(() => http.expectOne(CHAT_URL))).flush(
      { errorCode: 'AST-429', message: 'dev text' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await settle();

    const log = text('signal-chat-log');
    expect(log).toContain('The assistant is busy right now');
    expect(log).not.toContain('dev text');
  });

  it('does not send a second question while one is being answered', async () => {
    await create();

    root.querySelectorAll<HTMLButtonElement>('.quick button')[0].click();
    const request = await vi.waitFor(() => http.expectOne(CHAT_URL));
    fixture.detectChanges();

    expect([...root.querySelectorAll<HTMLButtonElement>('.quick button')].every((b) => b.disabled)).toBe(true);
    expect(byTestId<HTMLButtonElement>('signal-send')!.disabled).toBe(true);
    request.flush(answer('ok'));
    await settle();
  });

  it('starts a fresh conversation for another instrument, and each instrument keeps its own', async () => {
    await create();
    root.querySelector<HTMLButtonElement>('.quick button')!.click();
    (await vi.waitFor(() => http.expectOne(CHAT_URL))).flush(answer('About apple.'));
    await settle();
    expect(byTestId('signal-chat-log')).toBeTruthy();

    fixture.componentRef.setInput('symbol', 'MSFT');
    await settle();
    expect(byTestId('signal-chat-log')).toBeNull();

    fixture.componentRef.setInput('symbol', 'AAPL');
    await settle();
    expect(text('signal-chat-log')).toContain('About apple.');
  });

  it('keeps the conversation when the component is recreated, for example when the chat moves from the pane to the quote', async () => {
    await create({ layout: 'pane' });
    root.querySelector<HTMLButtonElement>('.quick button')!.click();
    (await vi.waitFor(() => http.expectOne(CHAT_URL))).flush(answer('Kept.'));
    await settle();
    fixture.destroy();

    fixture = TestBed.createComponent(AssistantChat);
    fixture.componentRef.setInput('symbol', 'AAPL');
    fixture.componentRef.setInput('layout', 'inline');
    root = fixture.nativeElement as HTMLElement;
    await settle();

    expect(text('signal-chat-log')).toContain('Kept.');
  });

  describe('layouts', () => {
    it('pane: always shows the conversation area with a hint, and fills its container', async () => {
      await create({ layout: 'pane' });

      expect(root.classList.contains('is-pane')).toBe(true);
      expect(root.querySelector('.chat')!.classList.contains('is-pane')).toBe(true);
      expect(byTestId('signal-chat-log')).toBeTruthy();
      expect(text('signal-chat-log')).toContain('Ask about this signal');
    });

    it('inline: shows the conversation area only once there is a conversation', async () => {
      await create({ layout: 'inline' });

      expect(root.classList.contains('is-pane')).toBe(false);
      expect(byTestId('signal-chat-log')).toBeNull();
    });
  });
});
