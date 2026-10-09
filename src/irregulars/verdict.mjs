import { VERDICT_SEVERITY } from './index.mjs';

/**
 * Merge a judge's answers and Moriarty's verdicts into reportable findings.
 *
 * This is the last step of the Irregular loop, and the whole point of it is that **Moriarty decides
 * what gets reported, not the judge.** Measured on the first run: the judge produced 3 findings of
 * which 1 was true (33%); after the adversarial pass, 1 of 1 (100%). Reporting the judge's output
 * directly would have sent an engineer to rewrite two correct tests.
 *
 * So the merge is deliberately lossy in one direction only:
 *
 *   confirmed   -> reported as a defect
 *   downgraded  -> reported as a NOTE that says it needs a human read
 *   dropped     -> not reported at all
 *   (no verdict) -> reported as a note, flagged as UNREVIEWED
 *
 * ⚠️ That last case matters more than it looks. A claim that reached the challenge stage but came
 * back without a verdict has NOT been cleared — it has been skipped. Dropping it silently would make
 * an incomplete adversarial pass indistinguishable from a clean one, which is the exact shape of
 * defect this tool is named after. It is surfaced as unreviewed instead.
 */
export function mergeVerdicts({ candidates, answers, verdicts }) {
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const verdictById = new Map((verdicts ?? []).map((v) => [v.id, v]));
    const findings = [];
    const stats = { established: 0, uncertain: 0, confirmed: 0, downgraded: 0, dropped: 0, unreviewed: 0 };

    for (const a of answers ?? []) {
        const c = byId.get(a.id);
        if (!c) continue;               // ghost ids are refused upstream, before this runs

        if (a.premise === 'established') { stats.established++; continue; }

        // An `uncertain` judge verdict never reaches Moriarty — there is no claim to attack — but it
        // is still worth surfacing, because "nobody could tell" is a real state of the world.
        if (a.premise === 'uncertain') {
            stats.uncertain++;
            findings.push(finding(c, 'note', `premise UNCERTAIN — needs a human read. ${a.evidence ?? ''}`.trim(), a, null));
            continue;
        }

        const v = verdictById.get(a.id);
        if (!v) {
            stats.unreviewed++;
            findings.push(finding(c, 'note',
                'claimed by the judge but NOT REVIEWED by the adversarial pass — treat as unverified, '
                + 'not as cleared. Re-run `nightbark challenge` and judge this claim.', a, null));
            continue;
        }

        const severity = VERDICT_SEVERITY[v.verdict];
        stats[v.verdict] = (stats[v.verdict] ?? 0) + 1;
        if (!severity) continue;        // dropped: Moriarty broke it, so nobody should read it

        // ⛔ MORIARTY MAY REPLACE THE HEADLINE, and this is not a nicety — the README claimed it
        // could for days before the code allowed it, which made the showcase example an unbacked
        // claim about the tool's own behaviour.
        //
        // It matters because the generic headline can be FACTUALLY WRONG about a finding Moriarty
        // confirmed. Measured on a real target: an XSS test guarded by `if (page.url() === "/")`,
        // which can never be true because page.url() is absolute. The defect is that the branch
        // never executes; the generic text says "would pass even if the element never existed",
        // which is not the problem — the element's existence is irrelevant. A reader handed that
        // headline goes looking for the wrong thing.
        //
        // Sharpening a confirmed finding's headline is exactly what an adversarial pass is for, so
        // the schema now offers the field and this uses it when supplied.
        const head = v.headline?.trim()
            || (v.verdict === 'confirmed'
                ? 'premise not established — this assertion would pass even if the element never existed'
                : 'premise could not be settled from the code — needs a human read');
        findings.push(finding(c, severity, head, a, v));
    }

    return { findings: findings.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line), stats };
}

function finding(c, severity, message, answer, verdict) {
    // Carry the adversarial reasoning into the finding itself. A reader who can see the strongest
    // argument AGAINST a finding, and why it failed, can judge it in seconds — and is far less
    // likely to "fix" it by deleting the assertion, which is the usual wrong response.
    const parts = [message];
    if (answer?.evidence) parts.push(`Judge: ${answer.evidence}`);
    if (verdict?.attack) parts.push(`Strongest argument against: ${verdict.attack}`);
    if (verdict?.why_it_survives_or_not) parts.push(`Why that did not hold: ${verdict.why_it_survives_or_not}`);

    return {
        origin: 'irregular',
        gateId: 'vacuity',              // the SARIF ruleId; `origin` is what distinguishes the half
        severity,
        file: c.file,
        line: c.line,
        message: parts.join(' — '),
        excerpt: c.assertionVerbatim ?? c.assertion,
        why: undefined,                 // the rule's `why` is supplied by the registry in SARIF
        verdict: verdict?.verdict ?? (answer?.premise === 'uncertain' ? 'uncertain' : 'unreviewed'),
    };
}
