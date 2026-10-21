import { readFileSync } from 'node:fs';
import { walk, looksLikeTestCode } from '../runner.mjs';
import { buildIndex, resolveLocator, locatorExpressions } from './locators.mjs';
import { buildSpecIndex, contractFor, namedFeatures } from './contract.mjs';

/**
 * The vacuity Irregular — candidate finder.
 *
 * Finds assertions that CAN pass without proving anything, and hands each to a judge with the
 * context needed to decide whether it actually does. It does not decide; see ADR-0005.
 *
 * ⚠️ RECALL IS THE TARGET HERE, NOT PRECISION — the opposite of a gate, and the distinction is the
 * whole reason this works. The negative-assertion shape was measured at 0 of 3 as a gate and
 * rejected. As a candidate finder it is exactly right: catch every assertion of the shape, let the
 * judge throw out the ones whose premise is established. A shape too ambiguous to be a gate is a
 * good candidate finder.
 *
 * So: over-collect deliberately. The cost of a surplus candidate is a few tokens. The cost of a
 * missed one is a defect that stays hidden, and the whole project is named after that.
 */

/**
 * Assertions that pass when the thing under test is ABSENT rather than correct.
 *
 * Each needs a premise established somewhere — that the element existed, that the list had items,
 * that the value was ever set. Absent that premise, the assertion is true of an empty page.
 */
