// FIXTURE — near miss, and the gate's FIRST false positive in the wild.
// Several specs can share "a user that does not exist" with no risk at all: there is no state to
// collide on. Two independent reasons this must stay silent, and both are load-bearing.
import { test, expect } from '@playwright/test';

test('404 for an absent user, by negative intent', async ({ request }) => {
  // local part says it does not exist
  const res = await request.get('/api/users?email=nonexistent@shop.example-store.io');
  expect(res.status()).toBe(404);
});

test('404 again, same probe address', async ({ request }) => {
  const res = await request.get('/api/users?email=nonexistent@shop.example-store.io');
  expect(res.status()).toBe(404);
});
