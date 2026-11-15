import { test, expect } from 'playwright/test';
import {
  loginWithMockedSession,
  setTestLanguage,
  setupApiMocks,
} from './helpers/supabaseMock';

test.describe('Checkouts flow', () => {
  test('authenticated user opens Checkouts and sees the pending list', async ({ page }) => {
    await setTestLanguage(page, 'en');
    await setupApiMocks(page);

    await loginWithMockedSession(page);
    await page.goto('/checkouts');

    const pendingTab = page.getByRole('button', { name: /Pending/i });
    await expect(pendingTab).toBeVisible();
    await pendingTab.click();

    await expect(page.getByRole('heading', { name: /Pending Checkout Requisitions/i })).toBeVisible();
    await expect(page.getByText('CHK-2026-0001')).toBeVisible();
    await expect(page.getByText('Somchai Tester')).toBeVisible();
  });
});
