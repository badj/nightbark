// FIXTURE — the NEAR MISS. The fixed-wait gate must flag NOTHING here.
// Every wait below is tied to a condition or is a budget, not a sleep.
import { test, expect } from '@playwright/test';

test('bounded polls and signal waits are fine', async ({ page }) => {
  await page.goto('/');

  // A bounded poll on a CONDITION — the timeout is a ceiling, not a duration.
  await expect(page.getByRole('alert')).toBeHidden({ timeout: 3000 });

  // Waits on a real signal.
  await page.waitForSelector('#ready', { timeout: 5000 });
  await page.waitForResponse((r) => r.url().includes('/api/cart') && r.status() === 200);
  await page.waitForLoadState('networkidle');
  await page.waitForURL(/\/checkout$/);
  await page.waitForFunction(() => document.readyState === 'complete');

  // Prose and dead code must not count:
  // await page.waitForTimeout(3000);  <- commented out deliberately
  const note = 'do not use waitForTimeout(3000) here';
  expect(note).toContain('waitForTimeout');

  // Defining a helper is not calling one.
  const sleep = (ms: number) => new Promise((r) => globalThis.setTimeout(r, ms));
  expect(typeof sleep).toBe('function');
});

// ⚠️ A BOUNDED POLL ON A CONDITION — the pattern this gate's advice tells people to migrate TO.
// Flagged by the second version of the gate; kept here so that can never happen again.
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs = 5000,
  pollIntervalMs = 100,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

// A literal delay is still fine when it IS the poll interval of a loop.
export async function pollTwice(check: () => boolean): Promise<void> {
  for (let i = 0; i < 2; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ⚠️ A BOUNDED POLL USING waitForTimeout AS THE INTERVAL — the same shape as the setTimeout poll
// above, on the OTHER branch of the gate. The guard was originally applied to only one of the two;
// found on a production suite. Both shapes are fixtures now so neither branch can regress.
export async function findRow(page: any, name: string, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let rows = await page.$$('[role=row]');
  let hit = rows.find((r: any) => r.name === name);
  while (!hit && Date.now() < deadline) {
    await page.waitForTimeout(500);
    rows = await page.$$('[role=row]');
    hit = rows.find((r: any) => r.name === name);
  }
  return hit;
}
