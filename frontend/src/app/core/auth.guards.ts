import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthDialogService } from './auth-dialog.service';
import { SessionService } from './session.service';

/** Pages that need a signed-in user: send guests home and open the sign-in dialog, remembering the page they wanted. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(SessionService).isLoggedIn()) {
    return true;
  }
  inject(AuthDialogService).open('login', state.url);
  return inject(Router).createUrlTree(['/']);
};

/** The public home page: signed-in users go straight to their dashboard. */
export const guestGuard: CanActivateFn = () =>
  inject(SessionService).isLoggedIn() ? inject(Router).createUrlTree(['/dashboard']) : true;
