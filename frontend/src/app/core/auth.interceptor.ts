import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TRADE_API_URL } from './api.config';
import { SessionService } from './session.service';

/** Adds the signed-in user's access token to Trade API calls (the Auth service calls need none). */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(SessionService).accessToken();
  if (!token || !request.url.startsWith(inject(TRADE_API_URL))) {
    return next(request);
  }
  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
