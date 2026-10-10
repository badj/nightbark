import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintOf, canonicalForm } from '../src/triage/fingerprint.mjs';
import { normalise, explain, RULES } from '../src/triage/normalise.mjs';
import { messageTemplate, topFrames, urlPattern, statusCode, exceptionType, TEMPLATE_STR_MIN } from '../src/triage/anchors.mjs';

/**
 * THE FIVE FINGERPRINT STABILITY ASSERTIONS, taken verbatim from the ai-bug-triage discipline.
 *
 * They are the load-bearing part: tests 1-3 must COLLAPSE to one hash, tests 4-5 must stay DISTINCT.
 * A failure here means normalisation is either leaking noise into the hash or stripping a stable
 * anchor, and no amount of cluster tuning fixes that.
 *
 * ⚠️ Per ADR-0002 this is why the discipline is code here rather than prose. Prose can hold a
 * contradiction forever; an executable spec cannot. See the Test 5 note below — the written rules
 * and the written test disagree, and that only became visible on the first run.
 */

const fp = (s) => fingerprintOf(s).fingerprint;

test('Test 1 — same error, different TIMESTAMPS → same fingerprint', () => {
    const a = '2025-03-22T14:00:00Z Error: timeout at checkout.ts:42';
    const b = '2025-03-23T09:15:30Z Error: timeout at checkout.ts:42';
    assert.equal(fp(a), fp(b));
    assert.ok(fp(a), 'and it must actually produce one');
});

test('Test 2 — same error, different PIDs and PORTS → same fingerprint', () => {
    const a = '[pid=1234] ECONNREFUSED 127.0.0.1:54321';
    const b = '[pid=5678] ECONNREFUSED 127.0.0.1:61234';
    assert.equal(normalise(a), normalise(b), 'normalisation must erase both');
    assert.equal(fp(a), fp(b));
});

test('Test 3 — same error, different LINE NUMBERS (code edited) → same fingerprint', () => {
    // The subtle one: line numbers are stable within a build and useless across builds. Keyed on
    // them, a whitespace edit above the throw reads as a brand-new bug.
    const a = 'TypeError: boom at processOrder (src/order.ts:142)';
    const b = 'TypeError: boom at processOrder (src/order.ts:158)';
    assert.equal(fp(a), fp(b));
    assert.deepEqual(topFrames(a), topFrames(b));
});

test('Test 4 — DIFFERENT errors → different fingerprints', () => {
    const a = "TypeError: Cannot read property 'id' of undefined";
    const b = 'RangeError: Maximum call stack size exceeded';
    assert.notEqual(fp(a), fp(b));
});

test("⛔ Test 5 — same type, different PROPERTY → different fingerprints (the spec's own contradiction)", () => {
    // Step 2b of the written rules says "replace quoted strings with <STR>". Test 5 says these two
    // must NOT collide. Both cannot hold: 'name' and 'email' ARE quoted strings, so the literal rule
    // collapses them and this assertion fails — which is exactly what happened on the first run.
    //
    // Resolved by LENGTH (see TEMPLATE_STR_MIN): a short quoted token is part of the template and
    // says WHICH property is missing; a long quoted string is a specific and belongs behind <STR>.
    const a = "TypeError: Cannot read property 'name' of undefined";
    const b = "TypeError: Cannot read property 'email' of undefined";
    assert.notEqual(fp(a), fp(b), 'a different missing property is a different bug');
});

