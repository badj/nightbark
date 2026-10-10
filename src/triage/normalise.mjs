/**
 * Step 1 — NORMALISE. Strip the noise that makes identical failures look different.
 *
 * Raw CI output is full of timestamps, pids, ports and request ids. Hash it as-is and the same
 * failure gets a new fingerprint every run, so deduplication never fires at all — and a dedup that
 * never fires is indistinguishable from a repo with no duplicates. Normalisation is not a tidying
 * step before the real work; it is the thing that makes the real work possible.
 *
 * ⚠️ ORDER MATTERS and the rules are applied in a fixed sequence. Ports before temp paths, because a
 * path can contain a colon-number that is not a port; request ids before whitespace collapse,
 * because the id pattern depends on the separator that follows the key.
 */

/** Each rule is [name, pattern, replacement]. Named so a surprising fingerprint can be explained. */
export const RULES = [
    ['ansi', /\x1b\[[0-9;]*m/g, ''],
    ['timestamp', /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?/g, '<TIMESTAMP>'],
    ['uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>'],
    ['pid', /pid[=: ]\d+/gi, 'pid=<PID>'],
    ['port', /:\d{4,5}(?=[\s/,)\]]|$)/g, ':<PORT>'],
    ['tmppath', /\/tmp\/[^\s]+/g, '<TMPPATH>'],
    ['address', /0x[0-9a-f]{8,16}/gi, '<ADDR>'],
    ['randsuffix', /[-_][a-z0-9]{6,8}(?=\.)/g, '<RAND>'],
    ['reqid', /(?:request[_-]?id|trace[_-]?id|correlation[_-]?id)[=: ]["']?[a-zA-Z0-9-]+/gi, '<REQ_ID>'],
    ['whitespace', /\s+/g, ' '],
];

export function normalise(raw) {
    let out = String(raw ?? '');
    for (const [, re, to] of RULES) out = out.replace(re, to);
    return out.trim();
}

/**
 * Which rules actually changed this input — for explaining a fingerprint rather than asserting it.
 *
 * ⚠️ A fingerprint is a hash: when two failures that look identical land in different clusters, the
 * only way to find out why is to see which normalisation did or did not fire. Without this the
 * answer is "re-read ten regexes and guess".
 */
export function explain(raw) {
    let cur = String(raw ?? '');
    const applied = [];
    for (const [name, re, to] of RULES) {
        const next = cur.replace(re, to);
        if (next !== cur) applied.push(name);
        cur = next;
    }
    return { normalised: cur.trim(), applied };
}
