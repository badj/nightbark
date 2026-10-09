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

// ⚠️ A NAMED SLEEP AS A POLL INTERVAL — the THIRD branch, and the one the guard was still missing
// when four real repositories were audited. It fired on exactly this shape in a mail client helper.
// Shapes and exemptions are now separate functions so a fourth branch cannot ship without the guard.
export async function waitForMessages(client: any, want: number, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const messages = await client.search();
    if (messages.length >= want) return messages;
    await delay(500);
  }
  throw new Error(`Timeout after ${timeoutMs}ms waiting for search results`);
}

// ⛔ A SLEEP INSIDE A ROUTE HANDLER IS THE STIMULUS, NOT THE WAIT. The test asserts the menu stays
// open WHILE the load is slow, so the delay is the condition under test — deleting it deletes the
// test. Measured as a false positive on two separate real suites.
export async function assertMenuSurvivesSlowLoad(page: any) {
  await page.route('**/dynamic-import/fetch', async (route: any, request: any) => {
    if (request.postData()?.includes('HomePage')) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate network delay
    }
    await route.continue();
  });
  await page.goto('/home');
  await page.getByRole('button', { name: 'Create new' }).waitFor();
}

// ⚠️ THE DEADLINE ARM OF A RACE — a setTimeout whose continuation THROWS is a timeout, not a sleep.
// No loop, so the poll guard never covered it. This is how a bounded wait gets an upper limit.
export async function waitForMembership(cli: any, roomId: string, membership: string) {
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000)).then(() => {
    throw new Error(`Timeout waiting for room ${roomId} membership (wanted '${membership}')`);
  });
  const readyPromise = new Promise<void>((resolve) => cli.once('ready', resolve));
  await Promise.race([readyPromise, timeoutPromise]);
}

// And the same idea written the other way round: reject INSIDE the setTimeout.
export function withDeadline<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('deadline')), ms))]);
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
