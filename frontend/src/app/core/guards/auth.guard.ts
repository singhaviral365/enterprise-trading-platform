import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';

import { SessionService } from '../session.service';

export const SIGN_IN_PATH = '/sign-in';

/**
 * Usability control only: sends signed-out visitors to sign-in with the page
 * they wanted. Authorisation is decided by the Trade REST API on every call.
 */
export const authGuard: CanActivateChildFn = (_route, state) => {
  if (inject(SessionService).isLoggedIn()) {
    return true;
  }
  return inject(Router).createUrlTree([SIGN_IN_PATH], {
    queryParams: { returnUrl: state.url },
  });
};
