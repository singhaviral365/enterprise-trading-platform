import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AccountService, accountIdFromNumber } from './account.service';
import { authInterceptor } from './auth.interceptor';
import { SessionService } from './session.service';

describe('AccountService', () => {
  let accounts: AccountService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    TestBed.inject(SessionService).start('alice.trader', {
      accessToken: 'jwt-token',
      refreshToken: 'r',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    accounts = TestBed.inject(AccountService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the linked account and sends the access token', async () => {
    const status = accounts.getLinkStatus();
    const request = http.expectOne('/api/v1/accounts/link');
    expect(request.request.headers.get('Authorization')).toBe('Bearer jwt-token');
    request.flush({ linked: true, message: 'Linked account found', accountNumber: 'ACC000001001' });

    await expect(status).resolves.toEqual({ linked: true, accountNumber: 'ACC000001001', accountId: 1001 });
  });

  it('reports an unlinked user', async () => {
    const status = accounts.getLinkStatus();
    http.expectOne('/api/v1/accounts/link').flush({ linked: false, message: 'No linked account yet' });

    await expect(status).resolves.toEqual({ linked: false, accountNumber: null, accountId: null });
  });

  it('bumps the revision after creating an account', async () => {
    const before = accounts.revision();
    const created = accounts.createAccount({ client_name: 'A B', phone_no: '5551234567', email: 'a@b.co' });
    http.expectOne('/api/v1/accounts/create').flush({ accountId: 1, accountNumber: 'ACC000000001', status: 'ACTIVE', message: '' });
    await created;

    expect(accounts.revision()).toBe(before + 1);
  });

  it('turns a validation error into a readable message', async () => {
    const created = accounts.createAccount({ client_name: 'A', phone_no: '1', email: 'x' });
    http
      .expectOne('/api/v1/accounts/create')
      .flush({ errorCode: 'VAL-422', message: 'Opening balance must be at least 20000' }, { status: 422, statusText: 'Unprocessable' });

    await expect(created).rejects.toThrow('Please check your details: Opening balance must be at least 20000');
  });

  it('parses the account id from the account number', () => {
    expect(accountIdFromNumber('ACC000001001')).toBe(1001);
    expect(accountIdFromNumber('XYZ')).toBeNull();
    expect(accountIdFromNumber(null)).toBeNull();
  });
});
