import { test, expect } from '@playwright/test';

test('no requirement cited anywhere', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('toast')).not.toBeVisible();
});
