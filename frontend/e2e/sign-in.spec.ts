import { expect, test } from '@playwright/test';
import { userCredentials } from './support/env';
import { SIGN_IN_TIMEOUT, openProfile, submitLogin } from './support/ui';

// Journey 1: the guard, a refused sign-in, a successful one, and arriving where you were going.
// Each test starts in a fresh browser context, signed out, and leaves nothing behind.

test.describe('sign in', () => {
  test('guard sends a signed-out visitor home and opens the sign-in dialog', async ({ page }) => {
    await page.goto('/orders');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('auth-dialog')).toBeVisible();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('orders-title')).toHaveCount(0);
  });

  test('refuses a wrong password and stays signed out', async ({ page }) => {
    const { username } = userCredentials();
    await page.goto('/dashboard');
    await expect(page.getByTestId('login-form')).toBeVisible();

    await submitLogin(page, { username, password: 'definitely-not-the-password' });

    await expect(page.getByTestId('login-error')).toHaveText(/Incorrect username or password\./, { timeout: SIGN_IN_TIMEOUT });
    await expect(page.getByTestId('auth-dialog')).toBeVisible();
    await expect(page).not.toHaveURL(/\/dashboard/);
    expect(await page.evaluate(() => localStorage.getItem('auth.session'))).toBeNull();
  });

  test('signs in and lands on the dashboard', async ({ page }) => {
    const credentials = userCredentials();
    await page.goto('/');
    await page.getByTestId('hero-login').click();

    await submitLogin(page, credentials);

    await expect(page).toHaveURL(/\/dashboard$/, { timeout: SIGN_IN_TIMEOUT });
    await expect(page.getByTestId('open-profile')).toHaveAttribute('aria-label', `Account menu for ${credentials.username}`);
    const pane = await openProfile(page);
    await expect(pane.getByTestId('profile-username')).toContainText(credentials.username);
    await expect(page.getByTestId('logout-button')).toBeVisible();
    await expect(page.getByTestId('auth-dialog')).not.toBeVisible();
  });

  test('arrives at the page that was asked for, not the default', async ({ page }) => {
    await page.goto('/orders');
    await expect(page.getByTestId('login-form')).toBeVisible();

    await submitLogin(page, userCredentials());

    await expect(page).toHaveURL(/\/orders$/, { timeout: SIGN_IN_TIMEOUT });
    await expect(page.getByTestId('orders-title')).toBeVisible();
  });
});
