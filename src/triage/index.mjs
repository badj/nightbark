import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fingerprintOf } from './fingerprint.mjs';
import { cluster } from './cluster.mjs';

export { fingerprintOf } from './fingerprint.mjs';
export { cluster, similarity, WEIGHTS, MERGE_THRESHOLD, REVIEW_FLOOR } from './cluster.mjs';
export { normalise, explain } from './normalise.mjs';
export { anchorsOf } from './anchors.mjs';

/**
 * Steps 1-4 of the triage pipeline, end to end and entirely DETERMINISTIC.
 *
 * Per ADR-0004 this half is a gate, not an agent: normalise, anchor, hash, cluster. The judgement
 * half — severity, category, root-cause hypothesis, ticket prose — is Steps 5-6, and it leaves here
 * as a BRIEF for an agent to answer (ADR-0005: gather locally, judge elsewhere). Nothing is created,
 * closed or merged; that is Step 7 and Step 7 is a person.
 */

/**
 * Pull failures out of a Playwright JSON report.
 *
 * ⚠️ RECURSIVE, and the discipline's own reference implementation is not. It loops `report.suites`
 * one level deep, but Playwright NESTS suites — a file's suite contains a describe's suite contains
 * the specs — so every failure inside a `describe` block is silently skipped. A triage tool that
 * quietly sees two thirds of the failures is worse than none, because the board looks short.
 */
function fromPlaywright(report) {
    const out = [];
    const walk = (suite, trail) => {
        const path = [...trail, suite.title].filter(Boolean);
        for (const spec of suite.specs ?? []) {
            for (const t of spec.tests ?? []) {
                const results = t.results ?? [];
                if (!results.length) continue;
                const first = results[0];
                const last = results[results.length - 1];
                const failed = last.status === 'failed' || last.status === 'timedOut';
                const flaky = (last.status === 'passed' || last.status === 'expected') && (first.status === 'failed' || first.status === 'timedOut');
                if (!failed && !flaky) continue;
                out.push({
                    testName: [...path, spec.title].join(' > '),
                    // The FIRST result carries the original failure; a retry's error may differ.
                    error: first.error?.message ?? first.errors?.[0]?.message ?? 'Unknown error',
                    stack: first.error?.stack ?? '',
                    retries: results.length - 1,
                    // ⚠️ Recorded, not inferred later: "passed on retry" is the only mechanical
                    // evidence of flakiness available here, and it is lost once the report is gone.
                    isFlaky: flaky,
                    file: spec.file ?? suite.file ?? null,
                });
            }
        }
        for (const child of suite.suites ?? []) walk(child, path);
    };
    for (const s of report.suites ?? []) walk(s, []);
    return out;
}

/** A plain array of `{ testName?, error, stack? }` — the lingua franca for any other runner. */
function fromArray(arr) {
    return arr.map((f) => ({
        testName: f.testName ?? f.test ?? f.name ?? null,
        error: f.error ?? f.message ?? '',
        stack: f.stack ?? '',
        retries: f.retries ?? 0,
        isFlaky: Boolean(f.isFlaky),
        file: f.file ?? null,
    }));
}

/**
 * Read failures from a Playwright JSON report, a JSON array, a raw log file, or a directory of logs.
 *
 * ⚠️ An input it cannot parse THROWS rather than returning an empty list. "0 failures" and "I could
 * not read your report" must never look the same — that is the whole lesson of this codebase.
 */
export function readFailures(path) {
    const st = statSync(path);
    if (st.isDirectory()) {
        const files = readdirSync(path).filter((f) => /\.(json|log|txt)$/.test(f));
        if (!files.length) throw new Error(`no .json/.log/.txt files in ${path}`);
        return files.flatMap((f) => readFailures(join(path, f)));
    }
    const text = readFileSync(path, 'utf8');
    if (/\.json$/.test(path)) {
        let parsed;
        try { parsed = JSON.parse(text); } catch (e) { throw new Error(`${path} is not valid JSON: ${e.message}`); }
        if (Array.isArray(parsed)) return fromArray(parsed);
        if (parsed.suites) return fromPlaywright(parsed);
        if (Array.isArray(parsed.failures)) return fromArray(parsed.failures);
        throw new Error(`${path} is JSON but not a shape I recognise — expected a Playwright report (.suites), an array, or { failures: [] }`);
    }
    // A raw log: one failure, the whole text.
    return [{ testName: null, error: text, stack: '', retries: 0, isFlaky: false, file: path }];
}

/** Steps 1-4. Deterministic in, deterministic out. */
export function triage(failures) {
    const printed = failures.map((f) => {
        const raw = [f.error, f.stack].filter(Boolean).join('\n');
        // The test name is passed as a KNOWN anchor, not buried in the text for a regex to re-find.
        return { ...f, ...fingerprintOf(raw, { testName: f.testName ?? undefined }) };
    });
    const { groups, links, unanchored } = cluster(printed);

    // Flakiness is a property of the GROUP, not of one run: a fingerprint that both failed and
    // passed-on-retry is the mechanical definition, and the rate decides quarantine.
    for (const g of groups) {
        const flaky = g.members.filter((m) => m.isFlaky).length;
        g.flakyCount = flaky;
        g.flakyRate = Number((flaky / g.members.length).toFixed(3));
        g.retried = g.members.some((m) => m.retries > 0);
    }
    return { groups, links, unanchored, total: printed.length };
}
