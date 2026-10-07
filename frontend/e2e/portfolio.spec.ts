import { expect, test } from '@playwright/test';
import { userCredentials } from './support/env';
import { signInFromHome } from './support/ui';

// Journey 4 (bonus): the portfolio. It reads whatever the account holds and asserts only what is true for any account
// and any state of the price feed, so it does not depend on Fauxnance being up or on an order placed by another spec.

test.describe('portfolio', () => {
  test('is behind the guard when signed out', async ({ page }) => {
    await page.goto('/portfolio');

    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('portfolio-title')).toHaveCount(0);
  });

  test('shows the account valued, or says honestly that it cannot, and never calls the market data vendor from the browser', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));

    await signInFromHome(page, userCredentials());
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Portfolio' }).click();
    await expect(page).toHaveURL(/\/portfolio$/);
    await expect(page.getByTestId('portfolio-title')).toBeVisible();

    const total = page.getByTestId('portfolio-total');
    const unavailable = page.getByTestId('portfolio-unavailable');
    const noAccount = page.getByTestId('portfolio-no-account');
    await expect(total.or(unavailable).or(noAccount)).toBeVisible();
    test.skip(await noAccount.isVisible(), 'This login has no trading account yet, so there is no portfolio to show.');

    if (await total.isVisible()) {
      // A priced portfolio says when the prices are from, and every holding says whether its price is live.
      await expect(page.getByTestId('portfolio-asof')).toContainText('Prices as of');
      for (const status of await page.locator('[data-testid^="holding-status-"]').all()) {
        await expect(status).toHaveText(/Live|Delayed|Unavailable/);
      }
      // A partial portfolio never hides which holdings were left out.
      if (await page.getByTestId('portfolio-partial').isVisible()) {
        await expect(page.locator('[data-testid^="holding-status-"]', { hasText: 'Unavailable' }).first()).toBeVisible();
      }
    }

    // Prices reach the screen through the platform: the browser itself never talks to the quote vendor.
    expect(requested.filter((url) => /fauxnance|execute-api\.|amazonaws\.com/i.test(url))).toEqual([]);
  });

  test('keeps the graph above the holdings, and filtering profit and loss reloads only that section', async ({ page }) => {
    await signInFromHome(page, userCredentials());
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Portfolio' }).click();

    const total = page.getByTestId('portfolio-total');
    const noAccount = page.getByTestId('portfolio-no-account');
    await expect(total.or(page.getByTestId('portfolio-unavailable')).or(noAccount)).toBeVisible();
    test.skip(!(await total.isVisible()), 'Needs a priced portfolio to compare sections.');

    // The performance section sits between the summary tiles and the holdings.
    const performance = await page.getByTestId('portfolio-performance').boundingBox();
    const holdings = await page.getByTestId('portfolio-holdings-section').boundingBox();
    expect(performance!.y).toBeLessThan(holdings!.y);

    const portfolioRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/portfolio/')) {
        portfolioRequests.push(new URL(request.url()).pathname);
      }
    });
    await page.getByTestId('portfolio-from').fill('2026-01-01');
    await page.getByTestId('portfolio-range-apply').click();

    await expect(page.getByTestId('portfolio-pnl-section')).toHaveAttribute('aria-busy', 'false');
    await expect(total).toBeVisible();
    expect(portfolioRequests.length).toBeGreaterThan(0);
    expect(portfolioRequests.every((path) => path.endsWith('/pnl'))).toBe(true);
  });

  test('does not go blank when pricing is down: it says so and keeps the holdings on screen', async ({ page }) => {
    await page.route('**/api/v1/portfolio/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ errorCode: 'MKT-503', message: 'Pricing unavailable' }),
      }),
    );

    await signInFromHome(page, userCredentials());
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Portfolio' }).click();

    const unavailable = page.getByTestId('portfolio-unavailable');
    const noAccount = page.getByTestId('portfolio-no-account');
    await expect(unavailable.or(noAccount)).toBeVisible();
    test.skip(await noAccount.isVisible(), 'This login has no trading account yet, so there is no portfolio to show.');

    await expect(unavailable).toContainText('Prices are unavailable right now');
    await expect(page.getByTestId('portfolio-cash')).toBeVisible();
    await expect(page.getByTestId('portfolio-total')).toHaveCount(0);
    for (const status of await page.locator('[data-testid^="holding-status-"]').all()) {
      await expect(status).toHaveText('Unavailable');
    }

    // Trading is not affected: the order history, a different module, still loads.
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Order history' }).click();
    await expect(page.getByTestId('orders-title')).toBeVisible();
  });
});
