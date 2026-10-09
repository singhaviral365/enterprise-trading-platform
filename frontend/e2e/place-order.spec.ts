import { expect, test } from '@playwright/test';
import { readOnlyCredentials, tradedSymbol, userCredentials } from './support/env';
import {
  PLACED_STATUS_LABEL,
  openQuote,
  openTicket,
  signInFromHome,
  trackOrderPosts,
  waitForOrderResponse,
} from './support/ui';

// Journey 2: the read-only account, a rejection before submission, and a placed order.
// Every test signs in for itself and places (at most) its own order; none expects another's.

test.describe('place an order', () => {
  test('a non-active account cannot place orders', async ({ page }) => {
    const posts = trackOrderPosts(page);
    await signInFromHome(page, readOnlyCredentials());
    await expect(page.getByTestId('dashboard-status-notice')).toBeVisible();

    await openQuote(page, tradedSymbol());
    const ticket = await openTicket(page, 'buy');

    await expect(ticket.getByTestId('order-inactive')).toBeVisible();
    await expect(ticket.getByTestId('order-submit')).toBeDisabled();
    expect(posts.count()).toBe(0);
  });

  test('invalid input is rejected in the browser before anything is submitted', async ({ page }) => {
    const posts = trackOrderPosts(page);
    await signInFromHome(page, userCredentials());
    await openQuote(page, tradedSymbol());
    const ticket = await openTicket(page, 'buy');
    const quantity = ticket.getByTestId('order-quantity');

    const submit = ticket.getByTestId('order-submit');

    await quantity.fill('0');
    await quantity.blur();
    await expect(ticket.getByText('Quantity must be a whole number of at least 1.')).toBeVisible();
    await expect(submit).toBeDisabled();

    await quantity.fill('');
    await quantity.blur();
    await expect(ticket.getByText('Enter a quantity.')).toBeVisible();
    await expect(submit).toBeDisabled();

    await expect(page.getByTestId('order-confirmation')).toHaveCount(0);
    expect(posts.count()).toBe(0);
  });

  test('the quantity buttons step the order size and stop at 1', async ({ page }) => {
    await signInFromHome(page, userCredentials());
    await openQuote(page, tradedSymbol());
    const ticket = await openTicket(page, 'buy');
    const quantity = ticket.getByTestId('order-quantity');

    await expect(ticket.getByTestId('order-quantity-decrease')).toBeDisabled();
    await ticket.getByTestId('order-quantity-increase').click();
    await ticket.getByTestId('order-quantity-increase').click();
    await expect(quantity).toHaveValue('3');
    await ticket.getByTestId('order-quantity-decrease').click();
    await expect(quantity).toHaveValue('2');
  });

  test('selling more than is held is blocked before submission', async ({ page }) => {
    const posts = trackOrderPosts(page);
    await signInFromHome(page, userCredentials());
    await openQuote(page, tradedSymbol());
    const ticket = await openTicket(page, 'sell');

    await ticket.getByTestId('order-quantity').fill('1000000');

    await expect(ticket.getByTestId('order-warning')).toBeVisible();
    await expect(ticket.getByTestId('order-submit')).toBeDisabled();
    expect(posts.count()).toBe(0);
  });

  test('places a market buy order and shows the status that came back', async ({ page }) => {
    await signInFromHome(page, userCredentials());
    await openQuote(page, tradedSymbol());
    const ticket = await openTicket(page, 'buy');
    await ticket.getByTestId('order-quantity').fill('1');

    const [response] = await Promise.all([waitForOrderResponse(page), ticket.getByTestId('order-submit').click()]);

    // NEW (Working), FILLED or REJECTED are all valid: FILLED only appears once the executor is switched on.
    expect(response.ok()).toBe(true);
    const confirmation = page.getByTestId('order-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByTestId('order-id')).toHaveText(/^#\d+$/);
    await expect(confirmation.getByTestId('order-status')).toHaveText(PLACED_STATUS_LABEL);

    await confirmation.getByTestId('order-done').click();
    await expect(page.getByTestId('quote-detail')).not.toBeVisible();
  });
});
