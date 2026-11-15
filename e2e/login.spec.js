import { test, expect } from 'playwright/test';
import { setTestLanguage, setupApiMocks } from './helpers/supabaseMock';

test.describe('Login flow', () => {
  test('renders login page and shows error toast on invalid credentials (400)', async ({ page }) => {
    await setTestLanguage(page, 'en');
    await setupApiMocks(page, {
      loginError: { status: 400, message: 'Invalid login credentials' },
    });

    await page.goto('/login');

    await expect(page.getByRole('heading', { level: 1, name: /StockFlow/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();

    await page.getByRole('textbox', { name: 'Email' }).fill('wrong@stockflow.local');
    await page.getByRole('textbox', { name: 'Password' }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
  });
});
