import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideApiClients } from '../../../api/api.config';
import { AccountOverviewStore } from '../../../core/account-overview.store';
import { NotificationService } from '../../../core/notification.service';
import { PreferencesStore } from '../../../core/preferences.store';
import { SignalCard } from './signal-card';

const SIGNAL_URL = '/api/v1/accounts/1001/signals/AAPL?format=narrative';

function signalBody(extra: Record<string, unknown> = {}) {
  return {
    symbol: 'AAPL',
    direction: 'BUY',
    strength: 72,
    smaStatus: 'BULLISH',
    sma20: 150.25,
    sma50: 142.1,
    price: 155,
    rsiValue: 61.4,
    asOf: '2026-10-06',
    sessions: 62,
    timestamp: '2026-10-07T10:00:00Z',
    cacheAge: 120,
    stale: false,
    explanation: 'The averages point up.',
    explanationSource: 'GEMINI',
    methodology: 'Signals come from a 20-day and a 50-day simple moving average and a 14-day RSI.',
    disclaimer: 'For information only. This is not investment advice.',
    ...extra,
  };
}

describe('SignalCard', () => {
  let fixture: ComponentFixture<SignalCard>;
  let http: HttpTestingController;
  let root: HTMLElement;
  let assistant: ReturnType<typeof signal<boolean>>;
  let notifications: { info: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const text = (id: string) => byTestId(id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function create(options: { assistantOn?: boolean; body?: object; error?: { status: number; body: object } } = {}) {
    assistant = signal(options.assistantOn ?? false);
    notifications = { info: vi.fn(), warning: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [SignalCard],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients(),
        provideRouter([]),
        { provide: AccountOverviewStore, useValue: { linked: signal({ overview: { account: { id: 1001 } } }) } },
        { provide: PreferencesStore, useValue: { aiAssistantEnabled: assistant } },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SignalCard);
    fixture.componentRef.setInput('symbol', 'AAPL');
    root = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();

    const request = await vi.waitFor(() => http.expectOne(SIGNAL_URL));
    if (options.error) {
      request.flush(options.error.body, { status: options.error.status, statusText: 'Error' });
    } else {
      request.flush(options.body ?? signalBody());
    }
    await settle();
  }

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('shows the direction in words, the strength out of a hundred and the numbers it is built from', async () => {
    await create();

    expect(text('signal-badge')).toBe('BUY');
    expect(text('signal-strength')).toBe('72 / 100');
    const meter = root.querySelector('[role="meter"]')!;
    expect(meter.getAttribute('aria-valuenow')).toBe('72');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-labelledby')).toBe('strength-label');
    const facts = text('signal-facts');
    expect(facts).toContain('150.25');
    expect(facts).toContain('142.10');
    expect(facts).toContain('61.4');
    expect(facts).toContain('middle range');
    expect(facts).toContain('155.00');
  });

  it('always shows the disclaimer and how the signal is worked out', async () => {
    await create();

    expect(text('signal-disclaimer')).toContain('not investment advice');
    expect(root.querySelector('details.method')!.textContent).toContain('20-day and a 50-day');
  });

  it('asks for the narrative whether or not the assistant is on, and says where the words came from', async () => {
    await create({ assistantOn: true });
    expect(text('signal-explanation')).toContain('The averages point up.');
    expect(text('signal-explanation')).toContain('Written by the AI assistant');
  });

  it('labels the platforms own explanation as the standard one', async () => {
    await create({ body: signalBody({ explanationSource: 'FALLBACK', explanation: 'The 20-day average is above the 50-day.' }) });

    expect(text('signal-explanation')).toContain('Standard explanation');
  });

  it('calls a HOLD a balance of the indicators, not a strength', async () => {
    await create({ body: signalBody({ direction: 'HOLD', strength: 100 }) });

    expect(text('signal-badge')).toBe('HOLD');
    expect(root.querySelector('.strength-label')!.textContent).toContain('Balance of the indicators');
  });

  it('shows a SELL with its own badge', async () => {
    await create({ body: signalBody({ direction: 'SELL', strength: 40 }) });

    expect(text('signal-badge')).toBe('SELL');
    expect(root.querySelector('.badge')!.classList.contains('is-sell')).toBe(true);
  });

  it('warns when the price history could not be refreshed', async () => {
    await create({ body: signalBody({ stale: true }) });

    expect(root.textContent).toContain('could not be refreshed');
  });

  it('copies the explanation to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await create();

    byTestId<HTMLButtonElement>('signal-copy')!.click();
    await settle();

    expect(writeText).toHaveBeenCalledWith('The averages point up.');
    expect(notifications.info).toHaveBeenCalled();
  });

  it('says so when copying is not allowed', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    await create();

    byTestId<HTMLButtonElement>('signal-copy')!.click();
    await settle();

    expect(notifications.warning).toHaveBeenCalled();
  });

  describe('when the assistant is off', () => {
    it('offers no chat and sends nothing to the model, but points to Settings', async () => {
      await create({ assistantOn: false });

      expect(byTestId('signal-question')).toBeNull();
      expect(text('signal-assistant-off')).toContain('nothing about your account is sent to it');
      expect(root.querySelector('a[href="/settings"]')).toBeTruthy();
    });
  });

  describe('when the assistant is on', () => {
    it('has no Settings hint and no chat of its own: the chat is a separate component', async () => {
      await create({ assistantOn: true });

      expect(byTestId('signal-assistant-off')).toBeNull();
      expect(byTestId('signal-question')).toBeNull();
      expect(root.querySelector('.quick')).toBeNull();
    });
  });

  describe('when there is no signal', () => {
    it('says an instrument with too little history has none yet, without offering a pointless retry', async () => {
      await create({ error: { status: 422, body: { errorCode: 'SIG-422', message: 'dev text' } } });

      expect(byTestId('signal-no-history')).toBeTruthy();
      expect(byTestId('signal-error')).toBeNull();
    });

    it('shows any other failure as a sentence with a way to try again', async () => {
      await create({ error: { status: 503, body: { errorCode: 'SIG-503', message: 'dev text' } } });

      expect(text('signal-error')).toContain('could not get the price history');
      expect(text('signal-error')).not.toContain('dev text');
      byTestId<HTMLElement>('signal-error')!.querySelector('button')!.click();
      (await vi.waitFor(() => http.expectOne(SIGNAL_URL))).flush(signalBody());
      await settle();
      expect(text('signal-badge')).toBe('BUY');
    });
  });
});
