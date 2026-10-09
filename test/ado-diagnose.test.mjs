import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, describeDiagnosis } from '../src/sinks/diagnose.mjs';

/**
 * ⚠️ READ THIS BEFORE CONCLUDING "it was only tested against a stub".
 *
 * Each test below provokes a failure that CANNOT BE PROVOKED ON A LIVE INSTANCE, even with full
 * access to one:
 *
 *   403 on Test Plans only  — you would have to issue a deliberately under-scoped PAT
 *   404 on a visible plan   — you would have to borrow someone else's permissions
 *   a stale suite fence     — you would have to reorganise a real plan and leave the scope behind
 *   203 + HTML              — you would have to revoke a token mid-call
 *   a transport failure      — you would have to break DNS
 *
 * So the stub is not a substitute for the live run here; it is the only way to reach these at all.
 * What a live run would add is narrow and named in docs/CONTRACTS.md: the WRITE path on a real plan.
 */

const OK_JSON = { 'content-type': 'application/json' };
const res = (status, body = {}, headers = OK_JSON) => ({
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
});

/** Route by URL substring; first match wins, so put the specific ones first. */
function stub(routes) {
    return async (url) => {
        for (const [match, r] of routes) if (url.includes(match)) return typeof r === 'function' ? r(url) : r;
        return res(200, { value: [] });
    };
}

const BASE = { org: 'o', project: 'p', pat: 'tok', planId: '764570' };
const rung = (d, id) => d.rungs.find((r) => r.id === id);

test('rung 1: an ABSENT token stops before any network call, and names the 203 trap', async () => {
    let called = false;
    const d = await diagnose({ ...BASE, pat: '', fetchImpl: async () => { called = true; return res(200); } });
    assert.equal(called, false, 'no request should be made without a credential');
    assert.equal(rung(d, 'credential').status, 'fail');
    assert.match(rung(d, 'credential').fix, /203/);
    // Everything below is SKIPPED, not failed — the distinction is the point of the ladder.
    assert.ok(d.rungs.filter((r) => r.status === 'skipped').length >= 5);
    assert.equal(d.rungs.filter((r) => r.status === 'fail').length, 1, 'exactly one rung fails; the rest were never reached');
});

test('⚠️ rung 1 never echoes the token — only its length and character class', async () => {
    const secret = 'wCorrectHorseBatteryStaple1234567890';
    const d = await diagnose({ ...BASE, pat: secret, fetchImpl: stub([['projects?', res(401)]]) });
    const all = JSON.stringify(d) + describeDiagnosis(d);
    assert.ok(!all.includes(secret), 'the token must not appear anywhere in the output');
    assert.ok(!all.includes(secret.slice(0, 8)), 'not even a prefix of it');
    assert.match(rung(d, 'credential').detail, new RegExp(`${secret.length} characters`));
});

for (const [bad, pattern] of [
    ['"tok"', /wrapped in quotes/],
    ['Basic OnRvaw==', /whole header/],
    ['$env:AZURE_TOKEN', /variable NAME/],
    [':tok', /starts with a colon/],
    ['tok\n', /whitespace/],
]) {
    test(`rung 1 recognises a paste error: ${JSON.stringify(bad)}`, async () => {
        const d = await diagnose({ ...BASE, pat: bad, fetchImpl: async () => res(200) });
        assert.equal(rung(d, 'credential').status, 'fail');
        assert.match(rung(d, 'credential').detail, pattern);
    });
}

test('rung 2: a TRANSPORT failure is not reported as an auth problem', async () => {
    // Reporting DNS or a TLS interceptor as 401 sends someone to re-issue a perfectly good token.
    const d = await diagnose({ ...BASE, fetchImpl: async () => { throw new Error('getaddrinfo ENOTFOUND dev.azure.com'); } });
    assert.equal(rung(d, 'organisation').status, 'fail');
    assert.match(rung(d, 'organisation').detail, /never completed/);
    assert.match(rung(d, 'organisation').fix, /transport, not authorisation/);
    assert.match(rung(d, 'organisation').fix, /do not change them/);
});

test('⛔ rung 2: a 203 with HTML is a sign-in page, NOT an empty result', async () => {
    const d = await diagnose({ ...BASE, fetchImpl: stub([['projects?', res(203, {}, { 'content-type': 'text/html' })]]) });
    assert.equal(rung(d, 'organisation').status, 'fail');
    assert.match(rung(d, 'organisation').detail, /sign-in page/);
});