test('…and the LITERAL rule would break Test 5 — locking in why the threshold exists', () => {
    // Guards the resolution itself. If someone "simplifies" messageTemplate back to stripping every
    // quoted string, Test 5 above fails — but this test says WHY, so the next reader does not
    // rediscover the contradiction from scratch.
    const literal = (s) => s.replace(/(['"`])(.*?)\1/g, '<STR>');
    assert.equal(
        literal("Cannot read property 'name' of undefined"),
        literal("Cannot read property 'email' of undefined"),
        'the literal Step 2b rule really does collapse them — the contradiction is real, not a misreading',
    );
    // And the threshold still does its job on an actual specific.
    assert.match(messageTemplate("Invalid token 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'", null), /<STR>/);
    assert.ok(TEMPLATE_STR_MIN > 5, 'short identifiers must survive');
});

// ── the anchors themselves ─────────────────────────────────────────────────────────────────────

test('node_modules frames are dropped — they are identical for every framework failure', () => {
    const frames = topFrames('at processOrder (src/order.ts:1) at Runner._run (node_modules/@playwright/test/lib/x.js:9)');
    assert.deepEqual(frames, ['processOrder(order.ts)']);
});

test('URL path ids collapse so one endpoint is one anchor', () => {
    assert.equal(urlPattern('POST /api/users/4821/orders?page=2'), 'POST /api/users/<ID>/orders');
    assert.equal(urlPattern('GET /api/users/550e8400-e29b-41d4-a716-446655440000'), 'GET /api/users/<ID>');
});

test('the most SPECIFIC exception type wins, not a bare Error', () => {
    assert.equal(exceptionType('Uncaught TypeError: x'), 'TypeError');
    assert.equal(exceptionType('Error: plain'), 'Error');
    assert.equal(exceptionType('Process completed with exit code 137'), '137');
});

test('status code is read from any of the three documented shapes', () => {
    assert.equal(statusCode('status_code=500'), '500');
    assert.equal(statusCode('HTTP/1.1 429'), '429');
    assert.equal(statusCode('503 Internal Server Error'), '503');
});

// ── the properties that make a fingerprint usable at all ───────────────────────────────────────

test('⚠️ an UNPARSEABLE failure is reported as unanchored, not given a shared hash', () => {
    // Otherwise every failure nothing could be extracted from lands in one giant false cluster, and
    // the dedup rate looks wonderful while being meaningless.
    const r = fingerprintOf('   ');
    assert.equal(r.fingerprint, null);
    assert.equal(r.unanchored, true);
});

test('empty anchors are OMITTED, so improving the parser cannot invalidate stored fingerprints', () => {
    const c = canonicalForm({ exceptionType: 'TypeError', messageTemplate: 'boom', frames: [], testName: null, urlPattern: null, statusCode: null });
    assert.equal(c, 'TypeError|boom');
    assert.ok(!c.includes('||'), 'no empty fields');
});

test('deterministic across calls — the property that makes this not an LLM job', () => {
    const s = 'TypeError: Cannot read property \'id\' of undefined at processOrder (order.ts:12)';
    const runs = new Set(Array.from({ length: 50 }, () => fp(s)));
    assert.equal(runs.size, 1);
    assert.match([...runs][0], /^[0-9a-f]{16}$/);
});

test('every normalisation rule is NAMED, so a surprising fingerprint can be explained', () => {
    // Without this, "why did these two land in different clusters" means re-reading ten regexes.
    const { applied } = explain('2025-01-01T00:00:00Z pid=9 at 127.0.0.1:8080 /tmp/x/y.log 0xdeadbeef12');
    for (const r of ['timestamp', 'pid', 'port', 'tmppath', 'address']) {
        assert.ok(applied.includes(r), `rule "${r}" did not fire`);
    }
    assert.equal(new Set(RULES.map((r) => r[0])).size, RULES.length, 'rule names must be unique');
});

// ── Step 4: clustering ─────────────────────────────────────────────────────────────────────────

import { WEIGHTS, MERGE_THRESHOLD, REVIEW_FLOOR, similarity, cluster, levenshtein, jaccard } from '../src/triage/cluster.mjs';

test('⚠️ the clustering weights sum to EXACTLY 1.00 — the thresholds are calibrated to that', () => {
    // Required by the discipline, and asserted rather than intended: bump one weight and 0.75 means
    // a different bar, with nothing to announce the change.
    const total = Object.values(WEIGHTS).reduce((s, v) => s + v, 0);
    assert.equal(Number(total.toFixed(10)), 1);
    assert.ok(MERGE_THRESHOLD > REVIEW_FLOOR, 'the merge bar must sit above the review floor');
});

test('an identical pair scores 1.00 and reads as duplicate', () => {
    const a = { exceptionType: 'TypeError', messageTemplate: "Cannot read property 'id' of undefined", frames: ['processOrder(order.ts)'], testName: 'checkout.spec.ts > pays' };
    const s = similarity(a, { ...a });
    assert.equal(s.score, 1);
    assert.equal(s.verdict, 'duplicate');
});

test('a different exception type cannot reach the merge bar on its own', () => {
    // 0.30 is the largest single weight, so losing it must drop the pair below 0.75 even when
    // everything else agrees — otherwise a TypeError and a RangeError could be "merged".
    const a = { exceptionType: 'TypeError', messageTemplate: 'boom', frames: ['f(x.ts)'], testName: 'a.spec.ts > t' };
    const s = similarity(a, { ...a, exceptionType: 'RangeError' });
    assert.ok(s.score < MERGE_THRESHOLD, `scored ${s.score}`);
    assert.equal(s.parts.exceptionType, 0);
});

test('⛔ clustering SUGGESTS and never merges — a wrong merge hides a live bug', () => {
    const mk = (over) => ({ fingerprint: over.fp, anchors: { exceptionType: 'TypeError', messageTemplate: 'boom', frames: ['f(x.ts)'], testName: 'a.spec.ts > t', ...over.a } });
    const { groups, links } = cluster([
        mk({ fp: 'aaa1', a: {} }), mk({ fp: 'aaa1', a: {} }),      // exact duplicates
        mk({ fp: 'bbb2', a: { testName: 'a.spec.ts > other' } }),  // near duplicate
        mk({ fp: 'ccc3', a: { exceptionType: 'SyntaxError', messageTemplate: 'totally different', frames: ['z(q.ts)'], testName: 'z.spec.ts > q' } }),
    ]);
    assert.equal(groups.length, 3, 'exact fingerprints collapse first');
    assert.equal(groups[0].count, 2, 'and the biggest group leads');
    assert.ok(links.some((l) => l.a === 'aaa1' && l.b === 'bbb2'), 'the near-duplicate is LINKED');
    assert.ok(!links.some((l) => l.b === 'ccc3'), 'the unrelated failure is not');
    // Every link must carry its score AND the breakdown that produced it.
    for (const l of links) {
        assert.ok(l.score >= REVIEW_FLOOR);
        assert.deepEqual(Object.keys(l.parts).sort(), Object.keys(WEIGHTS).sort());
    }
});

test('unanchored failures are kept ASIDE, never pooled into one cluster', () => {
    const { groups, unanchored } = cluster([{ fingerprint: null, anchors: {} }, { fingerprint: null, anchors: {} }]);
    assert.equal(groups.length, 0);
    assert.equal(unanchored.length, 2, 'two unparseable failures are not "the same bug"');
});

test('levenshtein and jaccard behave at the edges', () => {
    assert.equal(levenshtein('abc', 'abc'), 0);
    assert.equal(levenshtein('', 'abc'), 3);
    assert.equal(levenshtein('kitten', 'sitting'), 3);
    assert.equal(jaccard([], []), 0);
    assert.equal(jaccard(['a'], ['a']), 1);
    assert.equal(jaccard(['a', 'b'], ['b', 'c']), 1 / 3);
});

// ── reading real reports ───────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as joinPath } from 'node:path';
import { readFailures, triage } from '../src/triage/index.mjs';
import { triageBrief } from '../src/triage/brief.mjs';

const tmp = () => mkdtempSync(joinPath(tmpdir(), 'nb-triage-'));

test('⛔ NESTED Playwright suites are read — the reference extractor misses them', () => {
    // The discipline's own TypeScript loops report.suites one level deep. Playwright nests: a file's
    // suite contains a describe's suite contains the specs. One level deep silently skips every
    // failure inside a describe block, and a triage tool that sees a third of the failures is worse
    // than none because the board looks short.
    const dir = tmp();
    const report = joinPath(dir, 'report.json');
    writeFileSync(report, JSON.stringify({
        suites: [{
            title: 'checkout.spec.ts',
            specs: [{ title: 'top level', file: 'checkout.spec.ts', tests: [{ results: [{ status: 'failed', error: { message: 'TypeError: a' } }] }] }],
            suites: [{
                title: 'when logged in',
                specs: [{ title: 'nested one', file: 'checkout.spec.ts', tests: [{ results: [{ status: 'failed', error: { message: 'TypeError: b' } }] }] }],
                suites: [{
                    title: 'and seated',
                    specs: [{ title: 'nested two', file: 'checkout.spec.ts', tests: [{ results: [{ status: 'failed', error: { message: 'TypeError: c' } }] }] }],
                }],
            }],
        }],
    }));
    const failures = readFailures(report);
    assert.equal(failures.length, 3, 'all three depths must be found');
    assert.deepEqual(failures.map((f) => f.testName), [
        'checkout.spec.ts > top level',
        'checkout.spec.ts > when logged in > nested one',
        'checkout.spec.ts > when logged in > and seated > nested two',
    ]);
});

test('a test that PASSED ON RETRY is captured as flaky, not skipped', () => {
    // The only mechanical evidence of flakiness in a report, and it is lost once the report is gone.
    const dir = tmp();
    const report = joinPath(dir, 'r.json');
    writeFileSync(report, JSON.stringify({
        suites: [{
            title: 'a.spec.ts',
            specs: [{ title: 'flaked', tests: [{ results: [{ status: 'failed', error: { message: 'Error: timeout' } }, { status: 'passed' }] }] }],
        }],
    }));
    const [f] = readFailures(report);
    assert.equal(f.isFlaky, true);
    assert.equal(f.retries, 1);
    assert.match(f.error, /timeout/, 'the FIRST result carries the original failure, not the retry');

    const { groups } = triage([f]);
    assert.equal(groups[0].flakyRate, 1);
    assert.equal(groups[0].retried, true);
});

test('a test that passed first time is NOT a failure', () => {
    const dir = tmp();
    const report = joinPath(dir, 'r.json');
    writeFileSync(report, JSON.stringify({
        suites: [{ title: 'a.spec.ts', specs: [{ title: 'green', tests: [{ results: [{ status: 'passed' }] }] }] }],
    }));
    assert.deepEqual(readFailures(report), []);
});

test('⚠️ an unreadable input THROWS — "0 failures" must not look like "I could not read it"', () => {
    const dir = tmp();
    const bad = joinPath(dir, 'bad.json');
    writeFileSync(bad, '{ not json');
    assert.throws(() => readFailures(bad), /not valid JSON/);

    const wrong = joinPath(dir, 'wrong.json');
    writeFileSync(wrong, JSON.stringify({ totally: 'different' }));
    assert.throws(() => readFailures(wrong), /not a shape I recognise/);
});

test('a plain JSON array and a raw log both read', () => {
    const dir = tmp();
    const arr = joinPath(dir, 'a.json');
    writeFileSync(arr, JSON.stringify([{ testName: 't', error: 'TypeError: x' }]));
    assert.equal(readFailures(arr).length, 1);

    const log = joinPath(dir, 'ci.log');
    writeFileSync(log, 'TypeError: boom at f (a.ts:1)');
    const [f] = readFailures(log);
    assert.match(f.error, /TypeError/);
});

test('the brief states what it will NOT do, and never pastes a raw log', () => {
    // Two failure modes of auto-triage: filing tickets nobody approved, and 500-line log dumps.
    const r = triage([
        { testName: 'a.spec.ts > one', error: "TypeError: Cannot read property 'id' of undefined", stack: 'at f (a.ts:1)' },
        { testName: 'b.spec.ts > two', error: "TypeError: Cannot read property 'id' of undefined", stack: 'at f (a.ts:9)' },
    ]);
    const md = triageBrief(r, { target: 'x', context: { branch: 'main' } });
    assert.match(md, /Recommend, do not decide/);
    assert.match(md, /a human decides whether these merge/);
    assert.match(md, /Normalised error/);
    assert.match(md, /Never invent a fingerprint/);
    assert.match(md, /branch=main/);
    // Every group's fingerprint must appear, so a judge can key answers to them.
    for (const g of r.groups) assert.ok(md.includes(g.fingerprint), `${g.fingerprint} missing from the brief`);
});
