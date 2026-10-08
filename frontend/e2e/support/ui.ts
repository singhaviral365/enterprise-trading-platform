import { Locator, Page, expect } from '@playwright/test';
import { Credentials } from './env';

/**
 * How long to wait for a sign-in to finish. Login hashes the password on the auth service, and with parallel
 * workers signing in at once it has taken ~14 s here, so the shared 15 s expect timeout is too tight for it.
 * Everything else after sign-in is fast and keeps the normal timeout.
 */
export const SIGN_IN_TIMEOUT = 60_000;

/**
 * Where MailHog's web interface is (it catches the sign-in code the Auth service emails in development). Override with
 * `E2E_MAILHOG_URL`. Only needed for a user who switched two-step sign-in on (it is off by default); otherwise it is never called.
 */
const mailhogUrl = (): string => (process.env['E2E_MAILHOG_URL']?.trim() ?? '').replace(/\/$/, '');

/** How many messages MailHog holds, so a test can tell which one arrived after it. Null when MailHog cannot be reached. */
async function mailCount(page: Page): Promise<number | null> {
  try {
    const response = await page.request.get(`${mailhogUrl()}/api/v2/messages?limit=1`);
    return response.ok() ? ((await response.json()) as { total: number }).total : null;
  } catch {
    return null;
  }
}

/** The six-digit code in the newest message, once one newer than `before` has arrived. */
async function codeSentAfter(page: Page, before: number): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const response = await page.request.get(`${mailhogUrl()}/api/v2/messages?limit=1`);
    const body = (await response.json()) as { total: number; items: { Content: { Body: string; Headers: { Subject?: string[] } } }[] };
    if (body.total > before && body.items.length > 0) {
      const text = `${body.items[0].Content.Headers.Subject?.join(' ') ?? ''} ${body.items[0].Content.Body}`;
      const code = /\b(\d{6})\b/.exec(text)?.[1];
      if (code) {
        return code;
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`No sign-in code reached MailHog at ${mailhogUrl()} within 30 s. Is it running, and is email enabled?`);
}

/** The code step of two-step sign-in: reads the emailed code from MailHog and submits it. */
async function completeCodeStep(page: Page, before: number | null): Promise<void> {
  if (before === null) {
    throw new Error(`The sign-in asks for an emailed code, but MailHog is not reachable at ${mailhogUrl()} (set E2E_MAILHOG_URL), or switch two-step sign-in off for this user in Settings.`);
  }
  await page.getByTestId('login-code').fill(await codeSentAfter(page, before));
  await page.getByTestId('login-code-submit').click();
}

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
  const emailsBefore = await mailCount(page);
  await submitLogin(page, credentials);
  // Fail with the real reason (bad credentials, account step) instead of a bare URL timeout.
  const refused = page.getByTestId('login-error');
  const accountStep = page.getByTestId('account-setup-form');
  const codeStep = page.getByTestId('login-code-form');
  await expect(refused.or(accountStep).or(codeStep).or(page.getByTestId('dashboard-title'))).toBeVisible({ timeout: SIGN_IN_TIMEOUT });
  if (await codeStep.isVisible()) {
    // Two-step sign-in: the password was right and a code was emailed.
    await completeCodeStep(page, emailsBefore);
    await expect(refused.or(accountStep).or(page.getByTestId('login-code-error')).or(page.getByTestId('dashboard-title'))).toBeVisible({ timeout: SIGN_IN_TIMEOUT });
    const codeRefused = page.getByTestId('login-code-error');
    if (await codeRefused.isVisible()) {
      throw new Error(`The sign-in code was refused: ${await codeRefused.innerText()}`);
    }
  }
  if (await refused.isVisible()) {
    throw new Error(`Sign-in refused for "${credentials.username}": ${await refused.innerText()} Check the E2E_* credentials in .env.e2e.`);
  }
  if (await accountStep.isVisible()) {
    throw new Error(`"${credentials.username}" has no linked trading account; open one first.`);
  }
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: SIGN_IN_TIMEOUT });
  // The header shows who is signed in (the dashboard itself no longer greets by name).
  await expect(page.getByTestId('open-profile')).toHaveAttribute('aria-label', `Account menu for ${credentials.username}`);
}

/** Opens the profile pane from the header's person icon and returns it. */
export async function openProfile(page: Page): Promise<Locator> {
  await page.getByTestId('open-profile').click();
  const pane = page.getByTestId('profile-menu-pane');
  await expect(pane).toBeVisible();
  return pane;
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
