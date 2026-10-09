// FIXTURE — must fire: a Playwright-native skip still carrying its case id.
import { test, expect } from '@playwright/test';

test.skip('refund is issued to the original card', { tag: ['@[700103]'] }, async ({ page }) => {
  await page.goto('/refunds');
  await expect(page.getByText('Refunded')).toBeVisible();
});
