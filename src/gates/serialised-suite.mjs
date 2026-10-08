import { validateGate } from '../gate.mjs';

/**
 * Parallelism switched off — the standing cost of shared state.
 *
 * This is the most expensive consequence of a shared fixture, and the one nobody files a bug for.
 * A race on a shared resource does not usually get fixed; it gets *worked around* by making the
 * suite serial. The flake disappears, the cause remains, and from then on every run — forever —
 * pays the full serial duration.
 *
 * The Cypress RealWorld App is the textbook case, upstream and documented:
 *
 *     fileParallelism: false, // #1666: Run tests sequentially to avoid race conditions
 *                             //        with shared database.json file.
 *
 * ⚠️ THIS IS NOT REPORTED AS A MISTAKE, and the framing matters. Serialising is sometimes exactly
 * right — a small shared pool, a single-use passcode, a quota. What rots is the REASON: the cause
 * gets fixed, or the fixture gets isolated, and nobody revisits the switch. The cost then outlives
 * its justification silently, because a passing serial suite looks identical to a healthy one.
 *
 * So the finding is: here is a standing, repo-wide cost; here is the reason recorded for it; is that
 * reason still true? A gate cannot answer the last part — but it can make sure somebody is asked.
 */

const SWITCHES = [
    { re: /\bfullyParallel\s*:\s*false/, what: 'fullyParallel: false', tool: 'Playwright' },
    { re: /\bfileParallelism\s*:\s*false/, what: 'fileParallelism: false', tool: 'Vitest' },
    { re: /\bworkers\s*:\s*1\b/, what: 'workers: 1', tool: 'Playwright' },
    { re: /\bmaxWorkers\s*:\s*1\b/, what: 'maxWorkers: 1', tool: 'Jest' },
    { re: /--runInBand\b/, what: '--runInBand', tool: 'Jest' },
    { re: /\bmode\s*:\s*['"]serial['"]/, what: "mode: 'serial'", tool: 'Playwright' },
    { re: /\bdescribe\.serial\s*\(/, what: 'describe.serial(', tool: 'Playwright' },
];

export default validateGate({
    id: 'serialised-suite',
    title: 'Parallelism switched off — a standing cost whose reason may have expired',
    why: 'A race on a shared fixture is usually worked around by making the suite serial rather than '
        + 'by isolating the fixture. The flake goes; the cause stays; and every run from then on pays '
        + 'the full serial duration. Serialising can be correct — a small pool, a single-use code, a '
        + 'quota — so this is not a mistake report. It is a reminder that the REASON is the thing that '
        + 'rots: once the cause is fixed the switch is rarely revisited, and a passing serial suite '
        + 'looks exactly like a healthy one. Check whether the stated reason is still true.',
    severity: 'warning',

    // Must see CONFIG files, which are not test code — so this gate opts out of the test-code fence.
    scope: 'any',

    // ANY *.config.* file, not just ones named after a known tool. The first version matched
    // `playwright.config.ts` and friends by name, which its own selftest rejected — and the
    // selftest was right about the real world too: plenty of repos use `e2e.config.ts` or
    // `ci.config.ts`, and those would have been invisible. Reading a `tailwind.config.js` costs
    // nothing, because the switches below are specific enough not to match anything in one.
    appliesTo: (path) =>
        /\.config\.[cm]?[tj]s$/.test(path) ||
        /(?:^|\/)package\.json$/.test(path) ||
        /\.(spec|test)\.[cm]?[tj]sx?$/.test(path),

    check({ path, lines }) {
        const found = [];
        lines.forEach((line, i) => {
            for (const { re, what, tool } of SWITCHES) {
                if (!re.test(line)) continue;

                // ⚠️ `workers: process.env.CI ? 1 : undefined` is Playwright's own documented
                // boilerplate and appears in a large share of real repos. Flagging it would make
                // this gate noise on first contact, which is how a tool gets muted.
                if (/process\.env\.CI|isCI|CI\s*\?/.test(line)) return;

                // A commented-out switch is not an active one.
                if (/^\s*(?:\/\/|\*|#)/.test(line)) return;

                const reason = statedReason(lines, i);
                found.push({
                    line: i + 1,
                    message: `${what} (${tool}) — the suite runs serially`
                        + (reason ? `. Reason given: "${reason}" — is that still true?`
                                  : '. ⚠️ NO reason recorded, so nobody can tell whether it is still needed'),
                    excerpt: line.trim(),
                });
                return;
            }
        });
        return found;
    },

    fixtures: { fires: 'serialised-suite/fires.config.ts', silent: 'serialised-suite/silent.config.ts' },
});

/**
 * The reason, if one was written down — trailing comment first, then the line above.
 *
 * Worth extracting rather than just flagging the switch: a reason that names a specific cause
 * ("races on the shared database.json") is checkable, and an absent reason is itself the finding.
 */
function statedReason(lines, i) {
    const trailing = lines[i].match(/\/\/\s*(.+?)\s*$/);
    if (trailing) return trailing[1].slice(0, 120);
    const above = (lines[i - 1] ?? '').match(/^\s*(?:\/\/|\*)\s*(.+?)\s*$/);
    if (above && !/^\s*\*\/\s*$/.test(lines[i - 1])) return above[1].slice(0, 120);
    return null;
}