const VACUOUS_SHAPES = [
    { re: /\.not\.toBeVisible\s*\(/, kind: 'negative-visibility', q: 'was this element ever shown?' },
    { re: /\.toBeHidden\s*\(/, kind: 'negative-visibility', q: 'was this element ever shown?' },
    { re: /\.not\.toBeAttached\s*\(/, kind: 'negative-presence', q: 'was this element ever attached?' },
    { re: /\.toHaveCount\s*\(\s*0\s*\)/, kind: 'empty-count', q: 'did this list ever have items?' },
    // ⚠️ WORDED CAREFULLY AFTER AN INDEPENDENT JUDGE FLAGGED THE AMBIGUITY. "did this node ever have
    // text?" has two readings — does the NODE exist, or did it ever hold THAT STRING — and the brief
    // implied one while the question implied the other. The judge answered on presence and flagged
    // the gap itself, which is a better outcome than guessing, but an ambiguous question is a bug.
    // Presence is the question; the transient-string gap is a secondary note the judge can add.
    { re: /\.not\.toContain(?:Text)?\s*\(/, kind: 'negative-content', q: 'is the container element itself established as present? (not whether it held that particular string)' },
    { re: /\.not\.toHaveText\s*\(/, kind: 'negative-content', q: 'is the node itself established as present? (not whether it ever held that particular string)' },
    { re: /\.toBeFalsy\s*\(/, kind: 'falsy', q: 'would undefined also satisfy this?' },
    { re: /\.not\.toBeTruthy\s*\(/, kind: 'falsy', q: 'would undefined also satisfy this?' },
    { re: /\.toBeNull\s*\(/, kind: 'falsy', q: 'would a missing value also satisfy this?' },
    { re: /\.not\.toBeEnabled\s*\(/, kind: 'negative-state', q: 'was this control ever present and enabled?' },
    { re: /\.not\.toHaveBeenCalled\s*\(/, kind: 'negative-call', q: 'is the spy wired to the thing that would call it?' },
];

const TEST_START = /^\s*(?:await\s+)?(?:test|it)(?:\.\w+)*\s*\(\s*[`'"]([^`'"]*)[`'"]/;
const GHERKIN_SCENARIO = /^\s*Scenario(?:\s+Outline)?\s*:\s*(.+)$/;
const GHERKIN_BACKGROUND = /^\s*Background\s*:/;
const HOOK_START = /^\s*(?:beforeEach|beforeAll|before)\s*\(/;

export function candidates(root, { max = 200, resolveLocators = true } = {}) {
    const out = [];
    // One index for the whole run. Moriarty named withholding page objects as the biggest push
    // toward wrongly confirming a finding, so resolution is ON by default, not an opt-in.
    const index = resolveLocators ? buildIndex(root) : null;
    // spec-kit requirements, if the repo has any. Empty otherwise, and then no candidate changes.
    const specIndex = buildSpecIndex(root);

    for (const file of walk(root)) {
        let text;
        try { text = readFileSync(file.abs, 'utf8'); } catch { continue; }
        const isFeature = file.path.endsWith('.feature');
        if (!isFeature && !looksLikeTestCode(file.path, text)) continue;

        const lines = text.split('\n');
        const blocks = isFeature ? gherkinBlocks(lines) : jsBlocks(lines);
        const shared = isFeature ? gherkinBackground(lines) : jsHooks(lines);
        // Everything before the first test: where a file-level "covers FR-xxx" comment lives.
        const header = lines.slice(0, blocks[0]?.start ?? lines.length);
        const named = specIndex.size ? namedFeatures(text) : new Set();

        lines.forEach((line, i) => {
            if (/^\s*(?:\/\/|\*|#)/.test(line)) return;       // a commented assertion asserts nothing
            for (const { re, kind, q } of VACUOUS_SHAPES) {
                if (!re.test(line)) continue;
                const block = blocks.find((b) => i >= b.start && i <= b.end);
                out.push({
                    // A bare path:line collides if one line holds two candidate shapes. Suffix on
                    // the kind so every id is unique and still human-readable.
                    id: `${file.path}:${i + 1}#${kind}`,
                    file: file.path,
                    line: i + 1,
                    kind,
                    assertion: wholeCall(lines, i),
                    // ⚠️ The joined form is readable but does NOT match the file, so a judge quoting
                    // it produces un-greppable evidence. Carry the verbatim first line as well.
                    assertionVerbatim: line.replace(/\s+$/, ''),
                    testName: block?.name ?? '(not inside a named test)',
                    // The premise is rarely on the adjacent line — it is usually several statements
                    // back, or in setup. Give the judge the whole block rather than a window.
                    testBody: block ? lines.slice(block.start, block.end + 1) : [line],
                    sharedSetup: shared,
                    question: q,
                    // What the test was SUPPOSED to prove, when it cites a spec-kit requirement. Every
                    // definition of each id, not a guessed one: see contract.mjs for why (0 of 4).
                    contract: contractFor(specIndex, block ? lines.slice(block.start, block.end + 1) : [line], header, named),
                    // The locator, traced to where it is DEFINED — plus every other place it is
                    // asserted on, which is what settles "is this selector even live?".
                    locators: index
                        ? locatorExpressions(line, block ? lines.slice(block.start, block.end + 1) : [])
                            .map((e) => resolveLocator(index, e))
                        : [],
                });
                break;  // one candidate per line; the first shape that matches names it
            }
        });
        if (out.length >= max) break;
    }
    return out.slice(0, max);
}

/** test(...) / it(...) blocks, bounded by the next block start rather than by brace counting. */
function jsBlocks(lines) {
    const starts = [];
    lines.forEach((l, i) => {
        const m = l.match(TEST_START);
        if (m) starts.push({ start: i, name: m[1] });
    });
    return starts.map((s, k) => ({
        ...s,
        end: (starts[k + 1]?.start ?? lines.length) - 1,
    }));
}

function gherkinBlocks(lines) {
    const starts = [];
    lines.forEach((l, i) => {
        const m = l.match(GHERKIN_SCENARIO);
        if (m) starts.push({ start: i, name: m[1].trim() });
    });
    return starts.map((s, k) => ({ ...s, end: (starts[k + 1]?.start ?? lines.length) - 1 }));
}

/**
 * Shared setup, capped.
 *
 * ⚠️ A premise is very often established in a hook rather than in the test, so omitting this would
 * make the judge answer "no premise" for perfectly sound tests — manufacturing false positives at
 * the one step where they are most expensive. Capped because a judge given a whole file drifts off
 * the question it was asked.
 */
function jsHooks(lines, cap = 40) {
    const out = [];
    lines.forEach((l, i) => {
        if (!HOOK_START.test(l)) return;
        out.push(...lines.slice(i, Math.min(i + cap, lines.length)));
    });
    return out.slice(0, cap * 2);
}

function gherkinBackground(lines, cap = 30) {
    const i = lines.findIndex((l) => GHERKIN_BACKGROUND.test(l));
    if (i === -1) return [];
    const end = lines.findIndex((l, k) => k > i && /^\s*(?:Scenario|@)/.test(l));
    return lines.slice(i, end === -1 ? Math.min(i + cap, lines.length) : end);
}

/**
 * The WHOLE assertion, even when it spans lines.
 *
 * ⚠️ Found while reading the first generated brief, and it mattered more than it looks. Prettier
 * wraps a long matcher, so the candidate line was emitted as:
 *
 *     await expect(productDetailPage.addToCartButton).not.toHaveText(
 *
 * — with the argument on the next line. A judge shown that fragment cannot see WHAT is being
 * asserted and has no choice but to answer "uncertain", so the brief would have manufactured
 * uncertainty out of perfectly clear code. Capped at a few lines: an assertion longer than that is
 * its own kind of finding.
 */
function wholeCall(lines, i, maxLines = 6) {
    let depth = 0, seen = false, outLines = [];
    for (let k = i; k < Math.min(i + maxLines, lines.length); k++) {
        outLines.push(lines[k]);
        for (const ch of lines[k]) {
            if (ch === '(') { depth++; seen = true; }
            else if (ch === ')') depth--;
        }
        if (seen && depth <= 0) break;
    }
    return outLines.map((l, k) => (k === 0 ? l.trim() : l.trim())).join(' ').replace(/\s+/g, ' ');
}
