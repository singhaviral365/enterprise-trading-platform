import { Locator, Page, expect } from '@playwright/test';
import { Credentials } from './env';

/** Fills the sign-in dialog (which must already be open) and submits it. Does not wait for the result. */
export async function submitLogin(page: Page, { username, password }: Credentials): Promise<void> {
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
}

/** Signs in from the home page through the header button and waits for the dashboard. */
export async function signInFromHome(page: Page, credentials: Credentials): Promise<void> {
  await page.goto('/');
  await page.getByTestId('open-auth-dialog').click();
  await expect(page.getByTestId('auth-dialog')).toBeVisible();
  await submitLogin(page, credentials);
  // Fail with the real reason (bad credentials, account step) instead of a bare URL timeout.
  const refused = page.getByTestId('login-error');
  const accountStep = page.getByTestId('account-setup-form');
  await expect(refused.or(accountStep).or(page.getByTestId('dashboard-title'))).toBeVisible();
  if (await refused.isVisible()) {
    throw new Error(`Sign-in refused for "${credentials.username}": ${await refused.innerText()} Check the E2E_* credentials in .env.e2e.`);
  }
  if (await accountStep.isVisible()) {
    throw new Error(`"${credentials.username}" has no linked trading account; open one first.`);
  }
  await expect(page).toHaveURL(/\/dashboard$/);
  // The header shows who is signed in (the dashboard itself no longer greets by name).
  await expect(page.getByTestId('header-username')).toContainText(credentials.username);
}

/** Opens the quote dialog for a symbol on the Market data page, widening the table if needed. */
export async function openQuote(page: Page, symbol: string): Promise<Locator> {
  // The market board moved off the dashboard to its own page (a full load is fine: the session is a cookie).
  await page.goto('/market');
  const row = page.getByTestId(`market-row-${symbol}`);
  await expect(page.getByTestId('market-table')).toBeVisible();
  if (!(await row.isVisible())) {
    const sizes = page.getByTestId('pagination-page-size').locator('select');
    const values = await sizes.locator('option').evaluateAll((all) => all.map((o) => (o as HTMLOptionElement).value));
    await sizes.selectOption(values[values.length - 1]);
  }
  await row.click();
  const dialog = page.getByTestId('quote-detail');
  await expect(dialog).toBeVisible();
  return dialog;
}

/** From the quote dialog: opens the buy or sell ticket and returns it. */
export async function openTicket(page: Page, side: 'buy' | 'sell'): Promise<Locator> {
  await page.getByTestId(`quote-${side}`).click();
  const ticket = page.getByTestId('order-ticket');
  await expect(ticket).toBeVisible();
  return ticket;
}

const isOrderPost = (method: string, url: string): boolean =>
  method === 'POST' && new URL(url).pathname === '/api/v1/orders';

/** Counts the order submissions this page makes, so a test can prove none left the browser. */
export function trackOrderPosts(page: Page): { count: () => number } {
  let posts = 0;
  page.on('request', (request) => {
    if (isOrderPost(request.method(), request.url())) {
      posts++;
    }
  });
  return { count: () => posts };
}

/** Resolves with the response to the next order submission. */
export const waitForOrderResponse = (page: Page) =>
  page.waitForResponse((response) => isOrderPost(response.request().method(), response.url()));

/** Statuses a freshly placed order may show: NEW, FILLED or REJECTED. FILLED needs the executor switched on. */
export const PLACED_STATUS_LABEL = /^\s*(Working|Filled|Rejected)\s*$/;
