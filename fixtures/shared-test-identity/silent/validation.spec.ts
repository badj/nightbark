// FIXTURE — near miss. A table of INVALID addresses is test data, not a shared account.
import { test, expect } from '@playwright/test';

const rejected = ['bad@', '@nodomain.com', 'two@@at.com', 'spaces in@name.com'];

for (const invalid of rejected) {
  test(`rejects ${invalid}`, async ({ page }) => {
    await page.getByLabel('Email').fill(invalid);
    await expect(page.getByRole('alert')).toBeVisible();
  });
}

test('one spec owning one address is fine', async ({ page }) => {
  // Appears in THIS file only — data, not shared state.
  await page.getByLabel('Email').fill('solo.user@testmart.io');
  await expect(page.getByLabel('Email')).toHaveValue('solo.user@testmart.io');
});

/** "021 018 24964" / "02101824964" / "+64 21 018 24964" → normalised to 64… */
export function normalise(msisdn: string): string {
  return msisdn.replace(/\D/g, '').replace(/^0/, '64');
}
