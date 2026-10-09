import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adoSink } from '../src/sinks/ado.mjs';
import { describePublish, publishFailed } from '../src/sinks/sink.mjs';

/**
 * Contract tests against a stub implementing the DOCUMENTED Azure DevOps REST shapes.
 *
 * ⚠️ These do not prove the adapter works against a live instance, and the README says so. What they
 * do prove is the set of things that actually break in an API client: URL construction, the PAT
 * encoding, the pagination loop, error discrimination, and — most importantly — that a zero-match
 * publish fails loudly.
 *
 * That last one is BETTER tested here than live: a stub can be told to return no matching points on
 * demand, and a real plan cannot. It is also the exact silent failure seen in the wild — a scoped
 * publish writing nothing while reporting every case as ✅.
 */

/** A stub fetch. `routes` maps a URL substring to a response. */
function stubFetch(routes, log = []) {
    return async (url, opts = {}) => {
        log.push({ url, method: opts.method ?? 'GET', headers: opts.headers, body: opts.body });
        for (const [match, make] of Object.entries(routes)) {
            if (url.includes(match)) {
                const r = typeof make === 'function' ? make(url, opts) : make;
                return {
                    ok: (r.status ?? 200) < 400,
                    status: r.status ?? 200,
                    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? (r.type ?? 'application/json') : null) },
                    json: async () => r.body ?? {},
                };
            }
        }
        throw new Error(`stub has no route for ${url}`);
    };
}

const SUITES = { body: { value: [{ id: 10 }, { id: 11 }] } };
const pointsIn = (suiteId, caseIds) => ({
    body: { value: caseIds.map((c, i) => ({ id: Number(`${suiteId}${i}`), testCase: { id: String(c) } })) },
});

const base = (routes, log) => adoSink({ org: 'o', project: 'p', pat: 'tok', fetchImpl: stubFetch(routes, log) });

test('the PAT is sent as Basic auth with an EMPTY username — the colon is required', () => {
    const log = [];
    const sink = base({ 'suites': SUITES, 'points': pointsIn(10, []) }, log);
    return sink.resolve({ caseId: '1', planId: '99' }).then(() => {
        const sent = log[0].headers.authorization;
        assert.equal(sent, `Basic ${Buffer.from(':tok').toString('base64')}`);
        // Decoding it back is the clearest way to assert the shape a reader cares about.
        assert.equal(Buffer.from(sent.slice(6), 'base64').toString(), ':tok');
    });
});

test('⚠️ refuses an empty PAT instead of falling through to an anonymous request', () => {
    // Azure answers an unauthenticated call with 203 + an HTML sign-in page, NOT a 401. Parsed
    // naively that becomes an empty result set and the caller reports a clean run.
    assert.throws(() => adoSink({ org: 'o', project: 'p', pat: '' }), /needs a PAT/);
    assert.throws(() => adoSink({ org: 'o', project: 'p', pat: '' }), /203/);
});

test('⚠️ a 203 with HTML is refused, not parsed as zero results', async () => {
    const sink = base({ 'suites': { status: 203, type: 'text/html', body: {} } });
    await assert.rejects(
        sink.resolve({ caseId: '1', planId: '99' }),
        /sign-in redirect, not an empty result/,
    );
});

test('resolve finds a case across several suites and says where', async () => {
    const sink = base({
        'suites': SUITES,
        'Suites/10/points': pointsIn(10, ['865914']),
        'Suites/11/points': pointsIn(11, ['865914', '999']),
    });
    const r = await sink.resolve({ caseId: '865914', planId: '764570' });
    assert.equal(r.found, true);
    assert.equal(r.points.length, 2, 'one point per suite the case belongs to');
    assert.match(r.where, /suite 10/);
    assert.match(r.where, /suite 11/);
});

test('⛔ a ZERO-MATCH publish is a FAILURE, not a clean run', async () => {
    // The whole point. In the wild this is how a stale fence fails: the plan is reorganised, the
    // scope no longer matches, and the run reports success with every case ticked.
    const sink = base({ 'suites': SUITES, 'points': pointsIn(10, ['nope']) });
    const report = await sink.publish([{ ref: { caseId: '865914', planId: '764570' }, outcome: 'passed' }]);
    assert.equal(report.matched, 0);
    assert.equal(report.written, 0);
    assert.deepEqual(report.unresolved, ['865914']);
    assert.ok(publishFailed(report), 'a zero-match publish must be treated as failed');
    const described = describePublish(report);
    assert.match(described, /ZERO test points matched/);
    assert.match(described, /FAILURE, not a clean run/);
});

