/**
 * `TestCaseSink` — publish a result against a test case that lives somewhere else.
 *
 * Per docs/INTEGRATIONS.md this is the ONE place a bespoke adapter is justified. SARIF and JUnit
 * cover reporting because the ecosystem already reads them; "record this outcome against case 865914
 * in plan 764570" has no interchange format, so it needs real code per destination.
 *
 * ⚠️ ONE interface, and exactly one adapter built properly. Three half-finished connectors is the
 * failure mode this interface exists to prevent — each one plausible, none trusted. A destination
 * either has a contract-tested adapter or it is honestly unsupported.
 *
 * ── The five things an adapter MUST get right ──────────────────────────────────────────────────
 *
 * 1. DRY RUN BY DEFAULT. `publish` writes nothing unless explicitly armed. A publishing tool whose
 *    default is to write will eventually write to the wrong plan, and test-management systems do not
 *    have an undo.
 *
 * 2. ⛔ A ZERO-MATCH PUBLISH IS AN ERROR, NOT A SUCCESS. This is the whole reason the interface
 *    specifies behaviour rather than just method names. If a scoped publish matches no test points,
 *    the honest outcome is a loud failure — because the alternative is what actually happens in the
 *    wild: the run reports success, every case shows a tick, and nothing was written. A fence that
 *    has gone stale (the plan was reorganised, the suite moved) fails exactly that way, and it can
 *    sit undetected for weeks because the output looks perfect.
 *
 * 3. DISTINGUISH THE FAILURES. 401 is a bad or expired token; 403 is a valid token without
 *    permission; 404 is the wrong plan, project or organisation. Collapsing those into "request
 *    failed" turns a thirty-second fix into an afternoon.
 *
 * 4. PAGINATE. Every one of these APIs pages, and the first page always looks complete.
 *
 * 5. NEVER INVENT AN ID. If a case id cannot be resolved, say so. Publishing to a guessed point is
 *    worse than publishing nothing, because somebody will believe it.
 */

/**
 * @typedef {object} CaseRef
 * @property {string} caseId
 * @property {string} [planId]
 * @property {string[]} [suiteIds]
 *
 * @typedef {object} Outcome
 * @property {CaseRef} ref
 * @property {'passed'|'failed'|'blocked'|'notApplicable'} outcome
 * @property {string} [comment]
 * @property {string} [defectId]   an existing work item / issue to relate
 *
 * @typedef {object} Sink
 * @property {string} id
 * @property {(ref: CaseRef) => Promise<{found: boolean, points: object[], where?: string}>} resolve
 * @property {(outcomes: Outcome[], opts?: {armed?: boolean}) => Promise<PublishReport>} publish
 * @property {(caseId: string, defectId: string, opts?: {armed?: boolean}) => Promise<{linked: boolean, already?: boolean}>} link
 *
 * @typedef {object} PublishReport
 * @property {boolean} armed
 * @property {number} matched      test points the outcomes resolved to
 * @property {number} written
 * @property {string[]} unresolved case ids that matched nothing
 * @property {string[]} warnings
 */

const REQUIRED = ['id', 'resolve', 'publish', 'link'];

export function validateSink(sink) {
    const problems = [];
    for (const k of REQUIRED) {
        if (typeof sink?.[k] === 'undefined') problems.push(`missing "${k}"`);
        else if (k !== 'id' && typeof sink[k] !== 'function') problems.push(`"${k}" is not a function`);
    }
    if (problems.length) throw new Error(`invalid sink ${sink?.id ?? '(no id)'}: ${problems.join('; ')}`);
    return sink;
}

/**
 * Turn a publish report into the line a human reads — and make a zero-match loud.
 *
 * Kept here rather than in the adapter so every future sink inherits the same refusal to call a
 * zero-match publish a success. If it lived in the ADO adapter, the next adapter would quietly get
 * it wrong, and that is precisely the defect that is hardest to notice.
 */
export function describePublish(report) {
    const lines = [];
    const mode = report.armed ? 'ARMED' : 'dry run (nothing written)';
    lines.push(`${report.matched} point(s) matched · ${report.written} written · ${mode}`);

    if (report.matched === 0) {
        lines.push('⛔ ZERO test points matched. This is a FAILURE, not a clean run.');
        lines.push('   A stale scope fails exactly this way: the run reports success, every case shows');
        lines.push('   a tick, and nothing was written. Check the plan and suite ids resolve before');
        lines.push('   trusting any previous run that was scoped the same way.');
    }
    for (const u of report.unresolved) lines.push(`⚠️  unresolved case: ${u} — not published, deliberately`);
    for (const w of report.warnings) lines.push(`⚠️  ${w}`);
    return lines.join('\n');
}

/** Non-zero exit when a publish was not what it appeared to be. */
export function publishFailed(report) {
    return report.matched === 0 || report.unresolved.length > 0;
}
