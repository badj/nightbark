import { createHash } from 'node:crypto';
import { normalise } from './normalise.mjs';
import { anchorsOf } from './anchors.mjs';

/**
 * Steps 3 — HASH THE CANONICAL FORM.
 *
 * Deterministic by construction: same anchors in, same 16 hex characters out, in this process or any
 * other, today or next year. That property is the whole reason deduplication is NOT an LLM's job —
 * a model asked twice whether two errors match may answer differently, and a dedup that is not
 * reproducible silently merges distinct bugs.
 *
 * ⚠️ Empty anchors are OMITTED rather than written as empty fields. Keeping the separators would make
 * a failure with no URL and a failure with no status code hash differently from the same failure
 * parsed by a slightly better extractor later — i.e. improving the parser would invalidate every
 * stored fingerprint.
 */
export function canonicalForm(anchors) {
    return [
        anchors.exceptionType,
        anchors.messageTemplate,
        anchors.frames?.length ? anchors.frames.join(',') : null,
        anchors.testName,
        anchors.urlPattern,
        anchors.statusCode,
    ].filter(Boolean).join('|');
}

/**
 * @param {string} raw            the failure text (message + stack)
 * @param {{testName?: string}} known  anchors the CALLER already knows for certain
 *
 * ⚠️ `known` exists because a structured report hands us the test name as a FIELD, while the text
 * extractors only find one if the log happens to carry Playwright's `›` or Jest's `●` markers. The
 * first version ignored the field, so the test-name anchor silently vanished from the canonical form
 * and two different tests failing on one bug collapsed into a single fingerprint. That is wrong per
 * the discipline's own dedup table: "same root cause, different symptom" is SEPARATE fingerprints
 * that cluster together and get a parent ticket — collapsing them loses which tests are affected.
 */
export function fingerprintOf(raw, known = {}) {
    const normalised = normalise(raw);
    const anchors = { ...anchorsOf(normalised) };
    if (known.testName) anchors.testName = known.testName;
    const canonical = canonicalForm(anchors);
    // ⚠️ A failure nothing could be extracted from must NOT silently share a fingerprint with every
    // other unparseable failure — that is one giant false cluster. It is reported as unanchored.
    if (!canonical) return { fingerprint: null, canonical: '', anchors, normalised, unanchored: true };
    return {
        fingerprint: createHash('sha256').update(canonical).digest('hex').slice(0, 16),
        canonical,
        anchors,
        normalised,
        unanchored: false,
    };
}
