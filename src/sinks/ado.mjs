import { validateSink } from './sink.mjs';

/**
 * Azure DevOps Test Plans adapter.
 *
 * Built against the PUBLISHED REST contract and exercised by a local stub (see
 * test/ado-sink.test.mjs). ⚠️ It has NOT been run against a live instance — the README says so
 * plainly, and the one smoke command needed to confirm it is documented there. Claiming otherwise
 * would be the exact self-deception this project exists to find.
 *
 * What a stub genuinely proves: URL construction, the PAT auth encoding, the pagination loop, error
 * discrimination, and — the one that matters most — that a zero-match publish FAILS LOUDLY. That
 * last behaviour is better tested against a stub than live, because a stub can be told to return no
 * matching points on demand, and a real plan cannot.
 *
 * API version is pinned. An unpinned Azure API silently changes response shapes under you, and the
 * failure arrives as a field that is suddenly undefined rather than as an error.
 */

const API = '7.1';

export function adoSink({ org, project, pat, baseUrl = 'https://dev.azure.com', fetchImpl = fetch }) {
    if (!org || !project) throw new Error('adoSink needs { org, project }');
    if (!pat) {
        throw new Error(
            'adoSink needs a PAT. Pass { pat } or set AZURE_TOKEN.\n'
            + '⚠️ An empty token must NOT fall through to an anonymous request: the API answers 203 '
            + 'with an HTML sign-in page rather than a 401, so the adapter would parse that as a '
            + 'successful empty result and report a clean run. Refusing up front instead.',
        );
    }

    const root = `${baseUrl}/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
    // Basic auth with an EMPTY username and the PAT as the password — the documented scheme, and
    // easy to get subtly wrong (the colon is required).
    const auth = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;

    async function call(path, { method = 'GET', body } = {}) {
        const url = path.startsWith('http') ? path : `${root}/${path}`;
        const res = await fetchImpl(url, {
            method,
            headers: {
                authorization: auth,
                accept: 'application/json',
                ...(body ? { 'content-type': method === 'PATCH' ? 'application/json-patch+json' : 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });

        if (!res.ok) throw explain(res.status, url);

        // ⚠️ A 203 with HTML is Azure's "you are not signed in" response, and it is NOT an error
        // status. Parsed naively it becomes an empty result set and the caller reports a clean run
        // against a plan it never reached.
        const type = res.headers?.get?.('content-type') ?? '';
        if (!type.includes('json')) {
            throw new Error(
                `${url} answered ${res.status} with "${type || 'no content-type'}" rather than JSON.\n`
                + 'That is Azure\'s sign-in redirect, not an empty result — the token is almost certainly '
                + 'invalid or expired. Refusing to treat it as zero results.',
            );
        }
        return res.json();
    }

    /** Each status needs a different fix, so each gets a different message. */
    function explain(status, url) {
        const where = `(${url})`;
        if (status === 401) return new Error(`401 Unauthorized ${where} — the PAT is invalid or EXPIRED. ADO PATs are short-lived by default; re-issue it.`);
        if (status === 403) return new Error(`403 Forbidden ${where} — the token is valid but lacks permission. Test Plans needs "Test Management: read & write"; a code-only PAT will do everything else and fail here.`);
        if (status === 404) return new Error(`404 Not Found ${where} — wrong organisation, project, or plan id. ⚠️ ADO also answers 404 for a plan you cannot SEE, so this can be a permissions problem wearing a 404.`);
        if (status === 409) return new Error(`409 Conflict ${where} — the run or result was already modified. Re-read before writing.`);
        return new Error(`${status} ${where}`);
    }

    /** Every one of these endpoints pages, and the first page always looks complete. */
    async function paged(path, key = 'value') {
        const out = [];
        let next = path;
        let guard = 0;
        while (next && guard++ < 100) {
            const page = await call(next);
            out.push(...(page[key] ?? []));
            const token = page.continuationToken;
            next = token ? `${path}${path.includes('?') ? '&' : '?'}continuationToken=${encodeURIComponent(token)}` : null;
        }
        return out;
    }

    return validateSink({
        id: 'ado-test-plans',

        async resolve({ caseId, planId, suiteIds }) {
            if (!planId) throw new Error('resolve needs a planId — a case id alone is not addressable in ADO');
            const suites = suiteIds?.length
                ? suiteIds
                : (await paged(`test/plans/${planId}/suites?api-version=${API}`)).map((s) => String(s.id));

            const points = [];
            for (const suiteId of suites) {
                const inSuite = await paged(`test/Plans/${planId}/Suites/${suiteId}/points?api-version=${API}`);
                // ⚠️ A case can sit in SEVERAL suites of one plan, each with its own point. Writing
                // to all of them is how a desktop run once stamped a mobile-device suite. Narrow the
                // suites deliberately; do not spray.
                for (const p of inSuite) {
                    if (String(p.testCase?.id ?? p.testCaseReference?.id ?? '') === String(caseId)) {
                        points.push({ pointId: p.id, suiteId, planId, caseId: String(caseId) });
                    }
                }
            }
            return { found: points.length > 0, points, where: points.map((p) => `suite ${p.suiteId}`).join(', ') };
        },

        async publish(outcomes, { armed = false } = {}) {
            const report = { armed, matched: 0, written: 0, unresolved: [], warnings: [] };
            const resolved = [];

            for (const o of outcomes) {
                const r = await this.resolve(o.ref);
                if (!r.found) { report.unresolved.push(o.ref.caseId); continue; }
                if (r.points.length > 1) {
                    report.warnings.push(`case ${o.ref.caseId} matched ${r.points.length} points (${r.where}) — narrow the suite scope or every one gets written`);
                }
                for (const p of r.points) resolved.push({ point: p, outcome: o });
            }
            report.matched = resolved.length;

            // Dry run stops here, having done all the READS. That is deliberate: the resolve step is
            // where a stale scope shows itself, so a dry run is a genuine check rather than a no-op.
            if (!armed || !resolved.length) return report;

            const run = await call(`test/runs?api-version=${API}`, {
                method: 'POST',
                body: {
                    name: `nightbark ${new Date().toISOString()}`,
                    plan: { id: String(outcomes[0].ref.planId) },
                    pointIds: resolved.map((r) => r.point.pointId),
                    automated: true,
                },
            });

            const existing = await paged(`test/runs/${run.id}/results?api-version=${API}`);
            const body = existing.map((res, i) => ({
                id: res.id,
                outcome: resolved[i]?.outcome.outcome ?? 'notApplicable',
                state: 'Completed',
                comment: resolved[i]?.outcome.comment ?? 'nightbark',
            }));
            await call(`test/runs/${run.id}/results?api-version=${API}`, { method: 'PATCH', body });
            await call(`test/runs/${run.id}?api-version=${API}`, { method: 'PATCH', body: { state: 'Completed' } });

            report.written = body.length;
            report.runId = run.id;
            return report;
        },

        async link(caseId, defectId, { armed = false } = {}) {
            const wi = await call(`wit/workitems/${caseId}?$expand=relations&api-version=${API}`);
            const target = `${root}/wit/workItems/${defectId}`;
            // Idempotent on purpose: re-linking on every run would pile up duplicate relations, and
            // ADO happily accepts them.
            if ((wi.relations ?? []).some((r) => String(r.url).endsWith(`/${defectId}`))) {
                return { linked: true, already: true };
            }
            if (!armed) return { linked: false };
            await call(`wit/workitems/${caseId}?api-version=${API}`, {
                method: 'PATCH',
                body: [{ op: 'add', path: '/relations/-', value: { rel: 'System.LinkTypes.Related', url: target } }],
            });
            return { linked: true };
        },
    });
}
