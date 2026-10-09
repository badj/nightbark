/**
 * Moriarty — the adversarial pass.
 *
 * Every finding the judge returns gets attacked before anybody reads it. The question is not "is
 * this a good finding?" but the sharper, harder one: **what would have to be true for this to be
 * wrong?**
 *
 * Why it exists at all. A judge reviewing its own output is not a second opinion — it has already
 * committed to a reading and will defend it. And the failure that actually kills a tool is not a
 * missed defect; it is a CONFIDENT WRONG one. A reader forgives "I didn't spot it". They do not
 * forgive being sent to rewrite a correct test, and they stop opening the report.
 *
 * ⚠️ Moriarty only ever sees the claimed findings — the `absent` verdicts. The `established` ones
 * are not re-litigated, because the cost asymmetry runs one way: a wrongly-dismissed candidate costs
 * one missed finding, while a wrongly-confirmed one costs the reader's trust in all of them.
 *
 * ⚠️ It is given the SAME material the judge had, and no more. If Moriarty could go and read the
 * repository it would be a different analysis rather than a challenge, and the two would stop being
 * comparable.
 */

export function challenge(candidates, answers, { target = '(unknown)' } = {}) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const claimed = answers
        .filter((a) => a.premise === 'absent')
        .map((a) => ({ answer: a, candidate: byId.get(a.id) }))
        .filter((x) => x.candidate);

    const uncertain = answers.filter((a) => a.premise === 'uncertain').length;
    const established = answers.filter((a) => a.premise === 'established').length;

    if (!claimed.length) {
        return `# nightbark — Moriarty challenge\n\n**Target:** \`${target}\`\n\n`
            + `Nothing to challenge: ${established} candidate(s) judged \`established\`, `
            + `${uncertain} \`uncertain\`, 0 \`absent\`.\n\n`
            + `⚠️ That is not the same as "the suite is sound" — it means no candidate of these shapes `
            + `had an unestablished premise. The uncertain ones still want a human read.\n`;
    }

    return `# nightbark — Moriarty challenge

**Target:** \`${target}\`
**Claims to attack:** ${claimed.length}

⚠️ The judge's overall tally is deliberately NOT shown here. An earlier version advertised
"N established, 0 uncertain", which anchors you on the judge being reliable before you have read a
single claim. Judge each one cold.

## Your job

Another agent has judged these assertions as having **no established premise** — meaning each would
pass even if the element never existed, so the test proves nothing. Those are about to be reported
to an engineer as defects.

**Your job is to attack each claim.** Not to agree with it, and not to improve it. For each one, ask:

> What would have to be true for this finding to be WRONG?

Then say whether that thing is plausibly true given the material shown.

Common ways a finding like this is wrong — look for each:

| | |
| --- | --- |
| The premise is established by an **action** rather than an assertion | \`removeItem(x)\` then \`expect(x).not.toBeVisible()\` is sound: the action proves x existed |
| It is established in **shared setup** that was provided | a hook or Background earlier in the brief |
| The assertion is a **wait**, not a claim about absence | \`not.toHaveText("Loading…")\` waits for a transient state to clear; the element is present throughout |
| The premise is established by a **page object or helper** whose body was not shown | then the honest verdict is \`uncertain\`, not a confirmed finding |
| The negative IS the contract | a test whose entire point is "this must never appear for a guest user" needs no prior sighting |

## How to answer

Return **only** this JSON:

\`\`\`json
[
  {
    "id": "<candidate id, copied exactly>",
    "verdict": "confirmed" | "dropped" | "downgraded",
    "attack": "the strongest argument that the finding is wrong",
    "why_it_survives_or_not": "why that argument does or does not hold, given only what was shown",
    "headline": "OPTIONAL \u2014 a replacement one-line headline. Omit unless the default framing is wrong."
  }
]
\`\`\`

- **\`confirmed\`** — you tried to break it and could not. Safe to report.
- **\`dropped\`** — the attack holds. The finding is wrong and must not be reported.
- **\`downgraded\`** — the attack neither holds nor fails on the material shown. Report as *needs a
  human read*, not as a defect.
- **\`headline\`** \u2014 optional, and worth using when the default framing misdescribes what you
  actually established. The default reads *"this assertion would pass even if the element never
  existed"*; if what you confirmed is sharper \u2014 an unreachable branch, a swallowed error, a guard
  that cannot fail \u2014 say THAT instead. A reader handed the wrong headline investigates the wrong
  thing, and an independently verifiable headline beats a correct verdict with a vague one.

⚠️ **Dropping findings is a success, not a failure.** You are the last thing between a wrong finding
and an engineer's afternoon. If you confirm everything you have done nothing.

---

${claimed.map(renderClaim).join('\n---\n\n')}
`;
}

function renderClaim({ answer, candidate: c }, i) {
    return `## Claim ${i + 1} — \`${c.id}\`

**The judge said:** premise \`${answer.premise}\`, confidence \`${answer.confidence ?? 'unstated'}\`

<details>
<summary>The judge's stated evidence — read the code first, then this</summary>

${answer.evidence ?? '(none given)'}

</details>

⚠️ Form your own view from the code below BEFORE opening that. Moriarty's own feedback was that
restating the judge's reasoning as persuasive prose up front meant reading the closing argument
before seeing the exhibits.

**The assertion** (\`${c.file}:${c.line}\`):

\`\`\`
${c.assertion}
\`\`\`

**The whole enclosing test** — \`${c.testName}\`:

\`\`\`
${(c.testBody ?? []).slice(0, 80).join('\n')}
\`\`\`
${c.sharedSetup?.length
        ? `\n**Shared setup provided to the judge:**\n\n\`\`\`\n${c.sharedSetup.slice(0, 40).join('\n')}\n\`\`\`\n`
        // ⚠️ WORDED PRECISELY AFTER MORIARTY CALLED THE OLD PHRASING DANGEROUS. It read "No shared
        // setup was available", which is ambiguous in the worst possible direction: "there is none"
        // SUPPORTS the finding, while "we could not fetch it" UNDERMINES it. Repeated under every
        // claim it read as corroboration when it was actually a hole in the evidence.
        : '\n⚠️ **This file contains no `beforeEach`/`Background` block** — so there is no shared setup to'
          + ' show, as opposed to some existing that was withheld. A premise established in a page object'
          + ' or helper is still possible and still unverifiable here; that case is `downgraded`.\n'}`;
}