test('rung 2: a 401 says it CANNOT be a scope problem — scope fails at rung 4', async () => {
    const d = await diagnose({ ...BASE, fetchImpl: stub([['projects?', res(401)]]) });
    assert.match(rung(d, 'organisation').fix, /CANNOT be a scope problem/);
});

test('rung 3: a 404 on the project says it is EITHER a name or permissions, and which is likelier', async () => {
    const d = await diagnose({
        ...BASE,
        fetchImpl: stub([['projects/p', res(404)], ['projects?', res(200, { value: [{ id: 1 }] })]]),
    });
    assert.equal(rung(d, 'organisation').status, 'pass');
    assert.equal(rung(d, 'project').status, 'fail');
    assert.match(rung(d, 'project').fix, /permissions the more likely/);
});

test('⛔ rung 4: a 403 on Test Plans is the CODE-ONLY PAT, and the ladder is what makes it legible', async () => {
    // The whole argument for walking the chain: this token is valid, resolves the org and the
    // project, and would clone repositories all day. One error message cannot say that.
    const d = await diagnose({
        ...BASE,
        fetchImpl: stub([
            ['test/plans/764570?', res(403)],
            ['projects/p', res(200, { name: 'p' })],
            ['projects?', res(200, { value: [{ id: 1 }] })],
        ]),
    });
    assert.equal(rung(d, 'organisation').status, 'pass');
    assert.equal(rung(d, 'project').status, 'pass');
    assert.equal(rung(d, 'plan').status, 'fail');
    assert.match(rung(d, 'plan').fix, /Test Management/);
    assert.match(rung(d, 'plan').fix, /cannot add a scope to an existing one/);
});

test('rung 4: a 404 on the plan leads with PERMISSIONS, not a typo', async () => {
    const d = await diagnose({
        ...BASE,
        fetchImpl: stub([
            ['test/plans/764570?', res(404)],
            ['projects/p', res(200)],
            ['projects?', res(200, { value: [{ id: 1 }] })],
        ]),
    });
    assert.match(rung(d, 'plan').fix, /Most likely PERMISSIONS/);
    assert.match(rung(d, 'plan').fix, /may be perfectly correct and simply invisible/);
});

/** A chain that passes every rung up to the one under test. */
const upToSuites = (suites, extra = []) => stub([
    ...extra,
    ['/suites?', res(200, { value: suites })],
    ['test/plans/764570?', res(200, { name: 'One Identity' })],
    ['projects/p', res(200, { name: 'p' })],
    ['projects?', res(200, { value: [{ id: 1 }] })],
]);

test('rung 4 passing is what PROVES the Test Management scope — it is not assumed', async () => {
    const d = await diagnose({ ...BASE, fetchImpl: upToSuites([{ id: 10, name: 'Drop1' }]) });
    assert.match(rung(d, 'plan').detail, /Test Management scope is present/);
});

test('rung 5: a plan reporting NO suites can never receive a result', async () => {
    const d = await diagnose({ ...BASE, fetchImpl: upToSuites([]) });
    assert.equal(rung(d, 'suites').status, 'fail');
    assert.match(rung(d, 'suites').fix, /no test points/);
});

test('⛔ rung 6: a STALE FENCE is caught, and the report lists the suites that DO exist', async () => {
    // The failure this command exists for. In normal use it is SILENT: the publish matches nothing,
    // writes nothing, and ticks every case.
    const d = await diagnose({
        ...BASE,
        suiteIds: ['865414', '865843'],
        fetchImpl: upToSuites([{ id: 900001, name: 'Drop1' }, { id: 900002, name: 'Drop2' }]),
    });
    assert.equal(rung(d, 'suites').status, 'pass');
    assert.equal(rung(d, 'fence').status, 'fail');
    assert.match(rung(d, 'fence').detail, /2 of 2 scoped suite id\(s\) are NOT in plan/);
    // Naming the problem is half the job; the next question is always "then what should it be?".
    assert.match(rung(d, 'fence').fix, /900001 \(Drop1\)/);
    assert.match(rung(d, 'fence').fix, /900002 \(Drop2\)/);
    assert.match(rung(d, 'fence').fix, /reports success/);
    assert.equal(rung(d, 'points').status, 'skipped', 'points were never reached, so they are not "passing"');
});

test('rung 6: a PARTIALLY stale fence still fails, and names only the stale half', async () => {
    const d = await diagnose({
        ...BASE,
        suiteIds: ['900001', '865843'],
        fetchImpl: upToSuites([{ id: 900001, name: 'Drop1' }]),
    });
    assert.match(rung(d, 'fence').detail, /1 of 2/);
    assert.match(rung(d, 'fence').detail, /865843/);
    assert.ok(!/NOT in plan 764570: 900001/.test(rung(d, 'fence').detail), 'the valid id must not be blamed');
});

