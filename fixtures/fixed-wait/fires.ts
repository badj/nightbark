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

// ⚠️ A FIXED SLEEP INSIDE AN ITERATION LOOP. This MUST fire, and it is here because an earlier
// version of the poll guard suppressed it: the guard climbed out of enclosing blocks looking for any
// `for`/`while` and called the sleep an interval. But iterating a known list is not re-testing
// anything — the sleep is paid once per element and is as fixed as any other.
//
// Measured on a real suite (Ghost's visual-regression baselines) as a FALSE NEGATIVE introduced
// while fixing a false positive, which is the worse of the two trades because nothing announces it.
const SCREENS = [{ name: 'home', path: '/' }, { name: 'posts', path: '/posts' }];
for (const screen of SCREENS) {
  test(`visual baseline: ${screen.name}`, async ({ page }) => {
    await page.goto(screen.path);
    await page.addStyleTag({ content: 'x' });
    await page.waitForTimeout(500);
    await expect(page).toHaveScreenshot(`${screen.name}.png`);
  });
}
