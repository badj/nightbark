import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The written contract a test claims to cover — spec-kit's `specs/<feature>/spec.md`.
 *
 * A vacuity judge is asked whether an assertion's premise is established. It answers better when it
 * can also see what the test was SUPPOSED to prove, and a spec-kit repo writes that down: numbered
 * functional requirements (`FR-012`) and success criteria (`SC-003`), which tests cite in comments.
 *
 * ⚠️ WHY THIS IS CONTEXT FOR A JUDGE AND NOT A GATE — measured 2026-10-21 on 13 public spec-kit repos.
 * A `spec-coverage` gate ("this test cites an FR its feature's spec does not define") was prototyped
 * first, per ADR-0004. It scored **0 of 4** on hand-checked hits, and the reason is structural:
 *
 *   - spec-kit numbers requirements PER FEATURE. Every spec.md starts at FR-001 — 45 of 45 specs in
 *     one repo, 187 of 187 in another. A bare `FR-017` names nothing on its own.
 *   - tests name their feature in prose a regex cannot pin down: `specs/045 row F10`, `Feature 234`,
 *     or not at all. The prototype attributed each file to the one feature directory it mentioned,
 *     and in all four checked hits the FR belonged to a DIFFERENT feature, cited another way.
 *
 * Deciding which requirement a citation means is reading, not matching. So this module does the
 * mechanical half — find every definition of each cited id — and hands ALL of them to the judge,
 * stating the ambiguity instead of resolving it with a guess.
 */

const REQ_ID = /\b(?:FR|SC)-\d{3}[a-z]?\b/g;

/**
 * A DEFINITION, not a mention. The template writes `- **FR-001**: System MUST …`, and matching only
 * that found ZERO definitions in one real repo and 127 of 202 in another — authors drift from the
 * template within a few features. Shapes seen in the 13 repos measured, all accepted:
 *
 *     - **FR-001**: …                      the template
 *     - **FR-001 Initialization Gate**: …  a title inside the bold
 *     - **FR-001b** _(CR-001)_: …          a suffix and an amendment note
 *     - FR-001: …                          no bold at all
 *     | FR-002 | Camera capture … |        a requirements table, id alone in its cell
 *
 * ⚠️ And rejected, because they REFER to a requirement rather than define it — counting them would
 * show the judge a changelog line as if it were the contract:
 *
 *     6. FR-001 extended to name …         numbered changelog entry
 *     | FR-013 (Done button …) | Partial  a status table: the id cell carries prose
 */
const DEFINITION = /^\s*[-*]\s+(?:\*\*)?((?:FR|SC)-\d{3}[a-z]?)\b[^:\n]{0,100}:/;
const TABLE_DEFINITION = /^\s*\|\s*(?:\*\*)?((?:FR|SC)-\d{3}[a-z]?)(?:\*\*)?\s*\|/;
const MAX_DEFS = 4;          // per id; a judge shown 40 identical "FR-001" lines learns nothing more
const MAX_IDS = 6;           // per candidate; the requirement is context, not the question
const HEADER_LINES = 30;     // cap on a file-level "covers FR-010, FR-013" comment

/**
 * id -> [{ feature, line, text }], from `specs/*\/spec.md` at the repo root (where spec-kit puts
 * them). Empty when there is no such directory — then nothing below changes the brief at all.
 */
export function buildSpecIndex(root) {
    const index = new Map();
    const dir = join(root, 'specs');
    if (!existsSync(dir)) return index;
    let features = [];
    try { features = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return index; }
    for (const feature of features) {
        const path = join(dir, feature, 'spec.md');
        if (!existsSync(path)) continue;
        let lines;
        try { lines = readFileSync(path, 'utf8').split('\n'); } catch { continue; }
        lines.forEach((text, i) => {
            const m = text.match(DEFINITION) ?? text.match(TABLE_DEFINITION);
            if (!m) return;
            const defs = index.get(m[1]) ?? [];
            defs.push({ feature, line: i + 1, text: text.trim() });
            index.set(m[1], defs);
        });
    }
    return index;
}

