/**
 * `sink:ado --diagnose` — walk the chain ONE HOP AT A TIME and name the rung that broke.
 *
 * ── Why this exists, and why it is not a consolation prize ─────────────────────────────────────
 *
 * The adapter has never run against a live Azure DevOps instance (docs/CONTRACTS.md says so in the
 * same words). The obvious remedy is "borrow a credential and run it once". That would prove ONE
 * path: the happy one, on one plan, with one person's permissions.
 *
 * Every failure this command exists for is on the OTHER paths — and those are the ones you cannot
 * provoke on a live instance even when you have full access:
 *
 *   · a token with Code scope but not Test Management        (you would have to issue a bad PAT)
 *   · a plan id that exists but is invisible to you          (you would need someone else's rights)
 *   · a suite fence that no longer matches after a reorg     (you would have to reorganise a plan)
 *   · an anonymous request answered 203 + HTML, not 401      (you would have to revoke mid-call)
 *
 * A stub produces all four on demand. So the honest position is not "we could not verify it": it is
 * that live access verifies the one path that rarely breaks, and the ladder below is verified
 * against the five that do. What remains genuinely unverified is narrow and named: the WRITE path's
 * behaviour on a real plan. That stays written down rather than quietly implied.
 *
 * ── What the ladder buys that a single error message cannot ────────────────────────────────────
 *
 * The same HTTP status means different things at different depths, and the fix is different each
 * time. A 404 on the organisation is a typo. A 404 on the plan is usually PERMISSIONS wearing a 404,
 * because ADO hides what you cannot see. One message cannot say both, so the current adapter throws
 * the first one it meets and the reader guesses. The ladder reports how far it got.
 *
 * ⛔ THE RUNG THAT MATTERS MOST IS THE SUITE FENCE (rung 6), and it is the only one in this list
 * that fails SILENTLY in normal use. A plan gets reorganised into drops; a publish still scoped to
 * the old suite ids matches no points, writes nothing, and reports every case as a tick. Nothing in
 * the run output is wrong — there is simply no output where the writes should have been. That is why
 * rung 6 does not just check the ids resolve: when one does not, it lists the suites that DO exist,
 * because the next question is always "then what should it be?".
 */

const API = '7.1';

/** A rung: what it proves, and — for a failure — what actually fixes it. */
const RUNGS = ['credential', 'organisation', 'project', 'plan', 'suites', 'fence', 'points'];

/**
 * ⚠️ NEVER PRINT THE TOKEN, not even partially. A diagnostic that echoes a credential into terminal
 * scrollback has turned a support question into a rotation. Length and character class answer every
 * question a paste error raises without reproducing the secret:
 *
 *   · wrapped in quotes by a shell          -> leading/trailing ' or "
 *   · the whole header pasted, not the PAT  -> starts "Basic " or "Bearer "
 *   · the variable NAME pasted              -> starts "$env:" or "${"
 *   · copied with a trailing newline/space  -> trimmed length differs
 *   · empty because the lookup missed       -> length 0, which is the commonest of all
 */
