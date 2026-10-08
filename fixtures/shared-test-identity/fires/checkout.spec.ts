// FIXTURE — must fire: this account is also used in cart.spec.ts.
import { test, expect } from '@playwright/test';

test('checkout completes', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('shopper.one@testmart.io');
  await page.getByLabel('Phone').fill('+64 21 555 0199');
  await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
});