/**
 * Requirement ids cited by a test: in its own body, or in the file's HEADER.
 *
 * ⚠️ The header is everything BEFORE THE FIRST TEST, not "the first 30 lines". The first version used
 * a fixed window, and in any short file that window contains the first test's own body — so every
 * later test inherited the first one's citations and was shown a contract it never claimed. Caught
 * by the fixture, before it ran on anything real.
 */
export function citedIds(testBody, header) {
    const ids = new Set();
    for (const l of [...header.slice(0, HEADER_LINES), ...testBody]) for (const m of l.matchAll(REQ_ID)) ids.add(m[0]);
    return [...ids].slice(0, MAX_IDS);
}

/**
 * Feature numbers a test file names for itself: `specs/045`, `Feature 234`, `045-blog`.
 *
 * Used to RANK definitions, never to choose one. Measured on 13 repos: 663 of 714 cited ids were
 * defined in more than one feature — one id in 45 — so showing "the first four" alphabetically
 * usually showed four WRONG requirements, which is worse than none because it reads as evidence.
 * Every one of the four hand-checked prototype misses named its real feature in exactly these forms.
 */
export function namedFeatures(text) {
    const out = new Set();
    for (const m of text.matchAll(/specs\/(\d{3})|\bFeature\s+#?(\d{3})\b|\b(\d{3})-[a-z][a-z0-9]*(?:-[a-z0-9]+)*/gi)) out.add(m[1] ?? m[2] ?? m[3]);
    return out;
}

/**
 * The contract section for one candidate, or `null` when the test cites nothing — the common case,
 * which must leave the brief exactly as it was.
 */
export function contractFor(index, testBody, header, named = new Set()) {
    if (!index.size) return null;
    const ids = citedIds(testBody, header);
    if (!ids.length) return null;
    const rank = (d) => (named.has(d.feature.slice(0, 3)) ? 0 : 1);
    return ids.map((id) => {
        // Stable sort: features the file names come first, the rest keep their directory order.
        const defs = [...(index.get(id) ?? [])].sort((a, b) => rank(a) - rank(b));
        return {
            id,
            defs: defs.slice(0, MAX_DEFS).map((d) => ({ ...d, named: rank(d) === 0 })),
            more: Math.max(0, defs.length - MAX_DEFS),
            total: defs.length,
        };
    });
}

/**
 * Render the contract for a brief. ONE function, used by the judge's brief AND Moriarty's — the
 * adversary must see the same exhibits the judge saw, and a section added to one of two renderers
 * is the "feature on one of two code paths" failure this repo has already had twice.
 */
export function renderContract(contract) {
    if (!contract?.length) return '';
    const body = contract.map(({ id, defs, more, total }) => {
        if (!total) {
            return `- \`${id}\` — ⚠️ **defined in no \`specs/*/spec.md\`.** Renamed, removed, or cited from somewhere`
                 + ' else; either way this test claims coverage of a requirement nobody can read.';
        }
        const head = total > 1
            ? `- \`${id}\` — defined in **${total} features**. Ids restart per feature, so decide from the test`
              + ' which one it means — or say you cannot tell. Features this test file names itself are listed'
              + ' first and marked; that is a hint, not a resolution:'
            : `- \`${id}\`:`;
        const rows = defs.map((d) => `\n    - \`specs/${d.feature}/spec.md:${d.line}\`${total > 1 && d.named ? ' _(named in this file)_' : ''} — ${d.text.replace(/^[-*|]\s*/, '').slice(0, 220)}`).join('');
        return head + rows + (more ? `\n    - … and ${more} more feature(s) defining the same id` : '');
    }).join('\n');
    return `\n**Requirements this test cites** (spec-kit \`specs/\`) — what it was supposed to prove:\n\n${body}\n`;
}
