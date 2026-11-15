import { test, expect } from 'playwright/test';
import {
  loginWithMockedSession,
  setTestLanguage,
  setupApiMocks,
} from './helpers/supabaseMock';

test.describe('Withdrawals POS flow', () => {
  test('user with withdrawals.view searches an item and adds it to POS cart', async ({ page }) => {
    await setTestLanguage(page, 'en');
    await setupApiMocks(page);

    await loginWithMockedSession(page);
    await page.goto('/withdrawals');

    const searchInput = page.getByPlaceholder(/Search items/i);
    await expect(searchInput).toBeVisible();

    await searchInput.fill('Fiber Patch');

    await expect(page.getByRole('heading', { name: 'Fiber Patch Cord LC-LC' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gigabit SFP Module' })).toBeHidden();

    await page.getByRole('button', { name: 'Add to Request' }).first().click();

    await expect(page.getByText('1 in cart')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Requisition Cart' })).toBeVisible();
    await expect(page.getByText('1 items (1 pcs)')).toBeVisible();
  });
});
