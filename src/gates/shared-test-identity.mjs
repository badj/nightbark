import { validateGate } from '../gate.mjs';

/**
 * The same identity hard-coded in more than one spec file.
 *
 * This is the fixture-collision shape that actually bites, and it is invisible from inside any
 * single file — which is why this gate is `kind: 'project'`.
 *
 * One spec using `checkout.user@example.com` is test data. TWO specs using it are sharing one
 * account, and from that moment:
 *
 *   - they cannot run in parallel without interfering (one logs the other out, mutates its cart,
 *     consumes its one-time code, or trips a rate limit the other is about to assert on);
 *   - a second run on the same day can fail on state the first run left behind;
 *   - and the failure surfaces in whichever test got there second, which is almost never the test
 *     that caused it. That is the expensive part: the red lands somewhere unrelated.
 *
 * ⚠️ The single-file case is deliberately NOT reported. Flagging every hard-coded address would be
 * nagging, and nagging is how a tool teaches people to ignore it. Two files is the signal.
 */

const EMAIL = /\b[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// Phone-shaped: 9+ digits, optionally with +, spaces or dashes. Long enough not to catch versions.
const PHONE = /(?<![\w.])\+?\d[\d\s-]{8,16}\d(?![\w.])/g;

export default validateGate({
    id: 'shared-test-identity',
    kind: 'project',
    title: 'One identity hard-coded across several spec files',
    why: 'Two specs sharing an account cannot run in parallel safely and cannot be re-run cleanly: '
        + 'one logs the other out, mutates its data, consumes its one-time code, or trips a quota the '
        + 'other was about to assert on. The failure then lands in whichever test arrived second, '
        + 'which is almost never the one at fault — so the red points at the wrong place. Allocate '
        + 'per-test identities from a pool or a factory, and make teardown return them.',
    severity: 'error',
    scope: 'test-code',

    appliesTo: (path) => /\.[cm]?[tj]sx?$/.test(path) || /\.feature$/.test(path),

    collect({ path, lines }, state) {
        state.seen ??= new Map(); // literal -> Map<file, firstLine>
        lines.forEach((line, i) => {
            if (isNoise(line)) return;
            for (const re of [EMAIL, PHONE]) {
                re.lastIndex = 0;
                for (const m of line.matchAll(re)) {
                    const literal = m[0].trim();
                    if (!isIdentityLike(literal)) continue;
                    const files = state.seen.get(literal) ?? new Map();
                    if (!files.has(path)) files.set(path, i + 1);
                    state.seen.set(literal, files);
                }
            }
        });
    },

    report(state) {
        const findings = [];
        for (const [literal, files] of state.seen ?? []) {
            if (files.size < 2) continue; // one file is data; two is shared state
            const [[firstFile, firstLine], ...rest] = [...files];
            const others = rest.map(([f, l]) => `${f}:${l}`).join(', ');
            findings.push({
                file: firstFile,
                line: firstLine,
                message: `"${literal}" is hard-coded in ${files.size} spec files — also ${others}`,
            });
        }
        // Stable order so output is diffable between runs.
        return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    },

    fixtures: { fires: 'shared-test-identity/fires', silent: 'shared-test-identity/silent' },
});

/**
 * Lines that mention an identity without OWNING one.
 *
 * The big one is invalid-input tables. A format-validation test lists a dozen malformed addresses on
 * purpose; none of them is a shared account, and reporting them would bury the real finding.
 */
function isNoise(line) {
    const l = line.trim();
    if (l.startsWith('//') || l.startsWith('*') || l.startsWith('#')) return true;
    // A line holding several addresses is a table of inputs, not one account in use.
    if ((l.match(EMAIL)?.length ?? 0) > 1) return true;
    // Explicitly negative test data.
    if (/invalid|malformed|bad[-_ ]?(email|address)|notanemail|wrong|reject|should ?fail/i.test(l)) return true;
    // An address chosen BECAUSE it does not exist. Several specs can share "a user that is not
    // there" with no risk whatever — there is no state to collide on. This was the gate's first
    // false positive: `getUserByEmail("nonexistent@example.com")` in three API specs.
    if (/nonexistent|does[-_ ]?not[-_ ]?exist|unknown|not[-_ ]?found|missing|deleted|ghost|absent/i.test(l)) return true;
    // Values composed at run time are unique per run, which is the correct pattern.
    if (/Date\.now\(|uuid|randomUUID|faker\.|\$\{|Math\.random/.test(l)) return true;
    return false;
}

/** Filter out things the regexes catch that are not identities: versions, dates, selectors. */
function isIdentityLike(literal) {
    if (literal.includes('@')) {
        // Package specifiers and scoped imports are not people.
        if (/^@/.test(literal) || /\.(ts|js|tsx|jsx|json|css|png|svg)$/i.test(literal)) return false;

        // ⚠️ RESERVED DOMAINS CANNOT RECEIVE MAIL, so an address on one is definitionally not a
        // real account with state behind it. RFC 2606 reserves example.com/.org/.net and the
        // .test / .example / .invalid TLDs; RFC 6761 adds .localhost. This is a rule grounded in a
        // standard rather than a guess at intent, which is why it is preferred to keyword-matching.
        //
        // ⚠️ It does cost something, and the trade is deliberate: a suite whose REAL seeded accounts
        // live on example.com becomes invisible to this gate. Measured before choosing — the first
        // target's real seed user is on its own domain, and reserved-domain addresses there were all
        // not-found probes. Revisit if a target is ever found that seeds real accounts on example.*.
        const domain = literal.split('@')[1]?.toLowerCase() ?? '';
        if (/^(?:example\.(?:com|org|net)|.*\.(?:test|example|invalid|localhost))$/.test(domain)) return false;

        return true;
    }
    const digits = literal.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 15) return false;
    if (/^(?:19|20)\d{6}$/.test(digits)) return false;   // a date like 20261009
    if (/^0+$/.test(digits)) return false;
    return true;
}
