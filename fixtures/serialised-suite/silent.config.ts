// FIXTURE — the NEAR MISS. Nothing here is an active, unconditional serialisation.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Healthy: parallel by default.
  fullyParallel: true,
  // ⚠️ Playwright's OWN documented boilerplate. Conditional on CI, so not a standing repo-wide
  // cost — and common enough that flagging it would make this gate noise on first contact.
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 2 : 0,
  // A commented-out switch is not an active one:
  // fullyParallel: false,
  // maxWorkers: 1,
  projects: [{ name: 'chromium' }],
});
