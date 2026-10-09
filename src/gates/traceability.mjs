import { validateGate } from '../gate.mjs';
import { SPEC_FILENAME } from '../testfiles.mjs';

/**
 * A requirement link that is lying.
 *
 * A test-case id on a test is a PROMISE: "the result of this test is the status of that case". This
 * gate finds two ways that promise is broken, both mechanically decidable, both expensive precisely
 * because the output looks healthy either way.
 *
 * ── 1. DUPLICATE — one id, two tests ──────────────────────────────────────────────────────────
 * A case id must map to exactly ONE test. Two tests carrying it means two results published to one
 * test point, and the second silently overwrites the first. Whichever ran last becomes "the" status,
 * so a failing test can be papered over by a passing one with the same id — and nothing in any
 * report says so.
 *
 * ⚠️ COUNTED PER TEST, NOT PER OCCURRENCE, and that distinction is the whole gate. A tag on a
 * Gherkin `Feature:` line is INHERITED by every scenario in the file, so a well-traced suite
 * legitimately shows far more occurrences than distinct ids — measured on a real suite: 173 distinct
 * ids across 254 occurrences, all correct. Counting occurrences would fire on every properly-traced
 * repo in existence, which is the fastest imaginable way to be ignored.
 *
 * ── 2. AN ID ON A TEST THAT CANNOT RUN ────────────────────────────────────────────────────────
 * A case id on a permanently-excluded test (`@archived`, `test.skip`, `test.fixme`) is a worse lie
 * than no id at all, because it reads as coverage from the outside.
 *
 * The documented end of that road: a case whose test was retired but kept its id was set back to
 * Ready by someone who saw it "being run regularly and recently" — a fair reading of what the
 * tooling was telling them. Weeks of back-and-forth over a test that could not execute. To stop it,
 * the id has to GO when the test stops running; parking the test is not enough.
 */

/**
 * Id shapes, and — the part the first version got WRONG — whether each one must be UNIQUE.
 *
 * ⚠️ "TRACEABILITY ID" AND "TEST CASE ID" ARE NOT THE SAME THING, and conflating them made this gate
 * flag two perfectly correct patterns. Caught by its own near-miss fixture before it ever ran on real
 * code:
 *
 *   @[123…]             a TEST CASE. A result gets published against it, so two tests carrying it means
 *                    the second overwrites the first. Must be unique.  -> publishes: true
 *   @REQ01-AC01      a REQUIREMENT / acceptance criterion. MANY tests covering one AC is not a
 *                    defect, it is coverage. The fixture had one AC tag on a Feature line inherited
 *                    by three scenarios, and the gate called it a clash.  -> publishes: false
 *   @ado_123…      a DEFECT reference. Many tests may cite one defect, and tagging the blocking
 *                    defect ON A PARKED TEST is the CORRECT pattern — flagging it would be flagging
 *                    the remedy.  -> publishes: false
 *
 * Only a `publishes: true` shape carries the uniqueness rule and the "an id on an unrunnable test is
 * a lie" rule, because only those two things publish a result anywhere.
 *
 * `tracker-key` (@JIRA-123) is deliberately publishes:false. It is genuinely ambiguous — some teams
 * use it for cases, most for issues — and the safe direction on an ambiguous shape is to miss a
 * finding rather than invent one.
 */
const ID_SHAPES = [
    { re: /@\[(\d{3,})\]/g, kind: 'case-id', label: '@[id]', publishes: true },
    { re: /@((?:E2E|SMK)-[A-Z0-9]{1,4}-?\d{2,3})/g, kind: 'case-family', label: '@E2E-Gxx-nnn', publishes: true },
    { re: /@(?:ado|tfs|azdo)[_-](\d{3,})/gi, kind: 'work-item', label: '@ado_id', publishes: false },
    { re: /@([A-Z]{2,5}\d{2}-AC\d{2})/g, kind: 'requirement-ac', label: '@REQxx-ACyy', publishes: false },
    { re: /@([A-Z]{2,5}-\d{3,})/g, kind: 'tracker-key', label: '@JIRA-123', publishes: false },
];

