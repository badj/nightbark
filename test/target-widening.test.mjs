import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPEC_FILENAME } from '../src/testfiles.mjs';
import fixedWait from '../src/gates/fixed-wait.mjs';
import serialised from '../src/gates/serialised-suite.mjs';
import traceability from '../src/gates/traceability.mjs';

/**
 * Regressions found by pointing the tool at four SHIPPED products — element-web, Ghost, cal.com and
 * Rocket.Chat — rather than at demos. Each test below is a defect that existed in nightbark and was
 * invisible until a real repository disagreed with it.
 *
 * They are tests rather than fixtures where the defect was in the PLUMBING (argument parsing, the
 * shared filename predicate) rather than in a gate's reading of a line.
 */

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'nightbark.mjs');
const run = (...args) => {
    try {
        return { out: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }), code: 0 };
    } catch (e) {
        return { out: (e.stdout ?? '') + (e.stderr ?? ''), code: e.status };
    }
};
const lines = (s) => s.split('\n');

// ── the predicate that made a gate blind ──────────────────────────────────────────────────────

test('⛔ SPEC_FILENAME accepts *.e2e.ts — cal.com names all 53 of its specs that way', () => {
    // The gate that missed these read ZERO of them and reported the repository clean.
    assert.ok(SPEC_FILENAME.test('apps/web/playwright/payment.e2e.ts'));
    assert.ok(SPEC_FILENAME.test('x/booking.e2e.tsx'));
    assert.ok(SPEC_FILENAME.test('x/login.e2e-spec.ts'), 'the Angular variant');
    assert.ok(SPEC_FILENAME.test('x/a.cy.js'), "Cypress's own default since v10");
    assert.ok(SPEC_FILENAME.test('x/a.pw.ts'));
    // still the common cases
    assert.ok(SPEC_FILENAME.test('x/a.spec.ts'));
    assert.ok(SPEC_FILENAME.test('x/a.test.mjs'));
    // and not plain source
    assert.ok(!SPEC_FILENAME.test('src/pages/Checkout.tsx'));
    assert.ok(!SPEC_FILENAME.test('playwright.config.ts'));
});

test('every gate uses the SHARED predicate — four private copies gave three answers', () => {
    // The point is not that each gate accepts .e2e.ts, it is that none of them decides for itself.
    for (const gate of [traceability, serialised]) {
        assert.ok(gate.appliesTo('apps/web/playwright/payment.e2e.ts'), `${gate.id} cannot see a *.e2e.ts spec`);
    }
    assert.ok(fixedWait.appliesTo('apps/web/playwright/payment.e2e.ts'));
});

// ── the silent flag ───────────────────────────────────────────────────────────────────────────

test('⛔ --fail-on=never is HONOURED, not silently dropped to the default', () => {
    // The parser read only `--name value`. `--fail-on=never` fell through to `error`, so a run
    // meant to be advisory would break builds and nothing would say why.
    const strict = run('audit', 'fixtures', '--fail-on', 'warning');
    const never = run('audit', 'fixtures', '--fail-on=never');
    assert.match(strict.out, /--fail-on warning/);
    assert.match(never.out, /--fail-on never/, 'the = form must reach the exit policy');
    assert.equal(never.code, 0, 'never must never breach');
});

test('both --gate forms scope the audit identically', () => {
    const eq = run('audit', 'fixtures', '--gate=fixed-wait');
    const sp = run('audit', 'fixtures', '--gate', 'fixed-wait');
    const only = (s) => lines(s).find((l) => l.includes('gate(s):'));
    assert.match(only(eq.out), /1 gate\(s\): fixed-wait/);
    assert.equal(only(eq.out), only(sp.out));
});

test('⚠️ an UNKNOWN flag exits non-zero instead of being ignored', () => {
    const r = run('audit', 'fixtures', '--only=fixed-wait');   // the typo that fooled the author
    assert.equal(r.code, 2);
    assert.match(r.out, /unknown flag\(s\) for "audit": --only/);
    assert.match(r.out, /this command takes: --gate, --sarif, --fail-on/);
    assert.match(r.out, /Refusing rather than ignoring/);
});

