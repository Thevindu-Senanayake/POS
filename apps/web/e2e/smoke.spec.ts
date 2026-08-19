import { expect, test } from '@playwright/test';

/**
 * Critical-path web smoke (spec §11): sign in as the seeded admin, take a
 * takeaway order, send it to the kitchen, then settle it in full.
 *
 * Takeaway is used deliberately — it needs no table/session state, so the test
 * is repeatable without re-seeding, and "Sausage Fried Rice" carries a takeaway
 * price in the seed so it appears on the (default) food menu tab. Settling a
 * takeaway order navigates back to the floor; that return is the app's
 * "bill done" signal — the printed bill itself is a backend PrintJob, not an
 * on-screen receipt.
 */
test('sign in → takeaway order → send → pay settles the bill', async ({ page }) => {
  // 1. Sign in as the seeded admin.
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('pos1234');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Lands on the workspace picker → open the POS terminal.
  const posLink = page.getByRole('link', { name: /POS Terminal/ });
  await expect(posLink).toBeVisible();
  await posLink.click();

  // 2. Start a takeaway order from the floor board.
  await expect(page.getByRole('heading', { name: 'Floor' })).toBeVisible();
  await page.getByRole('button', { name: '+ Takeaway' }).click();

  // 3. Add a seeded menu item (has a takeaway price) to the current round.
  await expect(page).toHaveURL(/\/pos\/order\//);
  const menuCard = page.getByRole('button', { name: /Sausage Fried Rice/ });
  await expect(menuCard).toBeVisible();
  await menuCard.click();

  // Fire the round to the kitchen — the point stock deducts + KOT enqueues.
  await page.getByRole('button', { name: /^Send/ }).click();

  // 4. Once fired the order is billable → Pay enables. Settle in full.
  const payButton = page.getByRole('button', { name: 'Pay', exact: true });
  await expect(payButton).toBeEnabled({ timeout: 20_000 });
  await payButton.click();

  // Settlement dialog opens on the full-pay tab, pre-filled with exact cash.
  await expect(page.getByRole('dialog', { name: 'Settle order' })).toBeVisible();
  await page.getByRole('button', { name: /^Take / }).click();

  // 5. Settling returns to the floor — the bill is done.
  await expect(page).toHaveURL(/\/pos$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Floor' })).toBeVisible();
});
