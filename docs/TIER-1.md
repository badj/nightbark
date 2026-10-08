# Tier 1 — definition of done

The first shippable slice. Scoped deliberately small: **`nightbark audit` finds dogs that did not
bark in a Playwright repository it has never seen before.**

No scaffolding, no CI generation, no integrations. Those are Phases 2–5 and they are worth nothing
until the judgement works.

## Done means all of these

1. **It runs against an unknown repo.** `npx nightbark audit` in any Playwright + TypeScript project
   produces findings with `file:line` and a one-line explanation. No config file required to get a
   first useful result.
2. **It is read-only.** The audit never writes to the target repo. Enforced, not promised.
3. **Four Irregulars, each with a narrow brief.** Starting set:
   - **vacuity** — assertions that cannot fail: locators that match nothing, `toBeHidden` on an
     absent selector, awaited promises with no expectation, premises asserted nowhere.
   - **fixture-collision** — shared state that breaks under parallelism or a second same-day run:
     pooled accounts, quota'd resources, fixed inboxes, hard-coded identifiers.
   - **traceability** — a test whose requirement link is missing, duplicated across two tests, or
     points at something that no longer exists.
   - **timing** — fixed sleeps, arbitrary timeouts, and waits sized by guess rather than by a
     measured signal.
4. **Every Irregular has a red/green proof.** A fixture it must flag, and a near-miss fixture it must
   *not* flag. `nightbark selftest` runs them and fails if any Irregular cannot fire or false-positives.
   Per [ADR-0002](adr/0002-gates-not-prose.md) this is non-negotiable.
5. **Moriarty attacks every finding** before it is reported. A finding that survives is marked
   `confirmed`; one that does not is dropped or downgraded. The report says which.
6. **Proven on at least two real public repositories** neither Irregular was written against, with the
   findings triaged by hand and the false-positive rate written down. A tool that cries wolf gets
   ignored — that number is the headline quality metric, not the finding count.
7. **No client-identifying content**, checked by a gate, per [ADR-0001](adr/0001-no-client-code.md).

## Explicitly out of scope for Tier 1

- Generating a project (`init`) — Phase 2
- CI pipeline emission — Phase 3
- Azure DevOps / Jira / Confluence integrations — Phase 4
- Publishing to npm — Phase 5
- Auto-fixing anything. The Irregulars report; a human decides. Fixing comes later, if ever.

## ⚠️ Measured 2026-10-09 — two plan changes, both forced by evidence

### 1. Vacuity cannot be a gate. ADR-0004 was right, and now it is proven rather than argued.

The cheap deterministic slice of vacuity looked attractive: flag a negative assertion
(`not.toBeVisible`, `toBeHidden`), since it passes when the element does not exist at all.
Measured across the three targets: **three such assertions exist, and all three are well-formed.**
Each is preceded by something that establishes the premise — a positive assertion that the page
rendered, or the very action whose effect is being checked:

```ts
await cartPage.removeItem("Bluetooth Speaker");
await expect(cartPage.getCartItem("Bluetooth Speaker")).not.toBeVisible();   // premise: the action
```

A gate on that shape would have scored **0 for 3**. The distinguishing question — *is this premise
established anywhere?* — requires reading intent across statements, which is precisely the boundary
[ADR-0004](adr/0004-where-the-smarts-live.md) draws. So vacuity stays an **Irregular**, and no
deterministic approximation of it will be shipped.

### 2. The targets are too clean for the subtle gates, and that is a target problem.

Counted across all three: **zero** traceability ids, **zero** floating assertions, **zero** swallowed
exceptions, **zero** `toHaveCount(0)`. These are a deliberate demo app, a carefully-written personal
suite, and the Cypress team's own reference app — unusually *good* code. Fixed sleeps show up anyway
(15 of them), because those appear even in careful work; the subtler defects do not.

Consequences, recorded so the gap is not mistaken for coverage:

- **`shared-test-identity` and any traceability gate are fixture-proven but field-unvalidated.** Two
  of four gates in that state would make the Tier-1 precision figure misleading, so no further
  field-unvalidatable gate ships until the target set is widened.
- **Widen the targets** before building gate 4: public Playwright suites of ordinary quality, and —
  for traceability specifically — one that actually carries requirement ids.
- Better use of the same hours: the outputs that need no target to validate (SARIF, JUnit, exit
  codes) and the ADR-0001 self-check, which audits this repo.

## The quality bar that matters

Not "how many findings" — **how many findings a competent engineer agrees with.** A 60%-precision
auditor is worse than no auditor, because the next person stops reading the output and the one real
finding dies with the noise. Track precision from the first run and publish it in the README.
