import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthDialogService } from './auth-dialog.service';
import { SessionService } from './session.service';

/** Pages that need a signed-in user: send guests home and open the sign-in dialog. */
export const authGuard: CanActivateFn = () => {
  if (inject(SessionService).isLoggedIn()) {
    return true;
  }
  inject(AuthDialogService).open('login');
  return inject(Router).createUrlTree(['/']);
};

/** The public home page: signed-in users go straight to their dashboard. */
export const guestGuard: CanActivateFn = () =>
  inject(SessionService).isLoggedIn() ? inject(Router).createUrlTree(['/dashboard']) : true;