test('rung 6: NO fence passes, but says plainly that every suite gets written', async () => {
    const d = await diagnose({ ...BASE, fetchImpl: upToSuites([{ id: 10 }, { id: 11 }]) });
    assert.equal(rung(d, 'fence').status, 'pass');
    assert.match(rung(d, 'fence').detail, /EVERY suite/);
});

test('rung 7: a case that resolves to no point FAILS rather than being published to a guess', async () => {
    const d = await diagnose({
        ...BASE,
        caseIds: ['865914', '865792'],
        fetchImpl: upToSuites([{ id: 10 }], [['Suites/10/points', res(200, { value: [{ id: 1, testCase: { id: '865914' } }] })]]),
    });
    assert.equal(rung(d, 'points').status, 'fail');
    assert.match(rung(d, 'points').detail, /865792/);
    assert.ok(!/865914/.test(rung(d, 'points').detail), 'the case that DID resolve must not be listed as missing');
    assert.match(rung(d, 'points').fix, /Never publish to a guessed point/);
});

test('rung 7: a case in SEVERAL suites passes but warns — every point gets written', async () => {
    const d = await diagnose({
        ...BASE,
        caseIds: ['865914'],
        fetchImpl: upToSuites([{ id: 10 }, { id: 11 }], [
            ['Suites/10/points', res(200, { value: [{ id: 1, testCase: { id: '865914' } }] })],
            ['Suites/11/points', res(200, { value: [{ id: 2, testCase: { id: '865914' } }] })],
        ]),
    });
    assert.equal(rung(d, 'points').status, 'pass');
    assert.match(rung(d, 'points').detail, /suite 10 \+ 11/);
    assert.match(rung(d, 'points').detail, /MORE THAN ONE suite/);
});

test('rung 7: it also reads testCaseReference.id — the shape differs by endpoint', async () => {
    const d = await diagnose({
        ...BASE,
        caseIds: ['77'],
        fetchImpl: upToSuites([{ id: 10 }], [['Suites/10/points', res(200, { value: [{ id: 1, testCaseReference: { id: '77' } }] })]]),
    });
    assert.equal(rung(d, 'points').status, 'pass');
});

