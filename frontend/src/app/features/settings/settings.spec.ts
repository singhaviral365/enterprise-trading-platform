import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountOverviewStore } from '../../core/account-overview.store';
import { NotificationService } from '../../core/notification.service';
import {
  DateFormat,
  NotificationChannel,
  NumberFormat,
  Theme,
  TimeFormat,
  defaultPreferences,
} from '../../core/preferences';
import { PreferencesStore } from '../../core/preferences.store';
import { Settings } from './settings';

describe('Settings', () => {
  let fixture: ComponentFixture<Settings>;
  let root: HTMLElement;
  let current: ReturnType<typeof signal<ReturnType<typeof defaultPreferences>>>;
  let accountId: ReturnType<typeof signal<number | null>>;
  let state: ReturnType<typeof signal<string>>;
  let save: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let notifications: { success: ReturnType<typeof vi.fn> };

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const button = (label: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('app-multiselect button')].find((b) => b.textContent?.includes(label))!;
  const pressed = (label: string) => button(label).getAttribute('aria-pressed');

  async function pick(selectId: string, value: string): Promise<void> {
    const select = root.querySelector<HTMLSelectElement>(`#${selectId}`)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  async function click(element: HTMLElement): Promise<void> {
    element.click();
    await fixture.whenStable();
  }

  async function create(options: { linked?: boolean } = {}): Promise<void> {
    current = signal(defaultPreferences('USD'));
    accountId = signal<number | null>(options.linked === false ? null : 1001);
    state = signal('ready');
    save = vi.fn(async (values: ReturnType<typeof defaultPreferences>) => current.set(values));
    reload = vi.fn();
    notifications = { success: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        {
          provide: PreferencesStore,
          useValue: { current, accountId, state, customised: signal(false), save, reload },
        },
        {
          provide: AccountOverviewStore,
          useValue: {
            linked: signal(options.linked === false ? null : { overview: { balance: { currency: 'USD' } } }),
            data: { isLoading: () => false, hasValue: () => true },
            errorMessage: () => '',
            reload: vi.fn(),
          },
        },
        { provide: NotificationService, useValue: notifications },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Settings);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  it('shows the saved settings in every control', async () => {
    await create();

    expect(pressed('In-application')).toBe('true');
    expect(pressed('Email')).toBe('false');
    expect(pressed('No notifications')).toBe('false');
    expect(root.querySelector<HTMLSelectElement>('#settings-currency')!.value).toBe('USD');
    expect(root.querySelector<HTMLSelectElement>('#settings-date-format')!.value).toBe(DateFormat.MonDdYyyy);
    expect(root.querySelector<HTMLSelectElement>('#settings-assistant')!.value).toBe('no');
    expect(byTestId<HTMLButtonElement>('settings-save')!.disabled).toBe(true);
  });

  it('offers the date formats with an example each', async () => {
    await create();

    const labels = [...root.querySelectorAll('#settings-date-format option')].map((o) => o.textContent?.trim());
    expect(labels).toContain('DD/MM/YYYY (06/10/2026)');
    expect(labels).toContain('MM/DD/YYYY (10/06/2026)');
    expect(labels).toContain('DD-Month-YYYY (06-October-2026)');
    expect(labels).toContain('YYYY-MM-DD (2026-10-06)');
  });

  describe('channels', () => {
    it('turns channels on and off, and "No notifications" is what an empty list looks like', async () => {
      await create();

      await click(button('Email'));
      expect(pressed('Email')).toBe('true');
      expect(pressed('In-application')).toBe('true');

      await click(button('Email'));
      await click(button('In-application'));
      expect(pressed('No notifications')).toBe('true');
      expect(byTestId('settings-channels-hint')?.textContent).toContain("won't be sent any alerts");
    });

    it('choosing "No notifications" clears the channels, and choosing a channel again leaves it', async () => {
      await create();
      await click(button('SMS'));

      await click(button('No notifications'));
      expect(pressed('SMS')).toBe('false');
      expect(pressed('In-application')).toBe('false');
      expect(pressed('No notifications')).toBe('true');

      await click(button('Email'));
      expect(pressed('Email')).toBe('true');
      expect(pressed('No notifications')).toBe('false');
    });

    it('cannot pick categories while nothing would be sent', async () => {
      await create();
      await click(button('No notifications'));

      expect(root.querySelector('app-multiselect[label="Notification categories"] .is-readonly')).toBeTruthy();
    });
  });

  describe('saving', () => {
    it('is possible only once something changed, and Discard puts everything back', async () => {
      await create();

      await pick('settings-theme', Theme.Dark);
      expect(byTestId<HTMLButtonElement>('settings-save')!.disabled).toBe(false);

      await click(byTestId('settings-discard')!);
      expect(root.querySelector<HTMLSelectElement>('#settings-theme')!.value).toBe(Theme.System);
      expect(byTestId<HTMLButtonElement>('settings-save')!.disabled).toBe(true);
    });

    it('sends the whole document in one call and says so', async () => {
      await create();
      await click(button('Email'));
      await pick('settings-date-format', DateFormat.YyyyMmDd);
      await pick('settings-time-format', TimeFormat.H24);
      await pick('settings-number-format', NumberFormat.In);
      await pick('settings-assistant', 'yes');

      await click(byTestId('settings-save')!);

      expect(save).toHaveBeenCalledTimes(1);
      const saved = save.mock.calls[0][0];
      expect(saved.channels.sort()).toEqual([NotificationChannel.Email, NotificationChannel.InApp].sort());
      expect(saved.dateFormat).toBe(DateFormat.YyyyMmDd);
      expect(saved.timeFormat).toBe(TimeFormat.H24);
      expect(saved.numberFormat).toBe(NumberFormat.In);
      expect(saved.aiAssistantEnabled).toBe(true);
      expect(notifications.success).toHaveBeenCalledWith('Settings saved');
      // saved, so nothing is left to save
      expect(byTestId<HTMLButtonElement>('settings-save')!.disabled).toBe(true);
    });

    it('keeps the edits and says why when the save fails', async () => {
      await create();
      save.mockRejectedValueOnce(
        new HttpErrorResponse({ status: 503, statusText: 'Service Unavailable', error: null }),
      );
      await pick('settings-theme', Theme.Light);

      await click(byTestId('settings-save')!);

      expect(byTestId('settings-save-error')?.textContent?.trim()).not.toBe('');
      expect(notifications.success).not.toHaveBeenCalled();
      expect(root.querySelector<HTMLSelectElement>('#settings-theme')!.value).toBe(Theme.Light);
      expect(byTestId<HTMLButtonElement>('settings-save')!.disabled).toBe(false);
    });
  });

  describe('preview', () => {
    it('shows the formats being chosen, not the saved ones, before anything is saved', async () => {
      await create();
      expect(byTestId('settings-preview-date')?.textContent?.replace(/\s/g, ' ')).toContain('Oct 6, 2026');
      expect(byTestId('settings-preview-number')?.textContent).toBe('1,234,567.89');

      await pick('settings-date-format', DateFormat.DdMmYyyy);
      await pick('settings-time-format', TimeFormat.H24);
      await pick('settings-number-format', NumberFormat.In);
      await pick('settings-currency', 'INR');

      expect(byTestId('settings-preview-date')?.textContent).toBe('06/10/2026, 15:07:09');
      expect(byTestId('settings-preview-number')?.textContent).toBe('12,34,567.89');
      expect(byTestId('settings-preview-money')?.textContent).toBe('₹12,34,567.89');
      expect(save).not.toHaveBeenCalled();
    });

    it('says that estimates change but the account does not, when another currency is chosen', async () => {
      await create();
      expect(byTestId('settings-currency-note')).toBeNull();

      await pick('settings-currency', 'EUR');

      expect(byTestId('settings-currency-note')?.textContent).toContain('shown in EUR');
      expect(byTestId('settings-currency-note')?.textContent).toContain('stays in USD');
    });
  });

  it('reports a failed load, with a way to try again, and still lets the defaults be edited', async () => {
    await create();
    state.set('error');
    await fixture.whenStable();

    expect(byTestId('settings-load-error')).toBeTruthy();
    expect(byTestId('settings-form')).toBeTruthy();

    root.querySelector<HTMLButtonElement>('[data-testid="settings-load-error"] button')!.click();
    expect(reload).toHaveBeenCalled();
  });

  it('explains that settings belong to an account when there is none', async () => {
    await create({ linked: false });

    expect(byTestId('settings-no-account')).toBeTruthy();
    expect(byTestId('settings-form')).toBeNull();
  });
});