test('a dry run does all the READS but writes nothing', async () => {
    // Deliberate: resolve is where a stale scope reveals itself, so a dry run is a real check.
    const log = [];
    const sink = base({ 'suites': SUITES, 'points': pointsIn(10, ['865914']) }, log);
    const report = await sink.publish([{ ref: { caseId: '865914', planId: '764570' }, outcome: 'passed' }]);
    assert.equal(report.armed, false);
    assert.ok(report.matched > 0, 'a dry run must still resolve');
    assert.equal(report.written, 0);
    assert.ok(log.every((c) => c.method === 'GET'), `a dry run must not write: ${log.filter((c) => c.method !== 'GET').map((c) => c.method).join(',')}`);
});

test('armed: creates a run, patches results, completes the run', async () => {
    const log = [];
    const sink = base({
        'suites': SUITES,
        'Suites/10/points': pointsIn(10, ['865914']),
        'Suites/11/points': pointsIn(11, []),
        'test/runs?': { body: { id: 555 } },
        'runs/555/results': { body: { value: [{ id: 1 }] } },
        'runs/555?': { body: {} },
    }, log);
    const report = await sink.publish(
        [{ ref: { caseId: '865914', planId: '764570' }, outcome: 'failed', comment: 'known defect' }],
        { armed: true },
    );
    assert.equal(report.written, 1);
    assert.equal(report.runId, 555);
    const patches = log.filter((c) => c.method === 'PATCH');
    assert.ok(patches.length >= 2, 'expected a results PATCH and a run-completion PATCH');
    assert.match(patches[0].body, /"outcome":"failed"/);
    assert.match(patches[0].body, /known defect/);
});

test('pagination: a continuationToken is followed, because page one always looks complete', async () => {
    let call = 0;
    const sink = adoSink({
        org: 'o', project: 'p', pat: 't',
        fetchImpl: async (url) => {
            const body = url.includes('suites')
                ? (call++ === 0
                    ? { value: [{ id: 10 }], continuationToken: 'MORE' }
                    : { value: [{ id: 11 }] })
                : { value: [] };
            return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
        },
    });
    await sink.resolve({ caseId: 'x', planId: '1' });
    assert.ok(call >= 2, 'the second page was never requested');
});

for (const [status, pattern] of [
    [401, /invalid or EXPIRED/],
    [403, /lacks permission/],
    [404, /wrong organisation, project, or plan/],
    [409, /already modified/],
]) {
    test(`${status} gets its own message — each has a different fix`, async () => {
        const sink = base({ 'suites': { status, body: {} } });
        await assert.rejects(sink.resolve({ caseId: '1', planId: '1' }), pattern);
    });
}

test('404 says it may be permissions wearing a 404', async () => {
    // ADO answers 404 for a plan you cannot SEE, which sends people hunting for a typo in an id
    // that is perfectly correct.
    const sink = base({ 'suites': { status: 404, body: {} } });
    await assert.rejects(sink.resolve({ caseId: '1', planId: '1' }), /permissions problem wearing a 404/);
});

test('a case in several suites produces a WARNING, because every point gets written', async () => {
    const sink = base({
        'suites': SUITES,
        'Suites/10/points': pointsIn(10, ['77']),
        'Suites/11/points': pointsIn(11, ['77']),
    });
    const report = await sink.publish([{ ref: { caseId: '77', planId: '1' }, outcome: 'passed' }]);
    assert.equal(report.matched, 2);
    assert.match(report.warnings.join(' '), /matched 2 points/);
    assert.match(describePublish(report), /narrow the suite scope/);
});

test('link is idempotent — it does not pile up duplicate relations', async () => {
    const already = { body: { relations: [{ rel: 'System.LinkTypes.Related', url: 'https://x/_apis/wit/workItems/888' }] } };
    const log = [];
    const sink = base({ 'workitems/77': already }, log);
    const r = await sink.link('77', '888', { armed: true });
    assert.deepEqual(r, { linked: true, already: true });
    assert.ok(log.every((c) => c.method === 'GET'), 'an existing link must not be re-added');
});

test('link respects dry run', async () => {
    const log = [];
    const sink = base({ 'workitems/77': { body: { relations: [] } } }, log);
    const r = await sink.link('77', '888');
    assert.equal(r.linked, false);
    assert.ok(log.every((c) => c.method === 'GET'));
});

test('resolve refuses a case id with no plan — it is not addressable alone', async () => {
    const sink = base({});
    await assert.rejects(sink.resolve({ caseId: '1' }), /needs a planId/);
});
