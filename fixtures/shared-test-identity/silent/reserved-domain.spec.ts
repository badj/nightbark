// FIXTURE — near miss. RFC 2606 reserves example.com and cannot deliver mail, so an address there
// is never a real account with state. Repeated across files on purpose.
import { test, expect } from '@playwright/test';

test('reserved domain is not an account', async ({ page }) => {
  await page.getByLabel('Email').fill('shopper@example.com');
  await expect(page.getByLabel('Email')).toHaveValue('shopper@example.com');
});
