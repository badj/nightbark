import { test, expect } from '@playwright/test';
// FAULT 2: the same case id as features/refund.feature — a cross-format duplicate.
test('a refund returns to the original card', { tag: ['@[700002]'] }, async ({ page }) => {
  await page.goto('/refunds');
  await expect(page.getByText('Refunded')).toBeVisible();
});
