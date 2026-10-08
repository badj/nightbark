// FIXTURE — the fixed-wait gate MUST flag this file. Synthetic; see ADR-0003.
import { test, expect } from '@playwright/test';

test('the banner disappears', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(3000);                       // 1: unconditional sleep
  await expect(page.getByRole('alert')).toBeHidden();
});

test('hand-rolled sleep', async ({ page }) => {
  await new Promise((r) => setTimeout(r, 2500));         // 2: same thing, harder to grep
  await page.goto('/');
});

test('named sleep helper', async ({ page }) => {
  await page.click('#submit');
  await sleep(1500);                                     // 3: a named sleep is still a sleep
});

declare function sleep(ms: number): Promise<void>;
