import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthDialogService } from '../../core/auth-dialog.service';
import { Home } from './home';

describe('Home', () => {
  let fixture: ComponentFixture<Home>;
  let dialogs: AuthDialogService;
  let root: HTMLElement;

  const byTestId = (id: string) => root.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Home);
    dialogs = TestBed.inject(AuthDialogService);
    root = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('opens the register tab from Get started', () => {
    byTestId('hero-register').click();

    expect(dialogs.isOpen()).toBe(true);
    expect(dialogs.mode()).toBe('register');
  });

  it('opens the sign-in tab from I already have an account', () => {
    byTestId('hero-login').click();

    expect(dialogs.isOpen()).toBe(true);
    expect(dialogs.mode()).toBe('login');
  });

  it('lists the platform features', () => {
    const titles = Array.from(root.querySelectorAll('.feature-title')).map((t) => t.textContent?.trim());

    expect(titles).toEqual(['Fast order execution', 'Portfolio at a glance', 'Secure by default']);
  });
});
