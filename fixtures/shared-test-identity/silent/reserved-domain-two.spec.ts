// FIXTURE — the same reserved-domain address in a SECOND file. Two files would normally fire;
// the reserved domain is what must keep it silent.
import { test, expect } from '@playwright/test';

test('still not an account', async ({ page }) => {
  await page.getByLabel('Email').fill('shopper@example.com');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
});
