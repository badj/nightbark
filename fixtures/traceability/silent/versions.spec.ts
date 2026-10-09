// FIXTURE — near miss. Version numbers, dates and ports are not case ids.
import { test, expect } from '@playwright/test';

// api-version=7.1, node 22.20.0, port 3002, 2026-10-10 — none of these is a traceability link.
test('the health endpoint reports the build', { tag: ['@smoke'] }, async ({ request }) => {
  const res = await request.get('http://localhost:3002/health?api-version=7.1');
  expect(res.status()).toBe(200);
});
