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

            // A line that DECLARES a helper is not a line that calls one. Both false positives this
            // gate shipped with were of that shape (caught by its own silent fixture).
            if (isDeclaration(code)) return;

            const hit = matchSleep(code);
            if (!hit) return;

            // ⛔ ONE exemption gate, applied to EVERY shape, and that structure is the actual fix.
            //
            // Three times now a guard has been added to one branch and not swept onto its siblings:
            // the poll guard went on `setTimeout`, then later on `waitForTimeout`, and was STILL
            // missing from the named-sleep branch when a real suite was audited — where it fired on
            // a textbook polling loop in a mail client (`await this.delay(500)` under a deadline,
            // returning early on success and throwing on timeout). Same defect, third branch.
            //
            // Per-branch guards made that inevitable, so the shapes and the exemptions are now
            // separated: `matchSleep` says WHAT this line is, `exemptBecause` says whether the sleep
            // is legitimate, and no branch can be added that skips the second question.
            const exempt = exemptBecause(lines, i, code);
            if (exempt) return;

            found.push({ line: i + 1, message: hit, excerpt: line.trim() });
        });
        return found;
    },

    // `expect` declared so a guard cannot silently start suppressing a real finding. The 4th is a
    // sleep inside an ITERATION loop, which an over-eager poll guard hid until a real repo exposed it.
    fixtures: { fires: 'fixed-wait/fires.ts', silent: 'fixed-wait/silent.ts', expect: 4 },
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
    // ⚠️ INDENTATION, NOT A FIXED LOOKBACK. The first version scanned ten lines up for a loop
    // header, which works on a tight poll and fails on a real one. Measured on Ghost's mail client:
    //
    //     while (Date.now() < deadline) {              <- indent 4, FOURTEEN lines above
    //       const messages = await this.search();
    //       if (...) { ... return messages; }          <- a nested if/else in between
    //       } else { ... }
    //       await this.delay(500);                     <- indent 6, flagged
    //     }
    //
    // The sleep is plainly the poll interval; the header was simply out of the window. So instead of
    // guessing a distance, walk out of the enclosing blocks: the first line ABOVE this one that is
    // indented LESS and opens a block is the block we are in. If that block is a loop, the sleep is
    // an interval. Nested if/else between the two no longer hides the loop, because those are
    // indented at or beyond the sleep and are skipped.
    const indentOf = (s) => s.search(/\S/);
    const mine = indentOf(lines[index]);
    if (mine < 0) return false;

    for (let j = index - 1, outer = mine; j >= Math.max(0, index - 80); j--) {
        const line = lines[j];
        const ind = indentOf(line);
        if (ind < 0) continue;                       // blank
        if (ind >= outer) continue;                  // same or deeper block — not our encloser
        if (!/\{\s*$/.test(line)) { outer = ind; continue; }   // a less-indented non-opener: keep climbing
        if (isPollLoop(line)) return true;
        // ⚠️ An ITERATION loop is not a poll, and treating it as one was a false NEGATIVE I
        // introduced while fixing a false positive — the worse trade, because it is the silent one.
        // Measured on Ghost: `await page.waitForTimeout(500)` immediately before a screenshot, inside
        // `for (const screen of SCREENS) { test(...) }`. A genuine fixed sleep, suppressed because
        // SOME enclosing loop existed. A loop only makes a sleep an interval if the loop is RE-TESTING
        // something; iterating a fixed list is not that. So a for..of/for..in is explicitly not a poll
        // and we keep climbing out of it.
        if (/\bfor\s*\(/.test(line)) { outer = ind; continue; }
        // An enclosing function body means we have left every loop without finding one.
        if (/\b(?:function|=>)\b/.test(line)) return false;
        outer = ind;
    }
    return false;
}

/**
 * Is this loop header a POLL — a loop that re-tests a condition — rather than an iteration?
 *
 * A poll has a condition that can stop it early: a deadline, a counter, a flag. Iterating a known
 * list has none, so a sleep inside it is paid once per element and is a fixed wait like any other.
 *
 *   while (Date.now() < deadline)        poll      — the sleep is the interval
 *   while (!hit && attempts < max)       poll
 *   for (let i = 0; i < retries; i++)    poll      — a bounded retry
 *   for (;;)                             poll
 *   for (const screen of SCREENS)        ITERATION — a sleep here is a real finding
 */
function isPollLoop(line) {
    if (/\bfor\s*\(\s*(?:const|let|var)?\s*[\w$[\]{},\s]+\s+(?:of|in)\s/.test(line)) return false;
    if (/\bdo\s*\{/.test(line)) return true;
    if (/\bwhile\s*\(/.test(line)) return true;
    return /\bfor\s*\(\s*;\s*;|\bfor\s*\([^)]*[<>]=?[^)]*;/.test(line);
}

/** Does this line DEFINE a function rather than call one? `const sleep = ms => setTimeout(...)`. */
function isDeclaration(code) {
    return /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let|var)\s+\w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\(|\w+\s*=>))/.test(code)
        || /^\s*declare\s+/.test(code);
}

/**
 * WHAT this line is — the three shapes of a fixed sleep. Returns a message, or null.
 *
 * Deliberately knows nothing about whether the sleep is justified; that is `exemptBecause`'s job.
 * Keeping the two apart is what stops a new shape shipping without the guards.
 */
function matchSleep(code) {
    const sleep = code.match(/\b(?:waitForTimeout|cy\.wait)\s*\(\s*(\d{2,})\s*\)/);
    if (sleep) return `unconditional ${sleep[0].trim()} — waits on the clock, not on a signal`;

    // ⚠️ The delay must be a NUMERIC LITERAL. A named interval (`pollIntervalMs`) is a configured
    // parameter, not a guess baked into one line.
    const hand = code.match(/setTimeout\s*\(\s*[\w$]+\s*,\s*(\d{2,})\s*\)/);
    if (hand && /\b(?:await|Promise)\b/.test(code)) {
        return 'hand-rolled sleep via setTimeout — same failure mode as waitForTimeout, harder to grep for';
    }

    const helper = code.match(/\b(?:sleep|delay|pause)\s*\(\s*\d{2,}\s*\)/);
    if (helper && !/function|=>|const|let|var/.test(code)) {
        return `${helper[0].trim()} — a named sleep is still a sleep`;
    }
    return null;
}

/**
 * WHETHER the sleep is legitimate. Returns the reason it is exempt, or null.
 *
 * Every one of these was measured as a false positive on a real repository, and each is a pattern a
 * competent engineer would defend — which is the bar, per TIER-1: not "how many findings" but "how
 * many a competent engineer agrees with".
 */
function exemptBecause(lines, index, code) {
    // 1. A POLL INTERVAL. The pattern this gate's own advice tells people to migrate TO, so
    //    flagging it reports the remedy as the defect.
    if (insidePollLoop(lines, index)) return 'poll interval';

    // 2. ⛔ A SLEEP INSIDE A ROUTE HANDLER IS THE STIMULUS, NOT THE WAIT — and this one inverts the
    //    gate's whole premise. Measured on Rocket.Chat and element-web:
    //
    //        await page.route('**/fetch', async (route, request) => {
    //          await new Promise((r) => setTimeout(r, 1000));   // Simulate network delay
    //          await route.continue();
    //        });
    //
    //    The test asserts a popover stays open while a load is slow. The delay IS the condition
    //    under test — deleting it deletes the test. A gate that says "replace this with a wait on
    //    the thing you depend on" is asking the author to remove the thing they are depending on.
    if (insideRouteHandler(lines, index)) return 'latency simulated inside a route handler';

    // 3. THE DEADLINE ARM OF A RACE. A setTimeout whose continuation THROWS is a timeout, not a
    //    sleep — it is how a bounded wait is given an upper limit:
    //
    //        const timeoutPromise = new Promise((r) => setTimeout(r, 1000))
    //            .then(() => { throw new Error(`Timeout waiting for ${x}`); });
    //        await Promise.race([readyPromise, timeoutPromise]);
    //
    //    Measured on element-web. The poll guard does not cover it, because there is no loop.
    if (isDeadlineArm(lines, index, code)) return 'deadline arm of a race';

    return null;
}

/**
 * Is this line inside a `page.route(...)` handler?
 *
 * Generous by design — a short lookback for the handler opening, no brace matching. Per the gate's
 * standing rule, missing a finding is cheaper than publishing a wrong one, and a sleep within a
 * dozen lines of a route handler is overwhelmingly part of it.
 */
function insideRouteHandler(lines, index) {
    const back = lines.slice(Math.max(0, index - 12), index).join('\n');
    const opened = back.lastIndexOf('.route(');
    if (opened === -1) return false;
    // If the handler has already handed control back, we are past it.
    const closed = Math.max(back.lastIndexOf('route.continue('), back.lastIndexOf('route.fulfill('), back.lastIndexOf('route.abort('));
    return closed < opened;
}

/** Does this sleep exist only to FAIL after a deadline? Then it is a timeout, not a wait. */
function isDeadlineArm(lines, index, code) {
    // `setTimeout(() => reject(...), ms)` — the rejection is on the same line.
    if (/\breject\s*\(/.test(code)) return true;
    // `new Promise(r => setTimeout(r, ms)).then(() => { throw ... })` — possibly wrapped.
    //
    // ⚠️ `index` is 0-BASED here. An earlier `slice(index - 1, …)` mixed in the 1-based convention
    // used for reported line numbers, and at index 0 that becomes slice(-1, 6) — which silently
    // wraps to the LAST line of the file. It worked on the repo it was written against (the match
    // was at line 361) and failed only at the very top of a file. Boundary probes exist for this.
    const forward = lines.slice(index, index + 7).join('\n');
    return /\)\s*\)?\s*\.then\s*\(/.test(forward) && /\bthrow\b|\breject\s*\(/.test(forward);
}
