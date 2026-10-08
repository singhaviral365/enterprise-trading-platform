import { HttpEvent, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';

/**
 * Answers every price-history request with an empty history, without involving the test backend. For specs of pages that ask for
 * candles on the side (a holding's chart, the 52-week range column) but are not about them: an unanswered request would keep the
 * fixture from ever becoming stable. Specs that are about candles answer them by hand instead. Test-only: excluded from the app build.
 */
export const stubCandles: HttpInterceptorFn = (request, next): Observable<HttpEvent<unknown>> => {
  const match = /\/market\/candles\/([^/?]+)/.exec(request.url);
  if (request.method === 'GET' && match) {
    return of(
      new HttpResponse({
        status: 200,
        body: { symbol: decodeURIComponent(match[1]), currency: 'USD', interval: '1d', candles: [] },
      }),
    );
  }
  return next(request);
};
