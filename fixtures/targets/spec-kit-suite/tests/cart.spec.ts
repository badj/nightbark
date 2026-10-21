import { test, expect } from '@playwright/test';

// Covers FR-002 (empty state).
test('removing the last item empties the cart', async ({ page }) => {
    await page.goto('/cart');
    await page.getByRole('button', { name: 'Remove Speaker' }).click();
    await expect(page.getByText('Speaker')).not.toBeVisible();
});
