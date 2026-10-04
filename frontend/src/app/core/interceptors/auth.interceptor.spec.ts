import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

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

  it('attaches the bearer token to a platform API request', () => {
    http.get('http://localhost:8081/api/v1/orders').subscribe();
    const req = httpMock.expectOne('http://localhost:8081/api/v1/orders');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');

    http.get('http://localhost:3000/auth/me').subscribe();
    const me = httpMock.expectOne('http://localhost:3000/auth/me');
    expect(me.request.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('does not attach the bearer token to a third-party request', () => {
    http.get('https://analytics.example.com/collect').subscribe();
    const req = httpMock.expectOne('https://analytics.example.com/collect');
    expect(req.request.headers.has('Authorization')).toBe(false);
  });

  it('does not attach the bearer token to unauthenticated auth routes', () => {
    for (const path of ['login', 'register', 'refresh']) {
      http.post(`http://localhost:3000/auth/${path}`, {}).subscribe();
      const req = httpMock.expectOne(`http://localhost:3000/auth/${path}`);
      expect(req.request.headers.has('Authorization')).toBe(false);
    }
  });
});
