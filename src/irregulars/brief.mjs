import { renderContract } from './contract.mjs';

/**
 * Turn candidates into a brief — a prompt pack any agent can execute.
 *
 * Per ADR-0005 this is a documented ARTEFACT, not an internal prompt string: readable, diffable,
 * reviewable, and runnable by a harness nobody here has heard of. If it only worked inside one
 * vendor's agent runner it would not be portable IP.
 *
 * Two things the brief must do, and they pull against each other:
 *
 *   1. Ask ONE question. "Review this test" produces an essay and a shrug. "Is this premise
 *      established anywhere in what you were shown?" produces an answer.
 *   2. Make `uncertain` respectable. A judge forced to pick yes or no will guess, and a guess is a
 *      false positive wearing a confident hat. Uncertain findings are reported as needing a human
 *      read — less satisfying, and honest.
 */

export function brief(candidates, { target = '(unknown)' } = {}) {
    const byKind = new Map();
    for (const c of candidates) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);

    return `# nightbark — vacuity brief

**Target:** \`${target}\`
**Candidates:** ${candidates.length}${candidates.length ? ` (${[...byKind].map(([k, n]) => `${k} ${n}`).join(', ')})` : ''}

## What you are being asked

Each candidate below is an assertion that **can pass when the thing under test is absent rather than
correct**. \`expect(x).not.toBeVisible()\` is true of an element that was renamed, never rendered, or
never existed — so the test goes green while proving nothing.

That shape is **not itself a defect.** A negative assertion is sound when something establishes the
premise: a positive assertion earlier that the element was there, or an action whose whole point was
to remove it. For example, this is correct and must NOT be reported:

\`\`\`ts
await cart.removeItem("Speaker");                                  // premise: the action
await expect(cart.getItem("Speaker")).not.toBeVisible();
\`\`\`

**For each candidate, answer exactly one question:** *is the premise established anywhere in the
material you were given?*

## How to answer

Return **only** this JSON — an array, one entry per candidate, using the \`id\` verbatim:

\`\`\`json
[
  {
    "id": "<candidate id, copied exactly>",
    "premise": "established" | "absent" | "uncertain",
    "evidence": "the line or step that establishes it, quoted — or why nothing does",
    "confidence": "high" | "medium" | "low"
  }
]
\`\`\`

- **\`established\`** — something shown to you makes the element/value/list definitely present
  beforehand. Quote it. This is the common case in decent code; say so freely.
- **\`absent\`** — nothing shown establishes it. The assertion would also pass against a blank page,
  a renamed selector, or a 404. **This is the finding.**
- **\`uncertain\`** — the premise may be established somewhere you were not shown (a page object, a
  fixture, a helper). Say what you would need to see. ⚠️ Prefer this over guessing; a confident wrong
  answer costs more than an honest shrug.

## Rules

1. Judge **only** what you were given. Do not assume a helper does something you cannot see — that
   is what \`uncertain\` is for.
   ⚠️ **But material shown under ANOTHER candidate counts as shown.** If candidate 7's test body
   proves a locator resolves, you may use that when judging candidate 3. An independent judge needed
   exactly this and had to guess whether it was permitted — it is.
2. Do not report style, naming, duplication or anything else. One question only.
3. ⚠️ If the test's **name** promises something its body never checks, note it in \`evidence\` — but
   it does not change the \`premise\` verdict.
4. Never invent an \`id\`. Only ids listed below exist.
5. Where a candidate shows **requirements this test cites**, that is the contract it claims to cover.
   If the assertion does not check what the requirement says, note it in \`evidence\` — like rule 3,
   it does not change the \`premise\` verdict. An id defined in several features is ambiguous by
   construction; name which one you think is meant, or say you cannot tell.

---

${candidates.map(renderCandidate).join('\n---\n\n')}
`;
}

function renderCandidate(c, i) {
    const setup = c.sharedSetup?.length
        ? `\n**Shared setup in the same file** (a premise is often established here):\n\n\`\`\`\n${clip(c.sharedSetup, 40)}\n\`\`\`\n`
        : '\n_No shared setup found in this file._\n';

    const locs = (c.locators ?? []).length ? renderLocators(c.locators) : '';
    const contract = renderContract(c.contract);
    return `## Candidate ${i + 1} — \`${c.id}\`

- **kind:** ${c.kind}
- **question:** ${c.question}
- **enclosing test:** ${c.testName}

**The assertion** (\`${c.file}:${c.line}\`) — as it appears in the file:

\`\`\`
${c.assertionVerbatim ?? c.assertion}
\`\`\`
${c.assertionVerbatim && c.assertion !== c.assertionVerbatim ? `\n_Joined across lines for reading:_ \`${c.assertion}\`\n` : ''}

**The whole enclosing test:**

\`\`\`
${clip(c.testBody, 80)}
\`\`\`
${setup}${locs}${contract}`;
}

/** Keep a block readable. A judge given an unbounded file drifts off the question it was asked. */
function clip(lines, max) {
    if (lines.length <= max) return lines.join('\n');
    const head = lines.slice(0, max - 10).join('\n');
    return `${head}\n… (${lines.length - max + 10} more lines omitted)`;
}

/**
 * Where each asserted locator is DEFINED, and everywhere else it is asserted on.
 *
 * ⚠️ This section exists because an adversarial reviewer named its absence as the biggest structural
 * push toward wrongly confirming a finding. Two of three claims in the first run were undecidable
 * purely because locators arrived as names.
 *
 * The `asserted elsewhere` list is the part that does the work: a POSITIVE assertion on the same
 * locator in a neighbouring test proves the selector resolves, which disposes of the stale-selector
 * risk that is usually such a finding's only real substance. And an `unresolved` entry is itself
 * information — it says the premise CANNOT be settled from code, which means `uncertain`, not a
 * confident verdict either way.
 */
function renderLocators(locators) {
    const body = locators.map((l) => {
        if (l.status !== 'resolved') {
            return `- \`${l.expr}\` — ⚠️ **could not be resolved**: ${l.reason}\n`
                 + `  _Treat a premise that rests on this as \`uncertain\`: it cannot be settled from the code._`;
        }
        const hops = l.hops?.length ? ` (via ${l.hops.map((h) => `${h.property} → ${h.to}`).join(', ')})` : '';
        const inh = l.inheritedFrom ? ` — inherited from \`${l.inheritedFrom}\`` : '';
        const root = l.dependsOn?.length
            ? l.dependsOn.map((d) => `\n    - rooted on \`${d.property}\`: \`${d.definition.join(' ').trim().replace(/^this\.\w+\s*=\s*/, '')}\``).join('')
            : '\n    - built directly off `page` (not scoped to any parent element)';
        const live = l.alsoAssertedAt?.length
            ? l.alsoAssertedAt.map((a) => `\n    - ${a}`).join('')
            : '\n    - ⚠️ **asserted nowhere else in the suite** — nothing independently proves this selector resolves';
        return `- \`${l.expr}\` → \`${l.className}\`${hops}${inh}, defined at \`${l.file}:${l.line}\`\n`
             + `\n    \`\`\`\n    ${l.definition.join('\n    ').trim()}\n    \`\`\`${root}\n  **Asserted elsewhere:**${live}`;
    }).join('\n\n');
    return `\n**Where the asserted locators are defined:**\n\n${body}\n`;
}
