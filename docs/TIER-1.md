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

## The quality bar that matters

Not "how many findings" — **how many findings a competent engineer agrees with.** A 60%-precision
auditor is worse than no auditor, because the next person stops reading the output and the one real
finding dies with the noise. Track precision from the first run and publish it in the README.
