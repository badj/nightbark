import { validateGate } from '../gate.mjs';

/**
 * A wait sized by a guess rather than by a signal.
 *
 * `waitForTimeout(3000)` encodes a belief about how long something takes on the machine it was
 * written on. It is simultaneously too long (every run pays it) and too short (the one slow run
 * fails, and fails as a timeout somewhere unrelated, which is the worst kind of red to diagnose).
 *
 * ⚠️ The dangerous case is not the slow one — it is the FALSE PASS. A fixed wait before asserting
 * that something did NOT happen passes whenever the wait is shorter than the thing it is waiting
 * for. The test proves the clock, not the application.
 *
 * Deliberately NOT flagged, because each is a legitimate signal-based wait:
 *   - expect(...).toBeVisible({ timeout: n })   — bounded poll with a condition
 *   - waitForSelector / waitForResponse / waitForFunction / waitForURL / waitForLoadState
 *   - a `timeout` in a config file (a budget, not a sleep)
 */
export default validateGate({
    id: 'fixed-wait',
    title: 'A wait sized by a guess rather than by a signal',
    why: 'A fixed sleep is too long on every normal run and too short on the one that matters. '
        + 'Worse, a fixed wait in front of a negative assertion passes whenever the wait is shorter '
        + 'than the thing it was waiting for, so the test proves the clock rather than the app. '
        + 'Replace it with a condition: a bounded poll, or a wait on the response/selector/state '
        + 'that the step actually depends on.',
    severity: 'warning',

    // 'test-code' means the runner withholds application source from this gate. That matters here:
    // a deliberate sleep in a React component ("simulate order processing delay") is correct
    // behaviour, not a defect, and flagging it cost this gate its first false positive.
    scope: 'test-code',

    // Cheap pre-filter on extension only. The real decision is the runner's `looksLikeTestCode`,
    // which reads content — a path pattern cannot tell `src/pages` (routes) from `pages` (Page
    // Objects), and guessing wrong in that direction is exactly what this gate must not do.
    appliesTo: (path) => /\.[cm]?[tj]sx?$/.test(path),

    check({ lines }) {
        const found = [];
        lines.forEach((line, i) => {
            const code = stripStringsAndComments(line);
            if (!code.trim()) return;

            // A line that DECLARES a helper is not a line that calls one. Both false positives
            // this gate shipped with were of that shape (caught by its own silent fixture).
            if (isDeclaration(code)) return;

            // page.waitForTimeout(500) / cy.wait(500) — an unconditional sleep.
            //
            // ⚠️ THE POLL GUARD BELONGS ON THIS BRANCH TOO, and leaving it off was a sibling of a
            // bug already fixed on the setTimeout branch. Found on a production suite:
            //
            //     while (!hit && Date.now() < deadline) {
            //       await this.page.waitForTimeout(500);   <- flagged. It is the poll INTERVAL.
            //       all = await this.rows();
            //
            // Identical shape, identical wrongness, different branch. Fixing one instance of a
            // defect and not sweeping for its siblings is its own recurring failure.
            const sleep = code.match(/\b(?:waitForTimeout|cy\.wait)\s*\(\s*(\d{2,})\s*\)/);
            if (sleep && !insidePollLoop(lines, i)) {
                found.push({
                    line: i + 1,
                    message: `unconditional ${sleep[0].trim()} — waits on the clock, not on a signal`,
                    excerpt: line.trim(),
                });
                return;
            }

            // await new Promise(r => setTimeout(r, 500)) — the same thing, hand-rolled.
            //
            // ⚠️ TWO GUARDS HERE, BOTH LEARNED THE HARD WAY. This gate's second false positive was
            // a textbook bounded poll:
            //     while (Date.now() - start < timeoutMs) {
            //       if (await condition()) return;
            //       await new Promise((r) => setTimeout(r, pollIntervalMs));   <- flagged. Wrong.
            //     }
            // That is the pattern this gate's own advice tells people to migrate TO, and flagging
            // the remedy as the defect is the fastest way to lose a reader for good.
            //
            //  1. The delay must be a NUMERIC LITERAL. A named interval (`pollIntervalMs`) is a
            //     configured parameter, not a guess baked into one line.
            //  2. A sleep inside a loop is a poll interval, not a wait. Checked by looking upward
            //     for a loop header — deliberately generous, because missing a finding is cheaper
            //     than publishing a wrong one.
            const hand = code.match(/setTimeout\s*\(\s*[\w$]+\s*,\s*(\d{2,})\s*\)/);
            if (hand && /\b(?:await|Promise)\b/.test(code) && !insidePollLoop(lines, i)) {
                found.push({
                    line: i + 1,
                    message: 'hand-rolled sleep via setTimeout — same failure mode as waitForTimeout, harder to grep for',
                    excerpt: line.trim(),
                });
                return;
            }

            // A bare sleep(n) / delay(n) helper call.
            const helper = code.match(/\b(?:sleep|delay|pause)\s*\(\s*\d{2,}\s*\)/);
            if (helper && !/function|=>|const|let|var/.test(code)) {
                found.push({
                    line: i + 1,
                    message: `${helper[0].trim()} — a named sleep is still a sleep`,
                    excerpt: line.trim(),
                });
            }
        });
        return found;
    },

    fixtures: { fires: 'fixed-wait/fires.ts', silent: 'fixed-wait/silent.ts' },
});

/**
 * Remove string literals and line comments before matching.
 *
 * ⚠️ ORDER MATTERS, and getting it wrong is a bug not a nit: strings are stripped FIRST, because
 * stripping `//` first would amputate every line containing a URL (`'http://…'`) at the protocol
 * slashes and then match whatever followed.
 *
 * Why strings at all: this gate's own near-miss fixture contains the sentence
 * `'do not use waitForTimeout(3000) here'`, and the first version of this gate flagged it. Prose and
 * commented-out code are not defects.
 */
function stripStringsAndComments(line) {
    const withoutStrings = line
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\]|\\.)*`/g, '``');
    const i = withoutStrings.indexOf('//');
    return i === -1 ? withoutStrings : withoutStrings.slice(0, i);
}

/**
 * Is this line inside a loop — i.e. is the "sleep" actually a poll interval?
 *
 * Looks up a short way for a loop header. Short on purpose: a long lookback would start treating
 * any sleep in a long function body as a poll and the gate would go quiet. Ten lines covers the
 * shape that matters (a `while`/`for` with a condition check and a delay) without over-reaching.
 */
function insidePollLoop(lines, index) {
    for (let j = index - 1; j >= Math.max(0, index - 10); j--) {
        if (/^\s*(?:\}\s*)?(?:while|for)\s*\(/.test(lines[j])) return true;
        if (/^\s*(?:export\s+)?(?:async\s+)?function\b/.test(lines[j])) break; // left the block
    }
    return false;
}

/** Does this line DEFINE a function rather than call one? `const sleep = ms => setTimeout(...)`. */
function isDeclaration(code) {
    return /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\(|\w+\s*=>))/.test(code)
        || /^\s*declare\s+/.test(code);
}
