// FIXTURE — must fire: same account as checkout.spec.ts, so the two cannot run in parallel.
import { test, expect } from '@playwright/test';

test('cart persists', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('shopper.one@testmart.io');
  await expect(page.getByTestId('cart-count')).toHaveText('2');
});
