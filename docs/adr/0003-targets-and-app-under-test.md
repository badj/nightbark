# ADR-0003 — Audit targets, and the app under test

- **Status:** accepted
- **Date:** 2026-10-09

## Context

Two different questions were being conflated, and keeping them apart is what stops this project
sprawling:

1. **What does `nightbark audit` get pointed at?** It reads *test code*, so it needs repositories
   with real defect shapes in them. It does not need the application running.
2. **What does `nightbark init` scaffold tests *against*?** That needs a real application with a
   front end, a back end, an API, a database and an auth flow — something worth writing a suite for.

## Decision

### Phase 1 — audit targets (two, per TIER-1.md)

**Primary: `oguzc/testmart-parallel-demo`** — Playwright, 17 specs, ~7,900 LOC, 419 assertions.
Chosen because:

- It is **not ours**. Tier 1 requires the auditors to work on a repo they were not written against;
  validating only against our own code would tune the Irregulars toward findings we already know and
  make the precision figure meaningless.
- It carries a **shared mutable `database/shared-db.json` in a repo named `parallel-demo`** — a
  fixture collision in a box, and the exact class the fixture-collision Irregular exists for.
- Density for the others: **17** fixed sleeps, **19** hard-coded timeouts, and **zero** traceability
  links anywhere.

**Secondary: `bastheboss7/playwright-hybrid-integration-API-UI-A11y`** — Playwright, 4 specs.
Chosen because it is ours (so findings can be adjudicated immediately, which is how the precision
number gets measured), small enough to triage exhaustively, and because it carries **five governance
documents, 1,023 lines of prose rules**. Per [ADR-0002](0002-gates-not-prose.md), prose does not
enforce — so it is the natural first subject for *"is anything in your own `QUALITY_GATES.md`
actually checked?"*

### Phase 2 onward — the app under test

**`cypress-io/cypress-realworld-app`** (via the `badj` fork). It is the only candidate that supplies
every layer at once:

| Layer | What it provides |
| --- | --- |
| Front end | React + XState state machines |
| Back end | Express, 33 routes, session / JWT / validation |
| API | REST **and** a GraphQL schema |
| Database | `database-seed.json` (~11k lines), live `database.json`, `empty-seed.json` — seedable **and** resettable |
| Auth | local passport, plus Okta / Auth0 / Google / Cognito |
| Gap worth filling | **zero** accessibility coverage repo-wide |
| Known real defect | `fileParallelism: false` in `vite.config.ts` — **parallelism surrendered repo-wide** to avoid races on the shared `database.json`, upstream issue #1666 |

⛔ **Correction (2026-10-09).** An earlier version of this ADR and of the README claimed the seed file
was "mutated by the run it seeds". That was wrong — it is regenerated on purpose by
`scripts/generateSeedData.ts`. The claim came from reading a dirty `git status` as evidence of a
defect, which is precisely the inference this project exists to catch. Recorded rather than quietly
deleted, because a retraction with no trace is how the same wrong fact gets re-derived later.

Three things it gives us that a synthetic fixture app cannot:

1. A realistic, resettable data layer — the mature form of the shared-state problem (shared, but with
   a reset path), rather than a toy.
2. Its **21 existing Cypress specs are a ready-made coverage specification**, and a reference to check
   a Playwright port against. "Did the port lose coverage?" becomes measurable rather than asserted.
3. The a11y gap means the scaffold's accessibility layer has real work to do. A demonstration that
   produces a genuine finding is worth more than one that produces a green tick.

## Explicitly NOT decided here

- **Auditing Cypress suites is out of scope for now.** The Irregulars are Playwright-idiom; `cy.wait`,
  aliases and custom commands need their own parser and ruleset. It is a reasonable later feature, and
  the RealWorld App would be its obvious target — but not before the Playwright auditors are proven.

## Consequences

- No target repository's code is vendored into this one. They are pointed at, not absorbed — the same
  hygiene [ADR-0001](0001-no-client-code.md) applies to client code applies to third-party code.
- Red/green fixtures for each Irregular are **synthetic and written here**, so the self-tests do not
  depend on an external repo staying still.
- Precision is measured per target and published. A target where precision is poor is a finding about
  `nightbark`, not about the target.


## ⚠️ Widened 2026-10-10 — the original three were too clean

TIER-1 recorded the problem and the condition: the three targets are a deliberate demo, a careful
personal suite and a reference app, with **zero** traceability ids, floating assertions or swallowed
exceptions between them, and *"no further field-unvalidatable gate ships until the target set is
widened"*. This is that widening.

| Added | What it is | Why this one |
| --- | --- | --- |
| `element-hq/element-web` | Matrix client | 237 e2e specs; a crypto-heavy suite with genuine timing pressure |
| `TryGhost/Ghost` | publishing platform | a visual-regression suite — a different shape of flake entirely |
| `calcom/cal.com` | scheduling platform | heavy fixture-factory usage, and it names specs `*.e2e.ts` |
| `RocketChat/Rocket.Chat` | team chat | 178 e2e specs with a strong house style, which is what exposes a gate that assumes its own conventions |

**The selection criterion is "ordinary quality under delivery pressure", not "large".** A tidy repo
cannot disconfirm a gate. All four are shipped products with users, release pressure and accumulated
history — and between them they found six defects in nightbark in an afternoon, including a gate
reporting a repository clean without reading any of its spec files.

⚠️ **Read-only, and nothing is copied.** These are measurement targets, not sources: per
[ADR-0001](0001-no-client-code.md) no code or convention is lifted from any of them, and `audit`
cannot write. Each is cloned shallow and sparse into a scratch directory, never committed here.
