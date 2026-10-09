/**
 * What a test file is NAMED. One definition, imported by the runner and by every gate.
 *
 * ⚠️ IT LIVES IN ITS OWN LEAF MODULE ON PURPOSE — it imports nothing, and nothing it imports can
 * import it back. The first version exported it from `runner.mjs`, which creates a cycle the moment
 * a gate uses it (runner → gates/index → a gate → runner), and that cycle does not fail honestly:
 * `nightbark audit` kept working because the runner happens to load first, while importing a gate
 * directly died with "Cannot access 'serialisedSuite' before initialization". A break that depends
 * on which door you came in by is worse than one that always breaks.
 *
 * ── Why the list matters ──────────────────────────────────────────────────────────────────────
 *
 * Four gates each carried their own regex for this and gave three different answers. The narrowest
 * accepted only `.spec.` and `.test.`, so on cal.com — whose 53 Playwright specs are named
 * `*.e2e.ts` — the traceability gate read ZERO files and reported the repository clean. A gate that
 * cannot see a file cannot find anything in it, and "0 findings" then means nothing at all.
 *
 *   .spec. / .test.   the common default
 *   .e2e.             Playwright-common (cal.com); .e2e-spec. is the Angular variant
 *   .cy.              Cypress's own default since v10
 *   .pw.              appears in Playwright starter templates
 *
 * Adding a convention must mean adding it HERE, once.
 */
export const SPEC_FILENAME = /\.(spec|test|e2e|e2e-spec|cy|pw)\.[cm]?[tj]sx?$/;

/** Directories that conventionally hold tests, whatever the files inside are called. */
export const TEST_ROOT = /(^|\/)(tests?|e2e|__tests__|cypress|playwright|specs?|features)\//;
