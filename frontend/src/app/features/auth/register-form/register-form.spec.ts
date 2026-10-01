import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { RegisterForm } from './register-form';

describe('RegisterForm', () => {
  let fixture: ComponentFixture<RegisterForm>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);

  async function type(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(RegisterForm);
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('blocks a password that is the same as the username (ignoring case)', async () => {
    await type('register-username', 'trader.one.long1');
    await type('register-email', 'trader@example.com');
    await type('register-password', 'Trader.One.Long1');
    await type('register-confirm-password', 'Trader.One.Long1');
    byTestId<HTMLButtonElement>('register-submit')!.click();
    await fixture.whenStable();

    http.expectNone('http://localhost:3000/auth/register');
    expect(root.textContent).toContain('Password must be different from your username.');
  });

  it('blocks a password without a capital letter, number or symbol', async () => {
    await type('register-username', 'trader.one7');
    await type('register-email', 'trader@example.com');
    await type('register-password', 'tradingdeskpass');
    await type('register-confirm-password', 'tradingdeskpass');
    byTestId<HTMLButtonElement>('register-submit')!.click();
    await fixture.whenStable();

    http.expectNone('http://localhost:3000/auth/register');
    expect(root.textContent).toContain('Password needs one capital letter (A–Z).');
  });

  it.each(['9trader.a', 'trader.one', 'traderone7'])('blocks registration for the username %p', async (username) => {
    await type('register-username', username);
    await type('register-email', 'trader@example.com');
    await type('register-password', 'Tr@dingDesk2026');
    await type('register-confirm-password', 'Tr@dingDesk2026');
    byTestId<HTMLButtonElement>('register-submit')!.click();
    await fixture.whenStable();

    http.expectNone('http://localhost:3000/auth/register');
    expect(byTestId('register-username')?.getAttribute('aria-invalid')).toBe('true');
  });

  it.each(['paste', 'copy', 'cut', 'drop'])('prevents %s in both password fields and explains why', async (type) => {
    for (const id of ['register-password', 'register-confirm-password']) {
      const event = new Event(type, { bubbles: true, cancelable: true });
      byTestId<HTMLInputElement>(id)!.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }
    await fixture.whenStable();
    expect(byTestId('register-clipboard-notice')?.textContent).toContain('Copy and paste are turned off');
  });

  it('still allows pasting into the username field', () => {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    byTestId<HTMLInputElement>('register-username')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
