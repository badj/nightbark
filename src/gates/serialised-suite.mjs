import { validateGate } from '../gate.mjs';
import { SPEC_FILENAME } from '../testfiles.mjs';

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
    // scope: 'suite' switches parallelism off for EVERYTHING and is paid on every run.
    // scope: 'block' orders tests within one file; other files still run concurrently.
    { re: /\bfullyParallel\s*:\s*false/, what: 'fullyParallel: false', tool: 'Playwright', scope: 'suite' },
    { re: /\bfileParallelism\s*:\s*false/, what: 'fileParallelism: false', tool: 'Vitest', scope: 'suite' },
    { re: /\bworkers\s*:\s*1\b/, what: 'workers: 1', tool: 'Playwright', scope: 'suite' },
    { re: /\bmaxWorkers\s*:\s*1\b/, what: 'maxWorkers: 1', tool: 'Jest', scope: 'suite' },
    { re: /--runInBand\b/, what: '--runInBand', tool: 'Jest', scope: 'suite' },
    { re: /\bmode\s*:\s*['"]serial['"]/, what: "mode: 'serial'", tool: 'Playwright', scope: 'block' },
    { re: /\bdescribe\.serial\s*\(/, what: 'describe.serial(', tool: 'Playwright', scope: 'block' },
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
        SPEC_FILENAME.test(path),

    check({ path, lines }) {
        const found = [];
        let blockLevel = null;   // report ONCE per file, not once per occurrence

        lines.forEach((line, i) => {
            // ⚠️ STRIP STRINGS FIRST. Measured on Ghost: an ESLint config carrying the rule message
            // 'test.describe.serial() is deprecated. Use test.describe.configure({mode: "serial"})'
            // was reported as a serialised suite. That is the SECOND gate to need this guard — the
            // first was shared-test-identity, where a pooled number quoted inside a diagnostic
            // message read as a usage. A matcher that reads string contents as code is a recurring
            // class, not a one-off, which is why it now goes in before anything else.
            const code = stripStrings(line);

            for (const { re, what, tool, scope } of SWITCHES) {
                if (!re.test(code)) continue;

                // ⚠️ `workers: process.env.CI ? 1 : undefined` is Playwright's own documented
                // boilerplate and appears in a large share of real repos. Flagging it would make
                // this gate noise on first contact, which is how a tool gets muted.
                if (/process\.env\.CI|isCI|CI\s*\?/.test(code)) return;

                // A commented-out switch is not an active one.
                if (/^\s*(?:\/\/|\*|#)/.test(line)) return;

                // ⛔ BLOCK-LEVEL IS A DIFFERENT DEFECT FROM SUITE-LEVEL, and conflating them took
                // this gate to 5% precision on a real repository — 92 of 98 findings.
                //
                // `test.describe.serial()` does NOT switch parallelism off: Playwright still runs
                // different FILES concurrently, so the "standing cost on every run" claim is simply
                // false of it, and Rocket.Chat uses it as house style in 92 files. Reporting those
                // as a suite-wide cost is how a reader concludes the gate does not understand their
                // repo — and they would be right.
                //
                // But there IS a real defect hiding in it, and it is worth saying once: a failure
                // inside a serial block SKIPS THE REMAINING TESTS IN THAT BLOCK, so they report as
                // skipped rather than failed. The coverage loss is invisible in a results summary.
                if (scope === 'block') {
                    blockLevel ??= { line: i + 1, excerpt: line.trim(), count: 0 };
                    blockLevel.count++;
                    return;
                }

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

        if (blockLevel) {
            found.push({
                line: blockLevel.line,
                // A note, not a warning: serial ordering inside one file is frequently the correct
                // choice (a chat suite that creates a channel, posts to it, then deletes it), so
                // this reports a CONSEQUENCE to be aware of rather than a mistake to fix.
                severity: 'note',
                message: `${blockLevel.count} serial block(s) in this file — files still run in parallel, so this is `
                    + 'not a suite-wide cost. ⚠️ But a failure inside a serial block SKIPS the remaining tests in '
                    + 'it: they report as skipped, not failed, so the lost coverage does not appear in a results '
                    + 'summary. Worth knowing which tests can vanish quietly when an early one breaks.',
                excerpt: blockLevel.excerpt,
            });
        }
        return found;
    },

    fixtures: { fires: 'serialised-suite/fires.config.ts', silent: 'serialised-suite/silent.config.ts', expect: 4 },
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

/**
 * Blank out PROSE string literals so a matcher cannot read quoted English as code.
 *
 * Second gate to need this. The first learned it from a pooled phone number quoted inside a
 * diagnostic message; this one from an ESLint rule describing the very API it looks for:
 *   'test.describe.serial() is deprecated. Use test.describe.configure({mode: "serial"})...'
 *
 * ⚠️ ONLY LONG LITERALS, and that qualifier is load-bearing — blanking every string would also
 * blank `mode: 'serial'`, where the quoted word IS the value being detected rather than prose about
 * it, and the gate would go silent on a real switch. Caught before running: the naive version would
 * have traded one false positive for a false negative, which is the worse of the two.
 *
 * 20 characters separates them cleanly — a config value is a word, a rule message is a sentence.
 */
const PROSE_MIN = 20;
function stripStrings(line) {
    return line.replace(/(['"`])((?:[^\\]|\\.)*?)\1/g, (m, q, body) => (body.length >= PROSE_MIN ? q + q : m));
}
