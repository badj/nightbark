/**
 * The Irregulars registry — metadata so a finding from an agent can be described in SARIF exactly
 * like one from a gate.
 *
 * ⚠️ Kept deliberately parallel to the gate registry, because a consumer should not have to care
 * which half of the tool produced a finding. The ONE thing it must be able to see is the `origin`
 * property on each result (`gate` or `irregular`) — a reader deserves to know which findings are
 * deterministic and which came from judgement, since that changes how much benefit of the doubt a
 * surprising one earns.
 */

export const irregulars = [
    {
        id: 'vacuity',
        title: 'An assertion that passes without proving anything',
        why: 'The assertion is true of a page where the element never existed — renamed selector, '
            + 'blank render, 404 — so it goes green while proving nothing. Judged by an agent against '
            + 'the enclosing test and the resolved locator definitions, then attacked by an adversarial '
            + 'pass before being reported. Fix by establishing the premise: assert the thing is present '
            + 'first, or perform the action whose effect you are checking.',
        severity: 'warning',
    },
];

/**
 * Severity by Moriarty's verdict — NOT by the judge's confidence.
 *
 * `confirmed` is the only thing reported as a defect. `downgraded` is reported as a note that says
 * plainly it needs a human, because the alternative — quietly suppressing it — hides the fact that
 * something could not be decided, and "could not be decided" is useful information. `dropped` is
 * excluded entirely: Moriarty broke it, so nobody should spend a minute on it.
 */
export const VERDICT_SEVERITY = {
    confirmed: 'warning',
    downgraded: 'note',
    dropped: null,      // never reported
};
