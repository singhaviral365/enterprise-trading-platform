import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountOverviewStore } from '../../core/account-overview.store';
import { AuthService } from '../../core/auth.service';
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
  let me: ReturnType<typeof vi.fn>;
  let setTwoFactor: ReturnType<typeof vi.fn>;
  let workingOrders: ReturnType<typeof signal<number>>;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  /** One tick box in the channel or category drop-down; the panel is in the DOM even while it is shut. */
  const box = (group: 'settings-channels' | 'settings-categories', value: string) =>
    root.querySelector<HTMLInputElement>(`[data-testid="${group}"] input[data-value="${value}"]`)!;
  const channelBox = (value: string) => box('settings-channels', value);
  const ticked = (value: string) => channelBox(value).checked;
  const summary = (group: 'settings-channels' | 'settings-categories') =>
    root.querySelector(`[data-testid="${group}"] .multi-summary`)?.textContent?.trim();

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
    me = vi.fn(async () => ({ id: 1, twoFactorEnabled: false }));
    setTwoFactor = vi.fn(async (enabled: boolean) => ({ id: 1, twoFactorEnabled: enabled }));
    workingOrders = signal(0);
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
            workingOrders,
          },
        },
        { provide: NotificationService, useValue: notifications },
        { provide: AuthService, useValue: { me, setTwoFactor } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Settings);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  }

  it('shows the saved settings in every control', async () => {
    await create();

    expect(ticked(NotificationChannel.InApp)).toBe(true);
    expect(ticked(NotificationChannel.Email)).toBe(false);
    expect(ticked('NONE')).toBe(false);
    expect(byTestId('settings-currency-value')?.textContent?.trim()).toBe('USD');
    expect(root.querySelector<HTMLSelectElement>('#settings-date-format')!.value).toBe(DateFormat.MonDdYyyy);
    expect(root.querySelector<HTMLSelectElement>('#settings-assistant')!.value).toBe('no');
    expect(byTestId<HTMLButtonElement>('settings-save')!.disabled).toBe(true);
  });

  it('shows the saved two-step choice, and a change waits for Save like every other setting', async () => {
    await create();
    expect(root.querySelector<HTMLSelectElement>('#settings-two-factor')!.value).toBe('off');

    await pick('settings-two-factor', 'on');

    expect(setTwoFactor).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLSelectElement>('#settings-two-factor')!.value).toBe('on');
    expect(byTestId<HTMLButtonElement>('settings-save')!.disabled).toBe(false);

    await click(byTestId('settings-save')!);

    expect(setTwoFactor).toHaveBeenCalledWith(true);
    expect(notifications.success).toHaveBeenCalledWith('Settings saved');
    expect(byTestId<HTMLButtonElement>('settings-save')!.disabled).toBe(true);
  });

  it('puts the two-step choice back on Discard, without calling the server', async () => {
    await create();
    await pick('settings-two-factor', 'on');

    await click(byTestId('settings-discard')!);

    expect(root.querySelector<HTMLSelectElement>('#settings-two-factor')!.value).toBe('off');
    expect(setTwoFactor).not.toHaveBeenCalled();
  });

  it('says why two-step sign-in could not be turned on, and saves nothing else', async () => {
    await create();
    setTwoFactor.mockRejectedValueOnce(new HttpErrorResponse({ status: 503, error: { errorCode: 'OTP-503', message: 'x' } }));
    await pick('settings-two-factor', 'on');
    await pick('settings-theme', Theme.Dark);

    await click(byTestId('settings-save')!);

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(byTestId('settings-two-factor-error')?.textContent?.trim()).toBeTruthy();
    });
    expect(save).not.toHaveBeenCalled();
  });

  it('shows two-step sign-in even for a customer with no trading account', async () => {
    await create({ linked: false });
    expect(byTestId('settings-security')).not.toBeNull();
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

      await click(channelBox(NotificationChannel.Email));
      expect(ticked(NotificationChannel.Email)).toBe(true);
      expect(ticked(NotificationChannel.InApp)).toBe(true);
      expect(summary('settings-channels')).toBe('2 selected');

      await click(channelBox(NotificationChannel.Email));
      await click(channelBox(NotificationChannel.InApp));
      // the last channel cannot be unticked: pick "No notifications" for none
      expect(ticked(NotificationChannel.InApp)).toBe(true);
      await click(channelBox('NONE'));
      expect(summary('settings-channels')).toBe('No notifications');
    });

    it('choosing "No notifications" clears the channels, and choosing a channel again leaves it', async () => {
      await create();
      await click(channelBox(NotificationChannel.Email));

      await click(channelBox('NONE'));
      expect(ticked(NotificationChannel.Email)).toBe(false);
      expect(ticked(NotificationChannel.InApp)).toBe(false);
      expect(ticked('NONE')).toBe(true);

      await click(channelBox(NotificationChannel.InApp));
      expect(ticked(NotificationChannel.InApp)).toBe(true);
      expect(ticked('NONE')).toBe(false);
    });

    it('cannot pick categories while nothing would be sent', async () => {
      await create();
      await click(channelBox('NONE'));

      expect(root.querySelector<HTMLButtonElement>('[data-testid="settings-categories"] button.multi-trigger')!.disabled).toBe(true);
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
      await click(channelBox(NotificationChannel.Email));
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
    it('keeps date-time preview readable when only one of date or time format changes', async () => {
      await create();

      await pick('settings-date-format', DateFormat.DdMmYyyy);
      expect(byTestId('settings-preview-date')?.textContent).toContain('06/10/2026,');
      expect(byTestId('settings-preview-date')?.textContent).toContain(':07:09');

      await pick('settings-date-format', DateFormat.MonDdYyyy);
      await pick('settings-time-format', TimeFormat.H24);
      expect(byTestId('settings-preview-date')?.textContent).toContain('Oct 6, 2026, 15:07:09');
    });

    it('shows the formats being chosen, not the saved ones, before anything is saved', async () => {
      await create();
      expect(byTestId('settings-preview-date')?.textContent?.replace(/\s/g, ' ')).toContain('Oct 6, 2026');
      expect(byTestId('settings-preview-number')?.textContent).toBe('1,234,567.89');

      await pick('settings-date-format', DateFormat.DdMmYyyy);
      await pick('settings-time-format', TimeFormat.H24);
      await pick('settings-number-format', NumberFormat.In);

      expect(byTestId('settings-preview-date')?.textContent).toBe('06/10/2026, 15:07:09');
      expect(byTestId('settings-preview-number')?.textContent).toBe('12,34,567.89');
      expect(byTestId('settings-preview-money')?.textContent).toBe('$12,34,567.89');
      expect(save).not.toHaveBeenCalled();
    });

    it('draws the preview money in the account currency', async () => {
      await create();
      current.set({ ...current(), preferredCurrency: 'INR' as never });
      await fixture.whenStable();

      expect(byTestId('settings-preview-money')?.textContent).toBe('₹1,234,567.89');
    });
  });

  describe('the account currency', () => {
    it('is a read-only fact with the reason, not a control', async () => {
      await create();

      expect(root.querySelector('#settings-currency')).toBeNull();
      expect(root.querySelector('select[id*="currency"]')).toBeNull();
      expect(byTestId('settings-currency')?.textContent).toContain('Account currency');
      expect(byTestId('settings-currency-value')?.textContent?.trim()).toBe('USD');
      expect(byTestId('settings-currency')?.textContent).toContain('Set when your account was opened.');
    });

    it('has no conversion warning, no open-order block and no confirmation', async () => {
      await create();
      workingOrders.set(2);
      await pick('settings-theme', Theme.Dark);

      expect(byTestId('settings-currency-note')).toBeNull();
      expect(byTestId('settings-currency-blocked')).toBeNull();

      await click(byTestId('settings-save')!);

      expect(save).toHaveBeenCalledTimes(1);
      expect(notifications.success).toHaveBeenCalledWith('Settings saved');
    });

    it('is still the account currency that is passed along when other settings are saved', async () => {
      await create();
      await pick('settings-theme', Theme.Dark);

      await click(byTestId('settings-save')!);

      expect(save.mock.calls[0][0].preferredCurrency).toBe('USD');
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

  it('stacks the four sections in two columns', async () => {
    await create();

    const columns = [...byTestId('settings-layout')!.querySelectorAll(':scope > form > .settings-col')];
    expect(columns.length).toBe(2);
    expect(columns.map((column) => column.querySelectorAll(':scope > section.card').length)).toEqual([2, 2]);
  });

  it('explains that settings belong to an account when there is none', async () => {
    await create({ linked: false });

    expect(byTestId('settings-no-account')).toBeTruthy();
    expect(byTestId('settings-form')).toBeNull();
  });
});
