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
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * ⚠️ MEASURED ON A 217-FILE PRODUCTION SUITE, 2026-10-09 — AND DEMOTED TO `note` AS A RESULT.
 *
 * First run: 20 findings, around 12% precision. Six rounds of noise rules took it to 4 findings at
 * roughly 25%. That is still below the bar this project set itself (a 60%-precision auditor is worse
 * than none, because the reader stops opening the report), so the severity is now `note` and the
 * message asks a question instead of declaring a defect.
 *
 * WHY IT CANNOT GET MUCH BETTER AS A GATE. Three populations look identical on the line, and only
 * the surrounding MECHANISM tells them apart:
 *
 *   1. MANAGED   a reserved pool handed out per worker behind a lock. Shared on purpose, and
 *                correct. Flagging it is flagging the remedy.
 *   2. PROBE     a boundary or wrong-locale value reused across files deliberately — "too long",
 *                "non-NZ", `maxValid`. That is coverage, not collision.
 *   3. RAW       a hard-coded account with no allocator anywhere near it. The actual defect.
 *
 * Deciding between those needs the allocation mechanism read, not the line — which is exactly the
 * boundary ADR-0004 draws. So this shape wants an IRREGULAR, and this gate is the cheap pre-filter
 * that hands it a shortlist. That is the SECOND shape evidence has pushed from gate to agent (the
 * first was vacuity), which is itself a finding about where the boundary really sits.
 *
 * 🔭 THE ONE TRUE POSITIVE IS THE DESIGN BRIEF FOR THAT IRREGULAR. On the mature suite the single
 * genuine finding was a spare value DEFINED AS A CONSTANT ALONGSIDE a pool it was not part of — an
 * allocator existed and this value sat outside it. The repo's own notes record it causing a real
 * concurrent-run failure. "Shared AND outside the allocator that exists" is a far sharper signal
 * than "shared", and it is what the Irregular should look for.
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 */

const EMAIL = /\b[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Phone-shaped, and the leading constraint is doing real work.
 *
 * ⚠️ A bare run of 9-15 digits is hopelessly ambiguous, and on a mature suite that ambiguity is
 * ruinous. Measured on a 217-file production suite: the first version matched **Confluence page ids**
 * (a 10-digit id in a `/wiki/spaces/<space>/pages/<id>/` path) across nineteen files, an ADO plan-suite pair, and a
 * documentation filename — nine false positives out of twenty findings, around 12% precision. That
 * is well inside the range where a reader stops opening the report, which is worse than no report.
 *
 * A real phone literal starts with `+`, or `0`, or a country code — or carries separators. A page id
 * starts with whatever the database counter was on. So: require a leading `+`/`0`, or a separator.
 *
 * ⚠️ The cost, accepted knowingly: a bare international MSISDN with no `+` and no separators (e.g.
 * `642101824964`) is now invisible. One missed finding against nine removed false positives is the
 * right side of that trade, and a missed finding is the cheaper failure.
 */
const PHONE = /(?<![\w.])(?:\+\d[\d\s-]{7,15}\d|0\d[\d\s-]{7,14}\d|\d{2,4}[\s-]\d{2,4}[\s-]\d{2,6})(?![\w.])/g;

export default validateGate({
    id: 'shared-test-identity',
    kind: 'project',
    title: 'One identity hard-coded across several spec files — managed, or raw?',
    why: 'Two specs sharing an account cannot run in parallel safely and cannot be re-run cleanly: '
        + 'one logs the other out, mutates its data, consumes its one-time code, or trips a quota the '
        + 'other was about to assert on. The failure lands in whichever test arrived second, which is '
        + 'almost never the one at fault. ⚠️ BUT a shared identity is only a defect if nothing MANAGES '
        + 'it — a reserved pool with a per-worker allocator and a lock is the correct pattern, and this '
        + 'gate cannot see the difference. So treat each of these as a question: is this value handed '
        + 'out by an allocator, or does it sit outside one? Measured precision on a mature suite is '
        + 'about 25%, which is why this reports as a note rather than an error.',
    // ⚠️ DEMOTED from error to note on 2026-10-09, on evidence. See the measurement block below.
    severity: 'note',
    scope: 'test-code',

    appliesTo: (path) => /\.[cm]?[tj]sx?$/.test(path) || /\.feature$/.test(path),

    collect({ path, lines }, state) {
        state.seen ??= new Map(); // literal -> Map<file, firstLine>
        lines.forEach((rawLine, i) => {
            if (isNoise(rawLine)) return;
            const line = stripUrlsAndPaths(rawLine);
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
                message: `"${literal}" appears in ${files.size} spec files — also ${others}.`
                    + ' Is it handed out by an allocator, or sitting outside one?',
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
    // Boundary and format probes. A suite testing "too long" / "wrong country code" / "with spaces"
    // reuses the same malformed value across files ON PURPOSE — that is coverage, not collision.
    // Measured: four of twenty findings on a production suite were exactly this.
    if (/too[-_ ]?(?:long|short|many|few)|length|digits?\b|format|country[-_ ]?code|separator|whitespace|boundary/i.test(l)) return true;
    // "NON-NZ", "non-UK", "foreign" — a wrong-locale probe, reused across files by design.
    if (/\bnon[-_ ]?[A-Z]{2,3}\b|foreign|overseas|international(?:ly)?\b/i.test(l)) return true;
    // A named boundary value in a fixtures file: maxValid / minInvalid / tooLongNumber.
    if (/\b(?:max|min)[A-Za-z]*\s*:|\b(?:max|min)(?:Valid|Invalid|Length)\b/i.test(l)) return true;
    // ⚠️ A match inside LONG PROSE is a diagnostic message, not a value in use. Measured: a pooled
    // MSISDN quoted inside a multi-sentence error string was reported as a usage. The gate cannot
    // strip strings wholesale the way fixed-wait does, because an identity in use normally IS a
    // short string literal — so the discriminator is prose-ness, not quoting.
    if (/['"`][^'"`]{60,}['"`]/.test(l) && (l.match(/ /g)?.length ?? 0) > 8) return true;
    // Values composed at run time are unique per run, which is the correct pattern.
    if (/Date\.now\(|uuid|randomUUID|faker\.|\$\{|Math\.random/.test(l)) return true;
    return false;
}

/**
 * Blank out URLs and file paths before matching.
 *
 * Both are dense with long digit runs that are emphatically not identities: wiki page ids, ticket
 * numbers, plan/suite pairs, dated filenames. On a mature suite — where every scenario links its
 * requirement — this single step removed seven of nine false positives. A docs-heavy repo is the
 * NORMAL case for a well-traced suite, so this is not an edge case to tolerate; it is the main one.
 */
function stripUrlsAndPaths(line) {
    return line
        .replace(/\bhttps?:\/\/\S+/gi, ' ')                       // links, and their page ids
        .replace(/\b[\w./-]+\.(?:md|json|csv|ts|tsx|js|mjs|cjs|feature|ya?ml|html?)\b/gi, ' '); // paths
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
