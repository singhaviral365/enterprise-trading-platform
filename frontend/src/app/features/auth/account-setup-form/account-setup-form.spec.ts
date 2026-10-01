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
    await fixture.whenStable();
  }

  beforeEach(async () => {
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

  it('creates the account without a balance so the 20,000 default applies', async () => {
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
    });
    request.flush({ accountId: 1011, accountNumber: 'ACC000001011', status: 'ACTIVE', message: 'Account created successfully' });

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
    request.flush({ accountId: 1, accountNumber: 'ACC000000001', status: 'ACTIVE', message: '' });
  });

  it('blocks a balance below the 20,000 minimum and empty required fields', async () => {
    await type('account-balance', '500');
    byTestId<HTMLButtonElement>('account-setup-submit')!.click();
    await fixture.whenStable();

    http.expectNone(CREATE_URL);
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
});