test('a fully clean chain reports ok, and every rung says what it PROVED', async () => {
    const d = await diagnose({
        ...BASE,
        suiteIds: ['10'],
        caseIds: ['865914'],
        fetchImpl: upToSuites([{ id: 10, name: 'Drop1' }], [['Suites/10/points', res(200, { value: [{ id: 1, testCase: { id: '865914' } }] })]]),
    });
    assert.equal(d.ok, true);
    assert.deepEqual(d.rungs.map((r) => r.status), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
    const out = describeDiagnosis(d);
    assert.match(out, /resolves end to end/);
    assert.ok(!out.includes('⤷ fix:'), 'a clean chain offers no fixes, because nothing is broken');
    assert.ok(d.rungs.every((r) => r.fix === undefined), 'nor should any rung carry one');
    // ⚠️ The fix marker must not collide with rung 7's own "case → suite" arrow. It did.
    assert.match(out, /865914 → suite 10/);
});

test('describeDiagnosis names the rung that broke and says the rest is UNANSWERED', async () => {
    const d = await diagnose({ ...BASE, pat: '', fetchImpl: async () => res(200) });
    const out = describeDiagnosis(d);
    assert.match(out, /breaks at rung 1 \(credential\)/);
    assert.match(out, /unanswered, not passing/);
});

test('⛔ no rung issues a write — a diagnosis must never mutate a test plan', async () => {
    const methods = [];
    await diagnose({
        ...BASE, suiteIds: ['10'], caseIds: ['865914'],
        fetchImpl: async (url, opts = {}) => {
            methods.push(opts.method ?? 'GET');
            if (url.includes('/suites?')) return res(200, { value: [{ id: 10 }] });
            if (url.includes('points')) return res(200, { value: [{ id: 1, testCase: { id: '865914' } }] });
            return res(200, { value: [{ id: 1 }], name: 'x' });
        },
    });
    assert.deepEqual([...new Set(methods)], ['GET'], `a diagnosis must be read-only: saw ${methods.join(',')}`);
});

/**
 * ⚠️ EVERY TEST ABOVE USES A STUB `fetch`, AND THAT IS ITS OWN BLIND SPOT.
 *
 * A hand-written stub resembles whatever I assumed `fetch` does. If the assumption is wrong — the
 * Headers object is case-sensitive after all, `res.json()` behaves differently on a 203, a status I
 * treat as reachable actually throws — then all 24 tests above pass against a fiction, and the
 * ladder fails the first time it meets a real server. That is exactly the failure mode this whole
 * project exists to name: a proof that cannot fail.
 *
 * So the ladder also runs through the REAL global `fetch`, against a loopback server returning the
 * ADO response shapes. No fetchImpl is passed. This is the nearest honest thing to a live run that
 * does not need anyone's credential.
 */
import { createServer } from 'node:http';

async function withServer(handler, fn) {
    const server = createServer(handler);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try { return await fn(baseUrl); } finally { await new Promise((r) => server.close(r)); }
}

test('🔌 through the REAL fetch: a clean chain resolves end to end against a loopback server', async () => {
    const result = await withServer((req, res) => {
        const json = (body) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
        if (req.url.includes('/_apis/projects?')) return json({ value: [{ id: 'x' }] });
        if (req.url.includes('/_apis/projects/')) return json({ name: 'One Identity' });
        if (req.url.includes('/suites?')) return json({ value: [{ id: 900001, name: 'Drop1' }] });
        if (req.url.includes('/points?')) return json({ value: [{ id: 5, testCase: { id: '700001' } }] });
        if (req.url.includes('/test/plans/')) return json({ name: 'Progression' });
        res.writeHead(404); res.end('{}');
    }, (baseUrl) => diagnose({
        org: 'o', project: 'p', pat: 'a-real-looking-token', planId: '764570',
        suiteIds: ['900001'], caseIds: ['700001'], baseUrl,   // NB: no fetchImpl — the real one
    }));
    assert.equal(result.ok, true, describeDiagnosis(result));
    assert.deepEqual(result.rungs.map((r) => r.status), ['pass', 'pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
    assert.match(result.rungs.find((r) => r.id === 'points').detail, /700001 → suite 900001/);
});

test('🔌 through the REAL fetch: a 203 + HTML sign-in page is still refused, not parsed as empty', async () => {
    // The assumption most worth checking against a real server: that a 203 is "reachable, not JSON"
    // rather than something fetch treats as an error. If this diverged, the single most dangerous
    // ADO response would sail through as zero results.
    const result = await withServer((req, res) => {
        res.writeHead(203, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<html><body>Sign in to Azure DevOps</body></html>');
    }, (baseUrl) => diagnose({ org: 'o', project: 'p', pat: 'tok', planId: '1', baseUrl }));
    assert.equal(result.ok, false);
    const org = result.rungs.find((r) => r.id === 'organisation');
    assert.equal(org.status, 'fail');
    assert.match(org.detail, /sign-in page/);
    assert.match(org.detail, /203/);
});

test('🔌 through the REAL fetch: a CLOSED port is a transport failure, not a 401', async () => {
    // Real fetch throws a TypeError here. A stub cannot tell me whether I handle that or crash.
    const port = await withServer(() => {}, (b) => Number(b.split(':').pop()));
    const result = await diagnose({ org: 'o', project: 'p', pat: 'tok', planId: '1', baseUrl: `http://127.0.0.1:${port}` });
    const org = result.rungs.find((r) => r.id === 'organisation');
    assert.equal(org.status, 'fail');
    assert.match(org.detail, /never completed/);
    assert.match(org.fix, /transport, not authorisation/);
});

test('🔌 through the REAL fetch: a 403 on Test Plans alone still reads as the scope problem', async () => {
    const result = await withServer((req, res) => {
        if (req.url.includes('/test/plans/')) { res.writeHead(403, { 'content-type': 'application/json' }); res.end('{}'); return; }
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ value: [{ id: 'x' }], name: 'p' }));
    }, (baseUrl) => diagnose({ org: 'o', project: 'p', pat: 'tok', planId: '764570', baseUrl }));
    assert.deepEqual(result.rungs.slice(0, 3).map((r) => r.status), ['pass', 'pass', 'pass']);
    assert.match(result.rungs.find((r) => r.id === 'plan').fix, /Test Management/);
});

test('wrapping keeps the DELIBERATE newlines — rung 6 puts the suite list on its own line', async () => {
    const d = await diagnose({
        org: 'o', project: 'p', pat: 'tok', planId: '764570', suiteIds: ['865843'],
        fetchImpl: upToSuites([{ id: 900001, name: 'Drop1' }]),
    });
    const out = describeDiagnosis(d, { width: 70 });
    assert.ok(out.split('\n').every((l) => l.length <= 100), 'no line should run off a terminal');
    assert.match(out, /The suites that DO exist/);
});
