import { expect, test } from '@playwright/test';
import { userCredentials } from './support/env';
import { signInFromHome } from './support/ui';

// Journey 3 (bonus): the order blotter. It reads whatever the account already holds and asserts only
// things true for any history, so it does not depend on an order placed by another spec.

test.describe('order blotter', () => {
  test('is behind the guard when signed out', async ({ page }) => {
    await page.goto('/orders');

    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('order-row')).toHaveCount(0);
  });

  test('lists the orders, sorts them and refreshes', async ({ page }) => {
    await signInFromHome(page, userCredentials());
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Order history' }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByTestId('orders-title')).toBeVisible();

    const rows = page.getByTestId('order-row');
    const empty = page.getByTestId('orders-empty');
    await expect(rows.first().or(empty)).toBeVisible();
    test.skip(await empty.isVisible(), 'This account has no orders yet, so there is nothing to sort.');

    // Every row carries a known status badge.
    for (const badge of await page.getByTestId('order-status').all()) {
      await expect(badge).toHaveText(/Working|Filled|Rejected|Cancelled/);
    }

    // Sorting by symbol toggles the column between ascending and descending.
    const symbolHeader = page.getByRole('columnheader').filter({ has: page.getByTestId('sort-symbol') });
    await page.getByTestId('sort-symbol').click();
    await expect(symbolHeader).toHaveAttribute('aria-sort', 'ascending');
    await page.getByTestId('sort-symbol').click();
    await expect(symbolHeader).toHaveAttribute('aria-sort', 'descending');

    // Reset is disabled until a filter is active.
    await expect(page.getByTestId('filters-reset')).toBeDisabled();

    // Refresh re-reads the account without leaving the page.
    await page.getByTestId('orders-refresh').click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(rows.first()).toBeVisible();
  });
});
