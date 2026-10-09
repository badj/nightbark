/**
 * ONE pipeline definition. Two platforms.
 *
 * Per docs/INTEGRATIONS.md both GitHub Actions and Azure Pipelines are first-class, generated from
 * a single source rather than maintained as two files that drift.
 *
 * ⚠️ A GENERATOR, NOT A LOWEST COMMON DENOMINATOR. The temptation is to emit the intersection of
 * what both platforms do and call it portable; the result is a pipeline that is worse than either
 * platform's idioms and that nobody wants to use. So each emitter is free to use what its platform
 * is good at — `actions/*` and the Checks API on one side, task groups and variable groups on the
 * other — and the shared part is the *intent*: these steps, in this order, with these outputs.
 *
 * ⚠️ AND THE OUTPUT IS COMMITTED, which creates the real hazard. A generated file that lives in the
 * repo WILL drift from its source the first time somebody edits the YAML directly — and a generator
 * people have stopped trusting is worse than two hand-written files, because the drift is invisible.
 * So `gen-ci.mjs --check` regenerates and diffs, and that check runs as part of the selftest. The
 * generator is only as good as the thing that proves its output is current.
 */

export const pipeline = {
    name: 'nightbark',
    node: '22',

    triggers: {
        push: ['main'],
        pullRequest: ['main'],
    },

    steps: [
        {
            id: 'selftest',
            label: 'Prove every gate can fire, and is specific',
            run: 'node bin/nightbark.mjs selftest',
            // ⚠️ The most important step in the file. A gate that cannot fail reports compliance it
            // never verified, so this runs BEFORE anything is audited with those gates.
            failsBuild: true,
        },
        {
            id: 'selfcheck',
            label: 'ADR-0001: no client-identifying content',
            run: 'node bin/nightbark.mjs selfcheck',
            failsBuild: true,
        },
        {
            id: 'ci-sync',
            label: 'The committed CI files still match their definition',
            run: 'node scripts/gen-ci.mjs --check',
            failsBuild: true,
        },
        {
            id: 'unit',
            label: 'Output-format and merge tests',
            run: 'node --test "test/*.test.mjs"',
            failsBuild: true,
        },
        {
            id: 'self-audit',
            label: 'Audit our own test fixtures (dogfood, and proves audit runs headless)',
            // Deliberately audits the FIXTURES: they contain known defects on purpose, so a run that
            // finds nothing there means the tool is broken, not that the repo is clean.
            run: 'node bin/nightbark.mjs audit fixtures --sarif nightbark.sarif --fail-on never',
            failsBuild: false,
            artifact: { path: 'nightbark.sarif', name: 'nightbark-sarif' },
            sarif: 'nightbark.sarif',
        },
    ],
};
