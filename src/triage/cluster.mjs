/**
 * Step 4 — CLUSTER NEAR-DUPLICATES.
 *
 * Exact fingerprint matching catches identical failures. Clustering catches the ones with ONE root
 * cause and several manifestations — the same null deref surfacing in three tests, say. Those are
 * one ticket, and filing three is how a board stops being readable.
 *
 * ⚠️ STILL DETERMINISTIC. The scoring is arithmetic on strings, so the same pair scores the same
 * every time. That is the point: an LLM asked twice whether two errors match may answer differently,
 * and a dedup that is not reproducible merges distinct bugs at random.
 */

/**
 * ⚠️ THE WEIGHTS MUST SUM TO 1.00 — asserted in the tests, not merely intended.
 *
 * Without that assertion a later edit ("bump frames to 0.30") silently changes what every threshold
 * MEANS: 0.75 against a 1.05 total is a different bar than 0.75 against 1.00, and nothing announces
 * the shift. The thresholds below are calibrated against a total of exactly 1.
 */
export const WEIGHTS = {
    exceptionType: 0.30,
    messageTemplate: 0.25,
    frames: 0.25,
    component: 0.10,
    testName: 0.10,
};

export const MERGE_THRESHOLD = 0.75;   // >= this: likely duplicate, SUGGEST a merge
export const REVIEW_FLOOR = 0.60;      // between: ambiguous, a human decides

/** Levenshtein, iterative two-row. Small strings only, so the simple version is the right one. */
export function levenshtein(a = '', b = '') {
    if (a === b) return 0;
    if (!a.length || !b.length) return Math.max(a.length, b.length);
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = row;
    }
    return prev[b.length];
}

export function jaccard(a = [], b = []) {
    if (!a.length && !b.length) return 0;
    const A = new Set(a);
    const B = new Set(b);
    const inter = [...A].filter((x) => B.has(x)).length;
    return inter / (A.size + B.size - inter);
}

/** The module a failure belongs to — its first frame's file, else the test file. */
function componentOf(anchors) {
    const f = anchors.frames?.[0];
    const m = f?.match(/\(([^)]+)\)$/);
    return m ? m[1] : (anchors.testName?.split(/[>›]/)[0]?.trim() ?? null);
}

/**
 * Score one pair, 0..1, and SAY WHICH DIMENSIONS CONTRIBUTED.
 *
 * ⚠️ The breakdown is not decoration. A merge suggestion a human cannot audit gets either rubber-
 * stamped or ignored, and both are worse than no suggestion — so every score carries the reason it
 * reached that number.
 */
export function similarity(a, b) {
    const parts = {};

    parts.exceptionType = a.exceptionType && a.exceptionType === b.exceptionType ? WEIGHTS.exceptionType : 0;

    // Per the discipline: a Levenshtein distance under 20% of the message length counts as a match.
    const ma = a.messageTemplate ?? '';
    const mb = b.messageTemplate ?? '';
    const span = Math.max(ma.length, mb.length);
    parts.messageTemplate = span && levenshtein(ma, mb) < span * 0.2 ? WEIGHTS.messageTemplate : 0;

    parts.frames = jaccard(a.frames, b.frames) > 0.6 ? WEIGHTS.frames : 0;

    const ca = componentOf(a);
    const cb = componentOf(b);
    parts.component = ca && ca === cb ? WEIGHTS.component : 0;

    // "Same describe block or test file" — compare everything left of the last separator.
    const block = (t) => t?.split(/\s*[>›]\s*/).slice(0, -1).join(' > ') || t || null;
    const ba = block(a.testName);
    const bb = block(b.testName);
    parts.testName = ba && ba === bb ? WEIGHTS.testName : 0;

    const score = Number(Object.values(parts).reduce((s, v) => s + v, 0).toFixed(4));
    return { score, parts, verdict: score >= MERGE_THRESHOLD ? 'duplicate' : score >= REVIEW_FLOOR ? 'review' : 'distinct' };
}

/**
 * Group failures: exact fingerprint first, then near-duplicate scoring between the groups.
 *
 * ⛔ NOTHING IS MERGED HERE. A cluster is a SUGGESTION carrying its score and reasoning, because
 * false deduplication costs more than manual triage: a wrongly merged ticket hides a live bug behind
 * one somebody has already closed. Merging is Step 7, and Step 7 is a human.
 */
export function cluster(failures) {
    const exact = new Map();
    const unanchored = [];
    for (const f of failures) {
        if (!f.fingerprint) { unanchored.push(f); continue; }
        if (!exact.has(f.fingerprint)) exact.set(f.fingerprint, []);
        exact.get(f.fingerprint).push(f);
    }

    const groups = [...exact.entries()].map(([fingerprint, members]) => ({
        fingerprint, members, count: members.length, anchors: members[0].anchors,
    })).sort((x, y) => y.count - x.count || x.fingerprint.localeCompare(y.fingerprint));

    const links = [];
    for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
            const s = similarity(groups[i].anchors, groups[j].anchors);
            if (s.verdict !== 'distinct') {
                links.push({ a: groups[i].fingerprint, b: groups[j].fingerprint, ...s });
            }
        }
    }
    links.sort((x, y) => y.score - x.score);
    return { groups, links, unanchored };
}
