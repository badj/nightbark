// FIXTURE — must fire. Three active switches, two with a reason and one without.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: false, // races on the shared cart fixture
  workers: 1,
  projects: [
    { name: 'chromium', use: { mode: 'serial' } },
  ],
  test: {
    // #1666: run sequentially to avoid races on the shared database.json
    fileParallelism: false,
  },
});