/**
 * Tags that mean this test GENUINELY cannot run.
 *
 * ⚠️ NARROWED ON EVIDENCE, twice over, after a field run produced 22 findings of which most were
 * wrong — and wrong in a way that would have taught the reader something false about their own repo.
 *
 * REMOVED `@wip`: profile-dependent, not an exclusion. Suites routinely have a run that deliberately
 * LIFTS it — a traceability pass that sets RUN_WIP=1 precisely so a parked guard still publishes a
 * result. "A parked test never publishes" is simply false there, and this gate cannot know which
 * profiles a project runs.
 *
 * REMOVED `@outOfScope`: a DECISION marker, not a run fence. In the suite measured it is documented
 * as "collection-neutral" and explicitly does NOT stop results reaching the plan. Those scenarios
 * were in fact excluded — by `@archived`, which sat on the same line — so the gate reported a real
 * problem while NAMING THE WRONG CAUSE. That is its own kind of defect: a finding whose explanation
 * is false is worse than no finding, because it gets believed.
 *
 * What is left is framework-level and unambiguous: `test.skip`, `test.fixme`, `@archived`, `@skip`.
 * Anything softer is a project convention this gate has no way to interpret.
 */
const EXCLUDING = /@(?:archived|skip|fixme|disabled|ignore)\b/i;
const NATIVE_SKIP = /\b(?:test|it|describe)\.(?:skip|fixme)\s*\(/;

const FEATURE_LINE = /^\s*Feature\s*:/;
const SCENARIO_LINE = /^\s*Scenario(?:\s+Outline)?\s*:\s*(.+)$/;
const TEST_LINE = /^\s*(?:await\s+)?(?:test|it)(?:\.\w+)*\s*\(\s*[`'"]([^`'"]*)[`'"]/;

export default validateGate({
    id: 'traceability',
    kind: 'project',
    title: 'A requirement link that is lying — duplicated, or on a test that cannot run',
    why: 'A case id is a promise that this test\'s result is that case\'s status. Two tests sharing an '
        + 'id means the second result silently overwrites the first, so a failing test can be papered '
        + 'over by a passing one and no report says so. An id on a permanently-excluded test is worse '
        + 'than no id: it reads as live coverage from outside, and somebody will reasonably reopen a '
        + 'case on the strength of it. Fix by making the id unique, or by REMOVING it when the test '
        + 'stops running — parking the test is not enough.',
    severity: 'error',
    scope: 'test-code',

    // ⚠️ SPEC_FILENAME, not a local regex. A local one here read 0 of cal.com's 53 `*.e2e.ts`
    // specs and called the repo clean. See the note on SPEC_FILENAME in runner.mjs.
    appliesTo: (path) => /\.feature$/.test(path) || SPEC_FILENAME.test(path),

    collect({ path, lines }, state) {
        state.byId ??= new Map();     // id -> Map<testKey, {file, line, name}>
        state.excluded ??= [];        // ids carried by tests that cannot run
        const isFeature = path.endsWith('.feature');

        // Tags above a Feature line are inherited by every scenario in the file; tags above a
        // Scenario belong to it alone. Both are tracked so inheritance is not mistaken for a clash.
        let fileTags = '';
        let pending = '';
        let current = null;

        lines.forEach((line, i) => {
            const tagLine = /^\s*@/.test(line);

            if (isFeature) {
                if (tagLine) { pending += ' ' + line; return; }
                if (FEATURE_LINE.test(line)) { fileTags = pending; pending = ''; return; }
                const sc = line.match(SCENARIO_LINE);
                if (sc) {
                    current = { key: `${path}:${i + 1}`, file: path, line: i + 1, name: sc[1].trim(), tags: `${fileTags} ${pending}` };
                    record(state, current);
                    pending = '';
                }
                return;
            }

            // Playwright: tags live in the test's own options object or its title.
            const t = line.match(TEST_LINE);
            if (t) {
                const window = lines.slice(i, i + 4).join(' ');
                current = { key: `${path}:${i + 1}`, file: path, line: i + 1, name: t[1], tags: window };
                record(state, current);
            }
        });
    },

    report(state) {
        const findings = [];

        for (const [id, tests] of state.byId ?? []) {
            if (tests.size < 2) continue;
            const [[, first], ...rest] = [...tests];
            // ⚠️ A FAMILY tag spread across scenarios is a judgement call, not a defect. Measured in
            // the field: one "catalogue sweep" case legitimately covers five scenarios, each a
            // different row of the same catalogue. The mechanical fact is real — five tests, one
            // case point, last write wins — but whether that is wrong depends on intent, so it asks
            // rather than declares. A bare @[id] duplicate has no such reading.
            const isFamily = state.kindOf?.get(id) === 'case-family';
            findings.push({
                file: first.file,
                line: first.line,
                severity: isFamily ? 'note' : 'error',
                message: isFamily
                    ? `case-family id ${id} is on ${tests.size} tests — they all publish to one case point, `
                      + `so the last result wins. Deliberate for a "sweep" case covering several rows; a `
                      + `defect otherwise. Also at: ` + rest.map(([, t]) => `${t.file}:${t.line}`).join(', ')
                    : `case id ${id} is claimed by ${tests.size} different tests — the second result `
                      + `published will silently overwrite the first. Also at: `
                      + rest.map(([, t]) => `${t.file}:${t.line}`).join(', '),
            });
        }

        for (const e of state.excluded ?? []) {
            findings.push({
                file: e.file,
                line: e.line,
                // ⚠️ A NOTE, NOT AN ERROR, and that was a correction. The field run reported twelve of
                // these as errors on a suite whose own guidance says the acceptable fixes are "drop
                // the id, add @archived, OR BOTH". Since @archived alone does stop results reaching
                // the plan, there is no overwrite risk — the lingering id is a hygiene question, not
                // a defect. Calling it an error overclaims, and overclaiming on twelve findings is
                // how a reader decides the gate does not understand their repo.
                severity: 'note',
                message: `case id ${e.id} sits on a test that cannot run (${e.why}). It publishes nothing, so `
                    + `there is no overwrite risk — but the id still reads as coverage to anyone looking at the `
                    + `case rather than the code, which is how a retired test gets a closed case reopened. `
                    + `Dropping the id removes the ambiguity; keeping both is a defensible choice if the id is `
                    + `wanted as a record of why the coverage once existed.`,
            });
        }
        return findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    },

    // Three planted faults: one duplicated id across two feature files, one id on an @archived
    // scenario, one on a Playwright test.skip. Declared so the proof cannot pass while missing two
    // of them — which is exactly what happened on the first run.
    fixtures: { fires: 'traceability/fires', silent: 'traceability/silent', expect: 3 },
});

function record(state, test) {
    // Collect ALL the excluding markers, not just the first. Naming one when two are present is how
    // the previous version blamed a collection-neutral tag for an exclusion caused by another.
    const all = [...new Set([...test.tags.matchAll(new RegExp(EXCLUDING.source, 'gi'))].map((m) => m[0].trim()))];
    const native = test.tags.match(NATIVE_SKIP);
    if (native) all.push(native[0].trim().replace(/\s*\($/, '()'));   // `test.skip(` reads badly; `test.skip()` does not
    const excludedBy = all.length ? { 0: all.join(' + ') } : null;
    for (const { re, publishes, kind } of ID_SHAPES) {
        // Only a shape that PUBLISHES a result is governed here. A requirement tag shared across
        // scenarios is coverage, and a defect reference on a parked test is the right thing to do.
        if (!publishes) continue;
        re.lastIndex = 0;
        for (const m of test.tags.matchAll(re)) {
            const id = m[1];
            if (excludedBy) {
                state.excluded.push({ id, file: test.file, line: test.line, why: excludedBy[0], kind });
                continue;   // an unrunnable test cannot also be a duplicate worth reporting
            }
            const seen = state.byId.get(id) ?? new Map();
            seen.set(test.key, test);
            state.byId.set(id, seen);
            state.kindOf ??= new Map();
            state.kindOf.set(id, kind);
        }
    }
}
