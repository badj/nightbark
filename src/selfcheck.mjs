import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { walk } from './runner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Enforce ADR-0001 on THIS repository: no client-identifying content, ever.
 *
 * ⚠️ WHY THIS IS A SEPARATE COMMAND AND NOT A GATE. `audit` inspects somebody else's suite, where
 * their own identifiers are entirely legitimate — a gate like this in the default set would flag
 * every hostname in every target. This checks the one repo that must stay clean: ours.
 *
 * ⚠️ AND NOW THE PARADOX, which is the interesting part. To detect a client's identifiers by name,
 * this file would have to CONTAIN them — committing the exact strings ADR-0001 forbids, and in the
 * most quotable place possible. A checker that violates its own rule is worse than none.
 *
 * So it works two ways, neither of which puts a client string in the repo:
 *
 *   1. SHAPE patterns, below. Generic and client-agnostic: internal corporate hostnames, private
 *      IP ranges, bearer-token shapes, and the traceability-id notations that only exist inside a
 *      company's own tracker. None of them names anybody.
 *   2. An optional `.nightbark-denylist` — gitignored, so the literal terms live on the machine
 *      doing the checking and never in version control. Absent, the shape rules still run.
 *
 * The denylist being absent is NOT a pass, and the output says so. A checker that reports "clean"
 * when it had nothing to check is the precise failure mode this project is named after.
 */

const SHAPES = [
    {
        id: 'internal-hostname',
        re: /\b[a-z0-9][\w.-]*\.(?:internal|corp|intranet|local|lan)\.[a-z]{2,}\b/gi,
        why: 'an internal corporate hostname — resolvable only inside one network, so it can only have come from one',
    },
    {
        id: 'private-ip',
        re: /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}|192\.168)\.\d{1,3}\.\d{1,3}\b/g,
        why: 'a private-range IP address, which is a fact about somebody\'s network',
    },
    {
        id: 'tracker-id-notation',
        // @ado_123456 / @[123456] — notations that only mean anything inside one company's tracker.
        re: /@(?:ado|jira|tfs)[_-]\d{4,}\b|@\[\d{5,}\]/gi,
        why: 'a work-item id in a company-internal traceability notation',
    },
    {
        id: 'wiki-or-tracker-id-in-path',
        // ⚠️ ADDED AFTER A REAL LEAK, BY ME, INTO THIS REPO'S OWN README. While documenting that the
        // shared-identity gate had mistaken Confluence page ids for phone numbers, I pasted one of
        // the actual ids as the example. ADR-0001 forbids exactly that, and the rules above did not
        // catch it: `tracker-id-notation` only matches @ado_123456 / @[123456] NOTATION, not a bare
        // digit run sitting in a URL path. A long number inside a wiki or tracker path is an
        // identifier for somebody's internal page, so it is matched on SHAPE now.
        re: /\/(?:pages|wiki|workitems|_workitems|browse|issues?)\/[\w+.%-]*\b\d{6,}\b/gi,
        why: 'a long numeric id inside a wiki or tracker path — an identifier for somebody\'s internal page',
    },
    {
        id: 'bearer-token',
        re: /\b(?:ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{30,})\b/g,
        why: 'something shaped like a live credential',
    },
];

/** Files whose job is to discuss these rules, so a mention is the content rather than a leak. */
const ALLOW_PATHS = [/^docs\/adr\//, /^src\/selfcheck\.mjs$/, /^fixtures\/selfcheck\//];

export function selfcheck({ root = ROOT } = {}) {
    const denylist = loadDenylist(root);
    const findings = [];

    for (const file of walk(root)) {
        if (ALLOW_PATHS.some((re) => re.test(file.path))) continue;
        let text;
        try { text = readFileSync(file.abs, 'utf8'); } catch { continue; }
        const lines = text.split('\n');

        lines.forEach((line, i) => {
            for (const { id, re, why } of SHAPES) {
                re.lastIndex = 0;
                const m = re.exec(line);
                if (m) findings.push({ rule: id, file: file.path, line: i + 1, hit: m[0], why });
            }
            for (const term of denylist) {
                if (line.toLowerCase().includes(term.toLowerCase())) {
                    // Never echo the term itself — that would reproduce it in the output and,
                    // eventually, in a log somebody commits.
                    findings.push({ rule: 'denylist', file: file.path, line: i + 1, hit: '(redacted)', why: 'matches a term in .nightbark-denylist' });
                }
            }
        });
    }
    return { findings, denylistTerms: denylist.length, shapeRules: SHAPES.length };
}

function loadDenylist(root) {
    const p = join(root, '.nightbark-denylist');
    if (!existsSync(p)) return [];
    return readFileSync(p, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
}