function inspectCredential(pat) {
    if (pat === undefined || pat === null || pat === '') {
        return {
            ok: false,
            detail: 'AZURE_TOKEN is not set (or is empty).',
            fix: 'Set it in the shell that runs the command. ⚠️ On Windows a User-level variable is NOT '
                + 'visible to an already-open session: $env:AZURE_TOKEN = [Environment]::GetEnvironmentVariable("AZURE_TOKEN","User"). '
                + 'An empty token is the worst case, not the most obvious one: the API answers an anonymous '
                + 'request with 203 and an HTML sign-in page rather than 401, so an adapter that does not '
                + 'refuse up front parses it as ZERO RESULTS and reports a clean run.',
        };
    }
    const trimmed = pat.trim();
    const notes = [];
    if (trimmed !== pat) notes.push('it has leading or trailing whitespace (a copied newline)');
    if (/^['"]|['"]$/.test(trimmed)) notes.push('it is wrapped in quotes — the shell kept them as part of the value');
    if (/^(Basic|Bearer)\s/i.test(trimmed)) notes.push('it starts with "Basic "/"Bearer " — that is the whole header, not the token');
    if (/^\$env:|^\$\{|^%[A-Z_]+%$/.test(trimmed)) notes.push('it looks like the variable NAME rather than its value');
    if (/^:/.test(trimmed)) notes.push('it starts with a colon — the colon is added by the adapter, do not include it');

    if (notes.length) {
        return {
            ok: false,
            detail: `present, ${pat.length} characters — but ${notes.join('; ')}.`,
            fix: 'Re-set the variable with the raw token only. The adapter adds the empty username and the '
                + 'colon itself (Basic base64(":" + pat)).',
        };
    }
    return {
        ok: true,
        // Deliberately length + class only. See the note above.
        detail: `present, ${pat.length} characters, ${/^[A-Za-z0-9._~-]+$/.test(trimmed) ? 'all URL-safe characters' : '⚠️ contains characters outside the usual PAT alphabet'}.`,
    };
}

/** A raw fetch that never throws on status — the ladder needs the number, not an exception. */
async function probe(fetchImpl, url, auth) {
    try {
        const res = await fetchImpl(url, { method: 'GET', headers: { authorization: auth, accept: 'application/json' } });
        const type = res.headers?.get?.('content-type') ?? '';
        let json = null;
        if (type.includes('json')) { try { json = await res.json(); } catch { json = null; } }
        return { status: res.status, type, json, reachable: true };
    } catch (err) {
        // A transport failure is its own rung-level answer: DNS, proxy, or a corporate TLS
        // interceptor. Reporting it as "401" would send someone to re-issue a perfectly good token.
        return { status: 0, type: '', json: null, reachable: false, error: err.message };
    }
}

/**
 * ⚠️ A 203 with HTML is NOT an error status, and it is the single most misleading response the API
 * gives: it means "not signed in". Any rung may receive it, so the check belongs here rather than
 * being repeated per rung.
 */
function signInRedirect(res) {
    return res.reachable && res.status < 400 && res.type && !res.type.includes('json');
}

const SIGNIN_FIX = 'The token is being ignored, which Azure signals with a sign-in PAGE rather than a 401. '
    + 'Re-issue the PAT — ADO PATs expire on a short default (and an expired one is indistinguishable from '
    + 'an absent one at this layer).';

export async function diagnose({
    org, project, pat, planId, suiteIds = [], caseIds = [],
    baseUrl = 'https://dev.azure.com', fetchImpl = fetch,
} = {}) {
    const rungs = [];
    const add = (id, title, status, detail, fix) => { rungs.push({ id, title, status, detail, ...(fix ? { fix } : {}) }); return status === 'pass'; };
    const stopHere = (from) => {
        // Later rungs are not "passing" and not "failing" — they were never reached. Saying so is
        // the difference between a diagnosis and a wall of red.
        for (const id of RUNGS.slice(RUNGS.indexOf(from) + 1)) {
            rungs.push({ id, title: TITLES[id], status: 'skipped', detail: 'not reached — the rung above has to pass first.' });
        }
        return { ok: false, rungs };
    };

    // ── 1. credential (no network) ────────────────────────────────────────────────────────────
    const cred = inspectCredential(pat);
    if (!add('credential', TITLES.credential, cred.ok ? 'pass' : 'fail', cred.detail, cred.fix)) return stopHere('credential');

    const auth = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
    if (!org || !project) {
        add('organisation', TITLES.organisation, 'fail', 'no --org / --project given.', 'Pass --org and --project (or set ADO_ORG / ADO_PROJECT).');
        return stopHere('organisation');
    }

    // ── 2. organisation + does the token authenticate AT ALL ──────────────────────────────────
    const orgUrl = `${baseUrl}/${encodeURIComponent(org)}/_apis/projects?$top=1&api-version=${API}`;
    const orgRes = await probe(fetchImpl, orgUrl, auth);
    if (!orgRes.reachable) {
        add('organisation', TITLES.organisation, 'fail', `the request never completed: ${orgRes.error}`,
            'That is transport, not authorisation — DNS, a proxy, or a TLS interceptor. Nothing about the '
            + 'token or the plan ids is implicated yet, so do not change them. Try the same URL in a browser.');
        return stopHere('organisation');
    }
    if (signInRedirect(orgRes)) {
        add('organisation', TITLES.organisation, 'fail', `answered ${orgRes.status} with "${orgRes.type}" instead of JSON — a sign-in page.`, SIGNIN_FIX);
        return stopHere('organisation');
    }
    if (orgRes.status === 401) {
        add('organisation', TITLES.organisation, 'fail', '401 Unauthorized.',
            'The token is rejected outright: wrong value, or expired. ⚠️ This rung CANNOT be a scope problem — '
            + 'a correctly-signed token with no Test Management scope still authenticates here and fails at rung 4. '
            + 'So a 401 here means the credential, full stop.');
        return stopHere('organisation');
    }
    if (orgRes.status === 404) {
        add('organisation', TITLES.organisation, 'fail', `404 — no organisation "${org}" at ${baseUrl}.`,
            'Check the spelling against the URL you use in the browser. The organisation is the FIRST path '
            + 'segment of dev.azure.com/<org>/<project>; people commonly pass the project here.');
        return stopHere('organisation');
    }
    if (orgRes.status >= 400) {
        add('organisation', TITLES.organisation, 'fail', `${orgRes.status} from ${orgUrl}.`, 'Unexpected at this rung — the body may say more.');
        return stopHere('organisation');
    }
    add('organisation', TITLES.organisation, 'pass', `"${org}" reachable and the token authenticates.`);

    // ── 3. project ────────────────────────────────────────────────────────────────────────────
    const projRes = await probe(fetchImpl, `${baseUrl}/${encodeURIComponent(org)}/_apis/projects/${encodeURIComponent(project)}?api-version=${API}`, auth);
    if (projRes.status === 404) {
        add('project', TITLES.project, 'fail', `404 — no project "${project}" visible in "${org}".`,
            '⚠️ "Visible" is the operative word: ADO answers 404 for a project you lack rights to, so this is '
            + 'EITHER a wrong name OR a permissions problem. The organisation rung passed, so the token is '
            + 'valid — which makes permissions the more likely of the two.');
        return stopHere('project');
    }
    if (projRes.status >= 400) {
        add('project', TITLES.project, 'fail', `${projRes.status} on the project.`, 'Unexpected — the organisation resolved, so this is project-specific.');
        return stopHere('project');
    }
    add('project', TITLES.project, 'pass', `"${project}" resolves${projRes.json?.name ? ` (${projRes.json.name})` : ''}.`);

    // ── 4. the plan — AND the Test Management scope, which lives or dies here ──────────────────
    if (!planId) {
        add('plan', TITLES.plan, 'fail', 'no --plan given.', 'A case id is not addressable in ADO without its plan.');
        return stopHere('plan');
    }
    const root = `${baseUrl}/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_apis`;
    const planRes = await probe(fetchImpl, `${root}/test/plans/${planId}?api-version=${API}`, auth);
    if (planRes.status === 403) {
        add('plan', TITLES.plan, 'fail', '403 Forbidden on the Test Plans API.',
            '⛔ THIS IS THE ONE A CODE-ONLY PAT GIVES YOU, and it is why the ladder is worth walking: the token '
            + 'passed rungs 2 and 3 and will clone repositories all day. Test Plans needs the "Test Management" '
            + 'scope (read & write to publish). Re-issue the PAT with it — you cannot add a scope to an existing one.');
        return stopHere('plan');
    }
    if (planRes.status === 404) {
        add('plan', TITLES.plan, 'fail', `404 — plan ${planId} not found in ${project}.`,
            '⚠️ Most likely PERMISSIONS, not a typo. ADO answers 404 for a plan you cannot see, and the project '
            + 'rung already passed — so the id may be perfectly correct and simply invisible to this token. '
            + 'Confirm by opening the plan in a browser as the same user.');
        return stopHere('plan');
    }
    if (planRes.status >= 400) {
        add('plan', TITLES.plan, 'fail', `${planRes.status} on plan ${planId}.`, 'Unexpected at this rung.');
        return stopHere('plan');
    }
    add('plan', TITLES.plan, 'pass', `plan ${planId}${planRes.json?.name ? ` "${planRes.json.name}"` : ''} is readable — so the Test Management scope is present.`);

    // ── 5. suites ─────────────────────────────────────────────────────────────────────────────
    const suitesRes = await probe(fetchImpl, `${root}/test/plans/${planId}/suites?api-version=${API}`, auth);
    if (suitesRes.status >= 400) {
        add('suites', TITLES.suites, 'fail', `${suitesRes.status} enumerating suites.`, 'The plan read but its suites did not — unexpected; retry before investigating.');
        return stopHere('suites');
    }
    const found = (suitesRes.json?.value ?? []).map((s) => ({ id: String(s.id), name: s.name ?? '' }));
    if (!found.length) {
        add('suites', TITLES.suites, 'fail', `plan ${planId} reports NO suites.`,
            'A plan with no suites has no test points, so nothing can ever be published to it. Either the plan '
            + 'id belongs to a different plan than you think, or this rung is paginating — check a browser.');
        return stopHere('suites');
    }
    add('suites', TITLES.suites, 'pass', `${found.length} suite(s): ${found.slice(0, 8).map((s) => s.id).join(', ')}${found.length > 8 ? ', …' : ''}`);

    // ── 6. ⛔ THE FENCE. The rung that fails silently in normal use. ───────────────────────────
    const known = new Set(found.map((s) => s.id));
    const stale = suiteIds.filter((s) => !known.has(String(s)));
    if (suiteIds.length && stale.length) {
        add('fence', TITLES.fence, 'fail',
            `${stale.length} of ${suiteIds.length} scoped suite id(s) are NOT in plan ${planId}: ${stale.join(', ')}.`,
            '⛔ This is the failure that reports success. A publish scoped to a suite that no longer exists matches '
            + 'no points, writes nothing, and ticks every case — the run output is not wrong, there is simply '
            + 'nothing where the writes should be. It happens when a plan is reorganised (into drops, say) and the '
            + 'scope is left behind.\n'
            + `   The suites that DO exist: ${found.map((s) => `${s.id}${s.name ? ` (${s.name})` : ''}`).join(' · ')}\n`
            + '   Resolve the ids at RUN TIME rather than pinning them, or re-check this fence after any plan change.');
        return stopHere('fence');
    }
    add('fence', TITLES.fence, 'pass', suiteIds.length
        ? `all ${suiteIds.length} scoped suite id(s) exist in plan ${planId}.`
        : 'no --suites given, so nothing is fenced. ⚠️ Unscoped means EVERY suite the case appears in gets written — '
          + 'which is how a desktop run once stamped a mobile-device suite.');

    // ── 7. points — do the cases actually resolve ──────────────────────────────────────────────
    if (!caseIds.length) {
        rungs.push({ id: 'points', title: TITLES.points, status: 'skipped', detail: 'no --case given, so no case was resolved. The scope above is sound; whether a given case sits in it is unanswered.' });
        return { ok: true, rungs };
    }
    const scope = suiteIds.length ? suiteIds.map(String) : found.map((s) => s.id);
    const hits = new Map(caseIds.map((c) => [String(c), []]));
    for (const suiteId of scope) {
        const pts = await probe(fetchImpl, `${root}/test/Plans/${planId}/Suites/${suiteId}/points?api-version=${API}`, auth);
        if (pts.status >= 400) {
            add('points', TITLES.points, 'fail', `${pts.status} reading points in suite ${suiteId}.`,
                'The suite enumerated but its points did not. If this is a 403, the PAT may have read-only Test '
                + 'Management where publishing needs read & write.');
            return { ok: false, rungs };
        }
        for (const p of pts.json?.value ?? []) {
            const id = String(p.testCase?.id ?? p.testCaseReference?.id ?? '');
            if (hits.has(id)) hits.get(id).push(suiteId);
        }
    }
    const missing = [...hits].filter(([, where]) => !where.length).map(([id]) => id);
    const multi = [...hits].filter(([, where]) => where.length > 1);
    if (missing.length) {
        add('points', TITLES.points, 'fail', `${missing.length} case(s) resolved to NO test point: ${missing.join(', ')}.`,
            'A case with no point in this scope can never receive a result. Either it is not in the scoped suites, '
            + 'or it is not in this plan at all. ⛔ Never publish to a guessed point — an unresolved case must stay '
            + 'unpublished, because a wrong tick is worse than a missing one.');
        return { ok: false, rungs };
    }
    const detail = [...hits].map(([id, where]) => `${id} → suite ${where.join(' + ')}`).join(' · ');
    add('points', TITLES.points, 'pass', detail
        + (multi.length ? `\n   ⚠️ ${multi.length} case(s) sit in MORE THAN ONE suite — every point gets written. Narrow --suites deliberately.` : ''));

    return { ok: rungs.every((r) => r.status !== 'fail'), rungs };
}

const TITLES = {
    credential: 'the credential is present and shaped like a token',
    organisation: 'the organisation resolves and the token authenticates',
    project: 'the project is visible to this token',
    plan: 'the plan is readable — i.e. the Test Management scope is present',
    suites: 'the plan\'s suites enumerate',
    fence: '⛔ the scoped suite ids still exist in the plan',
    points: 'each case resolves to exactly one test point in scope',
};

/**
 * Soft-wrap at a width a terminal can hold.
 *
 * Not cosmetic: these messages are long ON PURPOSE — each one has to say what broke AND what fixes
 * it — and an unwrapped 400-character paragraph is one the reader skips, which defeats the whole
 * design. Wrapping per paragraph preserves the deliberate newlines (rung 6 puts the suite list on
 * its own line) instead of collapsing them.
 */
function wrap(text, width, indent) {
    return text.split('\n').flatMap((para) => {
        const out = [];
        let line = '';
        for (const word of para.split(/ +/)) {
            if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
            else line = line ? `${line} ${word}` : word;
        }
        if (line) out.push(line);
        return out;
    }).join('\n' + indent);
}

/** Render for a terminal. Each rung says what it proves; a failure says what fixes it. */
export function describeDiagnosis({ ok, rungs }, { width = 88 } = {}) {
    const mark = { pass: '✔', fail: '✖', skipped: '·' };
    const lines = [];
    rungs.forEach((r, i) => {
        lines.push(`${mark[r.status]} ${i + 1}. ${r.title}`);
        lines.push(`     ${wrap(r.detail, width, '     ')}`);
        // ⚠️ A distinct marker, not a bare arrow: rung 7's own detail reads "865914 → suite 10",
        // so an arrow cannot also mean "here is the fix". Caught by a test asserting a clean chain
        // offers no fixes — which passed for the wrong reason until the markers were separated.
        if (r.fix) lines.push(`     ⤷ fix: ${wrap(r.fix, width - 7, '       ')}`);
        lines.push('');
    });
    const failed = rungs.find((r) => r.status === 'fail');
    lines.push(ok
        ? '✔ the chain resolves end to end. A publish scoped this way will reach real test points.'
        : `✖ the chain breaks at rung ${rungs.indexOf(failed) + 1} (${failed.id}). Everything below it is unanswered, not passing.`);
    return lines.join('\n');
}