test('a valid flag set is NOT refused — the check must not block normal use', () => {
    assert.equal(run('audit', 'fixtures', '--gate', 'fixed-wait', '--fail-on', 'never').code, 0);
});

// ── poll loop vs iteration loop ───────────────────────────────────────────────────────────────

const check = (gate, src, path = 'a.spec.ts') => gate.check({ path, text: src, lines: src.split('\n') }).map((f) => f.line);

test('⛔ a sleep inside an ITERATION loop still fires — the false negative a fix introduced', () => {
    // Ghost's visual-regression baselines. Suppressed for a while because SOME enclosing loop
    // existed; iterating a fixed list re-tests nothing, so the sleep is as fixed as any other.
    const src = [
        'for (const screen of SCREENS) {',
        "  test('baseline', async ({ page }) => {",
        '    await page.addStyleTag({ content: HIDE });',
        '    await page.waitForTimeout(500);',
        '  });',
        '}',
    ].join('\n');
    assert.deepEqual(check(fixedWait, src), [4]);
});

test('a sleep inside a DEADLINE poll stays silent, however deep the nesting', () => {
    // The shape that fired on a real mail client: the loop header is fourteen lines up, with a
    // nested if/else in between, and the sleep is a named helper.
    const src = [
        'async function waitForMessages(client, want, timeoutMs = 5000) {',
        '  const deadline = Date.now() + timeoutMs;',
        '  while (Date.now() < deadline) {',
        '    const messages = await client.search();',
        '    if (want === undefined) {',
        '      if (messages.length > 0) {',
        '        return messages;',
        '      }',
        '    } else {',
        '      if (messages.length === want) {',
        '        return messages;',
        '      }',
        '    }',
        '',
        '    await delay(500);',
        '  }',
        "  throw new Error('Timeout');",
        '}',
    ].join('\n');
    assert.deepEqual(check(fixedWait, src), []);
});

test('a sleep in a route handler is the STIMULUS, not a wait', () => {
    const src = [
        "await page.route('**/fetch', async (route, request) => {",
        '  await new Promise((resolve) => setTimeout(resolve, 1000));',
        '  await route.continue();',
        '});',
    ].join('\n');
    assert.deepEqual(check(fixedWait, src), []);
});

test('…but a sleep AFTER the handler has handed back is a real finding again', () => {
    // The guard must not swallow the rest of the file once it has seen a .route( call.
    const src = [
        "await page.route('**/fetch', (route) => route.continue());",
        "await page.goto('/home');",
        '',
        '',
        '',
        'await page.waitForTimeout(3000);',
    ].join('\n');
    assert.deepEqual(check(fixedWait, src), [6]);
});

test('the deadline arm of a race is a timeout, not a sleep', () => {
    const src = [
        'const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000)).then(() => {',
        "  throw new Error('Timeout waiting for membership');",
        '});',
        'await Promise.race([readyPromise, timeoutPromise]);',
    ].join('\n');
    assert.deepEqual(check(fixedWait, src), []);
});

// ── serialised-suite: two different defects ───────────────────────────────────────────────────

test('⛔ describe.serial is a BLOCK-level note, not a suite-wide warning', () => {
    // 92 of 98 findings on Rocket.Chat were this shape. Files still run in parallel, so the
    // "standing cost on every run" claim is simply false of it.
    const src = ["test.describe.serial('Threads', () => {", '});', "test.describe.serial('Threads - small', () => {", '});'].join('\n');
    const found = serialised.check({ path: 'threads.spec.ts', text: src, lines: src.split('\n') });
    assert.equal(found.length, 1, 'reported ONCE per file, not once per block');
    assert.equal(found[0].severity, 'note');
    assert.match(found[0].message, /2 serial block\(s\)/);
    assert.match(found[0].message, /files still run in parallel/);
    assert.match(found[0].message, /SKIPS the remaining tests/, 'the real defect it points at');
});

