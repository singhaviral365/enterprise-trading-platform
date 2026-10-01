import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { AuthDialogService } from '../../../core/auth-dialog.service';
import { SessionService } from '../../../core/session.service';
import { LINK_URL, TEST_TOKENS, answerLinkedAccount, answerUnlinkedAccount } from '../../../testing/trade-http';
import { AccountMenu } from './account-menu';

describe('AccountMenu', () => {
  let fixture: ComponentFixture<AccountMenu>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) => root.querySelector<T>(`[data-testid="${id}"]`);
  const trigger = () => byTestId<HTMLButtonElement>('header-username')!;
  const panel = () => byTestId('account-menu-panel')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountMenu],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    TestBed.inject(SessionService).start('alice.trader', TEST_TOKENS);
    fixture = TestBed.createComponent(AccountMenu);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => fixture.destroy());

  it('shows the username on the trigger and keeps the panel hidden', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();

    expect(trigger().textContent).toContain('alice.trader');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(panel().hasAttribute('hidden')).toBe(true);
  });

  it('shows the linked account in the panel when opened', async () => {
    await answerLinkedAccount(http, { cashBalance: 24800 });
    await fixture.whenStable();

    trigger().click();
    await fixture.whenStable();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(panel().hasAttribute('hidden')).toBe(false);
    expect(byTestId('account-menu-number')?.textContent).toContain('ACC000001001');
    expect(panel().textContent).toContain('$24,800.00');
    expect(panel().textContent).toContain('USER-1000');
    expect(panel().querySelector('.status-badge.is-active')).toBeTruthy();
  });

  it('opens on hover and closes when the pointer leaves', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();

    root.dispatchEvent(new Event('mouseenter'));
    await fixture.whenStable();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');

    root.dispatchEvent(new Event('mouseleave'));
    await fixture.whenStable();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Esc and puts focus back on the trigger', async () => {
    await answerUnlinkedAccount(http);
    document.body.appendChild(root);
    await fixture.whenStable();
    trigger().click();
    await fixture.whenStable();

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger());
    root.remove();
  });

  it('closes on a click elsewhere but not on a click inside', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();
    trigger().click();
    await fixture.whenStable();

    panel().click();
    await fixture.whenStable();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');

    document.body.click();
    await fixture.whenStable();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when focus moves outside the menu', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();
    trigger().click();
    await fixture.whenStable();

    root.dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body, bubbles: true }));
    await fixture.whenStable();

    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('offers to open an account when none is linked', async () => {
    await answerUnlinkedAccount(http);
    await fixture.whenStable();
    trigger().click();
    await fixture.whenStable();

    expect(panel().textContent).toContain('No trading account is linked yet.');
    panel().querySelector<HTMLButtonElement>('button')!.click();
    await fixture.whenStable();

    const dialogs = TestBed.inject(AuthDialogService);
    expect(dialogs.isOpen()).toBe(true);
    expect(dialogs.mode()).toBe('account');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('reports a failed load with a retry', async () => {
    (await vi.waitFor(() => http.expectOne(LINK_URL))).flush(null, { status: 500, statusText: 'x' });
    await fixture.whenStable();
    trigger().click();
    await fixture.whenStable();

    expect(panel().textContent).toContain('Try again');

    panel().querySelector<HTMLButtonElement>('button')!.click();
    await answerLinkedAccount(http);
    await fixture.whenStable();
    expect(byTestId('account-menu-number')).toBeTruthy();
  });
});
