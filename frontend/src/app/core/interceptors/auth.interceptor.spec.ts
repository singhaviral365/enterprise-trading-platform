import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AUTH_API_BASE_URL } from '../../api/api.config';
import { ACCESS_TOKEN_PROVIDER } from '../auth/access-token.provider';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: ACCESS_TOKEN_PROVIDER, useValue: { getAccessToken: () => 'test-token' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('attaches the bearer token to a same-origin Trade API request', () => {
    http.get('/api/v1/orders').subscribe();
    const req = httpMock.expectOne('/api/v1/orders');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('attaches the bearer token to the market endpoint under the same prefix', () => {
    http.get('/api/v1/market/board').subscribe();
    const req = httpMock.expectOne('/api/v1/market/board');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('attaches the bearer token to the Auth service profile route', () => {
    http.get(`${AUTH_API_BASE_URL}/auth/me`).subscribe();
    const me = httpMock.expectOne(`${AUTH_API_BASE_URL}/auth/me`);
    expect(me.request.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('does not attach the bearer token to a third-party request', () => {
    http.get('https://analytics.example.com/collect').subscribe();
    const req = httpMock.expectOne('https://analytics.example.com/collect');
    expect(req.request.headers.has('Authorization')).toBe(false);
  });

  it('does not attach the bearer token to unauthenticated auth routes', () => {
    for (const path of ['login', 'register', 'refresh']) {
      http.post(`${AUTH_API_BASE_URL}/auth/${path}`, {}).subscribe();
      const req = httpMock.expectOne(`${AUTH_API_BASE_URL}/auth/${path}`);
      expect(req.request.headers.has('Authorization')).toBe(false);
    }
  });
});