test('workers: 1 stays a suite-level warning with no severity override', () => {
    const src = ['export default defineConfig({', '  workers: 1,', '});'].join('\n');
    const found = serialised.check({ path: 'playwright.config.ts', text: src, lines: src.split('\n') });
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, undefined, 'inherits the gate severity (warning)');
    assert.match(found[0].message, /the suite runs serially/);
});

test('⚠️ a rule MESSAGE about describe.serial is not a serial suite', () => {
    // Ghost's ESLint config. Second gate to need string-stripping; the first learned it from a
    // pooled phone number quoted inside a diagnostic.
    const src = "      'test.describe.serial() is deprecated. Use test.describe.configure({mode: \"serial\"}) if needed.',";
    assert.deepEqual(check(serialised, src, 'eslint.config.js'), []);
});

test("…but a short quoted VALUE still matches — stripping every string would blind the gate", () => {
    // The trap in the fix: `mode: 'serial'` is the value being detected, not prose about it.
    const src = ['test.describe.configure({ mode: \'serial\' });'].join('\n');
    const found = serialised.check({ path: 'a.spec.ts', text: src, lines: [src] });
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'note');
});

test('CI boilerplate is still exempt — it appears in a large share of real repos', () => {
    assert.deepEqual(check(serialised, '  workers: process.env.CI ? 1 : undefined,', 'playwright.config.ts'), []);
});

// ── the runner must honour a file gate's own severity ─────────────────────────────────────────

test('⚠️ a FILE gate may lower its own severity, like a project gate already could', async () => {
    const { audit } = await import('../src/runner.mjs');
    const { findings } = audit('fixtures', { only: ['serialised-suite'] });
    // The fires fixture is a config, so it reports at gate severity; the asymmetry this guards
    // against was a file gate's per-finding severity being silently discarded.
    assert.ok(findings.length > 0, 'the fixture must produce something to assert on');
    assert.ok(findings.every((f) => ['error', 'warning', 'note'].includes(f.severity)));
});

// ── the proof harness itself ───────────────────────────────────────────────────────────────────

test('⛔ fixtures.expect is enforced for FILE gates too, not only project gates', async () => {
    // The check lived inside the project-gate branch and nowhere else, so declaring expect on a
    // file gate was accepted by validateGate and then silently ignored — blinding fixed-wait's
    // matcher took its fires fixture from 4 findings to 2 and selftest still exited 0.
    //
    // A declaration that does nothing is worse than no declaration: it reads as protection.
    const { selftest } = await import('../src/selftest.mjs');
    const { gates } = await import('../src/gates/index.mjs');

    for (const g of gates) {
        assert.equal(typeof g.fixtures.expect, 'number', `${g.id} must declare fixtures.expect`);
    }
    const results = selftest();
    const fires = results.filter((r) => r.kind === 'fires');
    assert.ok(fires.length >= 4);
    // Every passing fires proof must say the count was checked, on BOTH kinds of gate.
    for (const r of fires) {
        assert.ok(r.ok, `${r.gate} fires: ${r.detail}`);
        assert.match(r.detail, /exactly as declared/, `${r.gate} did not have its count enforced`);
    }
});

test('a declared count that does not match FAILS the proof, with a direction', async () => {
    const { selftest } = await import('../src/selftest.mjs');
    const { gates } = await import('../src/gates/index.mjs');
    const victim = gates.find((g) => g.id === 'fixed-wait');
    const real = victim.fixtures.expect;
    try {
        victim.fixtures.expect = real + 1;          // claim one more fault than the fixture plants
        const r = selftest().find((x) => x.gate === 'fixed-wait' && x.kind === 'fires');
        assert.equal(r.ok, false);
        assert.match(r.detail, /faults are being MISSED/, 'it must say WHICH direction is wrong');
        victim.fixtures.expect = Math.max(1, real - 1);
        const r2 = selftest().find((x) => x.gate === 'fixed-wait' && x.kind === 'fires');
        assert.equal(r2.ok, false);
        assert.match(r2.detail, /something extra is firing/);
    } finally {
        victim.fixtures.expect = real;
    }
});
