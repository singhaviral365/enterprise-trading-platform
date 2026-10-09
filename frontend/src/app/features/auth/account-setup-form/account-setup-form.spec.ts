import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../../api/api.config';
import { AccountSetupForm } from './account-setup-form';

const CREATE_URL = '/api/v1/accounts/create';

describe('AccountSetupForm', () => {
  let fixture: ComponentFixture<AccountSetupForm>;
  let http: HttpTestingController;
  let root: HTMLElement;

  const byTestId = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(`[data-testid="${id}"]`);

  async function type(testId: string, value: string): Promise<void> {
    const input = byTestId<HTMLInputElement>(testId)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    // A session left in localStorage by another spec would make the store fire an unanswered account lookup.
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AccountSetupForm],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideApiClients()],
    }).compileComponents();
    fixture = TestBed.createComponent(AccountSetupForm);
    fixture.componentRef.setInput('email', 'priya@example.com');
    http = TestBed.inject(HttpTestingController);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('pre-fills the email passed in from registration', () => {
    expect(byTestId<HTMLInputElement>('account-email')!.value).toBe('priya@example.com');
  });

  it('enables Open my account once the required details are valid', async () => {
    await type('account-client-name', 'Priya Menon');
    await type('account-phone', '5551234567');

    expect(byTestId<HTMLButtonElement>('account-setup-submit')!.disabled).toBe(false);
  });

  it('creates the account in USD without a balance, so the 20,000 default applies', async () => {
    const completed = vi.fn();
    fixture.componentInstance.completed.subscribe(completed);

    await type('account-client-name', 'Priya Menon');
    await type('account-phone', '+1 555 123 4567');
    byTestId<HTMLButtonElement>('account-setup-submit')!.click();

    const request = await vi.waitFor(() => http.expectOne(CREATE_URL));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      client_name: 'Priya Menon',
      phone_no: '+1 555 123 4567',
      email: 'priya@example.com',
      currency: 'USD',
    });
    request.flush({ accountId: 1011, accountNumber: 'ACC000001011', status: 'ACTIVE', message: 'Account created successfully', currency: 'USD' });

    await vi.waitFor(() => expect(completed).toHaveBeenCalled());
  });

  it('sends the chosen balance and date of birth when given', async () => {
    await type('account-client-name', 'Priya Menon');
    await type('account-phone', '5551234567');
    await type('account-dob', '1990-05-17');
    await type('account-balance', '25,000');
    byTestId<HTMLButtonElement>('account-setup-submit')!.click();

    const request = await vi.waitFor(() => http.expectOne(CREATE_URL));
    expect(request.request.body).toMatchObject({ dob: '1990-05-17', balance: 25000 });
    request.flush({ accountId: 1, accountNumber: 'ACC000000001', status: 'ACTIVE', message: '', currency: 'USD' });
  });

  it('blocks a balance below the 20,000 minimum and empty required fields', async () => {
    expect(byTestId<HTMLButtonElement>('account-setup-submit')!.disabled).toBe(true);
    await type('account-balance', '500');
    byTestId('account-client-name')!.dispatchEvent(new Event('blur'));
    byTestId('account-phone')!.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(byTestId<HTMLButtonElement>('account-setup-submit')!.disabled).toBe(true);
    expect(root.textContent).toContain('Enter your full name.');
    expect(root.textContent).toContain('Enter your phone number.');
    expect(root.textContent).toContain('Opening balance must be a number of at least 20,000.');
  });

  it('treats "already linked" as done rather than an error', async () => {
    const completed = vi.fn();
    fixture.componentInstance.completed.subscribe(completed);
    await type('account-client-name', 'Priya Menon');
    await type('account-phone', '5551234567');
    byTestId<HTMLButtonElement>('account-setup-submit')!.click();

    (await vi.waitFor(() => http.expectOne(CREATE_URL))).flush(
      { errorCode: 'ACCOUNT-409', message: 'User already has an account' },
      { status: 409, statusText: 'Conflict' },
    );

    await vi.waitFor(() => expect(completed).toHaveBeenCalled());
  });

  async function choose(currency: string): Promise<void> {
    const select = root.querySelector<HTMLSelectElement>('#account-currency')!;
    select.value = currency;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  it('offers the ten currencies, USD first and chosen, with the reason it is asked once', () => {
    const select = root.querySelector<HTMLSelectElement>('#account-currency')!;

    expect([...select.options].map((o) => o.value)).toEqual(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'SGD', 'CNY']);
    expect(select.value).toBe('USD');
    expect(root.textContent).toContain('Chosen once. It cannot be changed later.');
  });

  it('sends the chosen currency', async () => {
    await choose('EUR');
    await type('account-client-name', 'Priya Menon');
    await type('account-phone', '5551234567');
    byTestId<HTMLButtonElement>('account-setup-submit')!.click();

    const request = await vi.waitFor(() => http.expectOne(CREATE_URL));
    expect(request.request.body.currency).toBe('EUR');
    request.flush({ accountId: 1, accountNumber: 'ACC000000001', status: 'ACTIVE', message: '', currency: 'EUR' });
  });

  it('shows the symbol and the minimum of the chosen currency', async () => {
    expect(byTestId('account-balance-symbol')?.textContent?.trim()).toBe('$');
    expect(byTestId('account-balance-hint')?.textContent).toContain('Defaults to 20,000 USD');

    await choose('JPY');

    expect(byTestId('account-balance-symbol')?.textContent?.trim()).toBe('¥');
    expect(byTestId('account-balance-hint')?.textContent).toContain('Defaults to 3,000,000 JPY');
  });

  it('checks the balance against the minimum of the chosen currency, not 20,000', async () => {
    await choose('JPY');
    await type('account-balance', '20000');
    expect(root.textContent).toContain('Opening balance must be a number of at least 3,000,000.');

    await type('account-balance', '3000000');
    expect(root.textContent).not.toContain('Opening balance must be a number of at least');

    await choose('USD');
    await type('account-balance', '20000');
    expect(root.textContent).not.toContain('Opening balance must be a number of at least');
  });
});
