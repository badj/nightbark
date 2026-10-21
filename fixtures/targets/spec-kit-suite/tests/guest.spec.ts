import { test, expect } from '@playwright/test';

// Feature: specs/002-guest-access

test('a guest never sees the admin menu', async ({ page }) => {
    // FR-001, SC-001
    await page.goto('/');
    await expect(page.getByRole('menu', { name: 'Admin' })).toBeHidden();
});

test('cites a requirement nobody defines', async ({ page }) => {
    // FR-099
    await page.goto('/');
    await expect(page.getByTestId('legacy-banner')).toHaveCount(0);
});
