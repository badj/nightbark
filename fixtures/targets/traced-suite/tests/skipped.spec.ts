import { test, expect } from '@playwright/test';
test.skip('statements are emailed monthly', { tag: ['@[700004]'] }, async ({ page }) => {
  await page.goto('/statements');
  await expect(page.getByText('Sent')).toBeVisible();
});
