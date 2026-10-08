// FIXTURE — near miss. Identities are GENERATED per run, which is the correct pattern.
import { test, expect } from '@playwright/test';

test('registers a fresh customer', async ({ page }) => {
  const email = `shopper-${Date.now()}@testmart.io`;
  const mobile = `+6421555${Math.floor(Math.random() * 9000 + 1000)}`;
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone').fill(mobile);
  await expect(page.getByText('Welcome')).toBeVisible();
});

test('a different generated identity', async ({ page }) => {
  const email = `shopper-${crypto.randomUUID()}@testmart.io`;
  await page.getByLabel('Email').fill(email);
});
