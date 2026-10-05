import { TestBed } from '@angular/core/testing';
import { AuthDialogService } from './auth-dialog.service';

describe('AuthDialogService', () => {
  let service: AuthDialogService;

  beforeEach(() => {
    service = TestBed.inject(AuthDialogService);
  });

  it('starts closed on the sign-in tab', () => {
    expect(service.isOpen()).toBe(false);
    expect(service.mode()).toBe('login');
    expect(service.returnUrl()).toBeNull();
  });

  it('opens in the requested mode and remembers where to go afterwards', () => {
    service.open('login', '/orders');

    expect(service.isOpen()).toBe(true);
    expect(service.returnUrl()).toBe('/orders');
  });

  it('forgets the return address and email when re-opened plainly or closed', () => {
    service.setPrefillEmail('a@b.co');
    service.open('login', '/orders');
    service.open('register');

    expect(service.returnUrl()).toBeNull();
    expect(service.prefillEmail()).toBe('');

    service.open('login', '/positions');
    service.close();
    expect(service.isOpen()).toBe(false);
    expect(service.returnUrl()).toBeNull();
  });

  it('keeps the return address and email through the account step', () => {
    service.open('login', '/orders');
    service.setPrefillEmail('a@b.co');
    service.setMode('account');
    service.open('account');

    expect(service.mode()).toBe('account');
    expect(service.returnUrl()).toBe('/orders');
    expect(service.prefillEmail()).toBe('a@b.co');
  });
});
