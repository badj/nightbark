# nightbark

> **Gregory:** "Is there any point to which you would wish to draw my attention?"
> **Holmes:** "To the curious incident of the dog in the night-time."
> **Gregory:** "The dog did nothing in the night-time."
> **Holmes:** "That was the curious incident."
>
> — *Silver Blaze*

The dog did not bark, so the intruder was known to it, so it was the trainer. **The absence of a
signal was the evidence.**

That is what this tool is for. A test that did not fail may be proving nothing — and a suite that is
suspiciously green is a dog that did not bark. `nightbark` goes looking for the ones that should have
barked and didn't.

---

## The problem it exists for

Most test tooling helps you write more tests. Almost none helps you find out whether the tests you
have are **capable of failing**. These all pass, and all of them are worthless:

| Shape | Why it passes | Why it proves nothing |
| --- | --- | --- |
| A locator that matches nothing | `expect(x).toBeHidden()` on a selector that was renamed | Hidden because absent, not because the app hid it |
| A guard whose premise is unasserted | "the 31st request is refused" | Nobody checked the first 30 were accepted |
| A route matcher pinned to a stale path | It waits, times out, reports "never arrived" | Or worse, fails *open* and reports success |
| A detector that cannot fire | A fingerprint for a change that shipped | Reports "not deployed" forever |
| An assertion written from observed behaviour | The app does X, so the test asserts X | Asserts the bug, not the contract |

Every one of those is a dog that did not bark.

## The three primitives

**The Irregulars** — read-only auditors, dispatched in parallel, each with a narrow brief. They
report findings with file and line; they never edit. Holmes's Baker Street Irregulars were exactly
this: cheap, bounded, sent out to gather evidence, and trusted only to report back.

**Gates** — a discipline that matters ships as an *executable check*, never as prose. See
[ADR-0002](docs/adr/0002-gates-not-prose.md); this is the single most important decision in the
project and it was arrived at by experiment, not taste.

**Moriarty** — the adversarial pass. Every finding an Irregular raises gets attacked before it is
reported, because a confident wrong finding costs more trust than a missed one.

## Usage

```bash
nightbark audit <path>                 # run the gates over a repo (read-only)
nightbark audit <path> --gate <id>     # one gate
nightbark audit <path> --sarif out.json  # SARIF 2.1.0 for CI annotation
nightbark audit <path> --fail-on warning # exit policy: error (default) | warning | note | never
nightbark selftest                     # prove every gate can fire, and is specific
npm run selftest                       # the above, plus the output-format tests
```

**SARIF is the integration strategy, not an afterthought.** One serialiser buys GitHub Code Scanning
annotations *on the pull-request diff*, Azure DevOps ingestion, and VS Code problem matchers — with
no destination-specific code. See [INTEGRATIONS](docs/INTEGRATIONS.md).

⚠️ `--fail-on` defaults to **`error`**, not `warning`. A tool whose first run reds somebody's
pipeline gets removed from the pipeline; tighten it once the output has earned trust.

## Decisions

The reasoning lives in [`docs/adr/`](docs/adr/) — read these before changing direction:

| | |
| --- | --- |
| [ADR-0001](docs/adr/0001-no-client-code.md) | No client code, ever. Patterns re-expressed from scratch |
| [ADR-0002](docs/adr/0002-gates-not-prose.md) | A discipline ships as a gate or an auditor, never as prose |
| [ADR-0003](docs/adr/0003-targets-and-app-under-test.md) | What we audit, and the app we scaffold against |
| [ADR-0004](docs/adr/0004-where-the-smarts-live.md) | Gates first; agents only where judgement is required |
| [INTEGRATIONS](docs/INTEGRATIONS.md) | Emit SARIF / JUnit / exit codes — don't build connectors |

## Status

Pre-alpha. Phase 0 (decisions) complete. See [docs/TIER-1.md](docs/TIER-1.md) for what "done" means
for the first shippable slice.

| Phase | Ships | State |
| --- | --- | --- |
| 0 | Repo, licence, ADRs, definition of done | ✅ done |
| 1 | `nightbark audit` — the Irregulars, read-only, against **any** Playwright repo | next |
| 2 | `nightbark init` — scaffold carrying the disciplines as gates | |
| 3 | One pipeline definition → GitHub Actions **and** Azure Pipelines | |
| 4 | `TestCaseSink` interface + ADO Test Plans adapter (Jira / Confluence contract-tested) | |
| 5 | Installable package | |

Phase 1 deliberately comes before the scaffold: it works against suites that **already exist**, so it
is useful on day one of a contract with no migration, and the judgement is the part worth carrying.

## Licence

MIT © JJ (Jacob) Badenhorst

## Precision

The headline metric, per [TIER-1](docs/TIER-1.md) — not finding count. Measured by hand-triaging
every finding on targets the gates were not written against.

| Target | Files read | Findings | True | Precision |
| --- | --- | --- | --- | --- |
| `testmart-parallel-demo` (Playwright) | 77 | 15 | 15 | 100% |
| `playwright-hybrid-integration-API-UI-A11y` (Playwright) | 29 | 0 | — | n/a |
| `cypress-realworld-app` (Cypress) | 170 | 2 | 2 | 100% |

### What it took — six rounds of red/green, all six failures mine

| | What was wrong | Caught by |
| --- | --- | --- |
| 1 | `waitForTimeout` matched inside a **string literal** | `silent` fixture, before any real code |
| 2 | A `setTimeout` **function definition** read as a call | `silent` fixture |
| 3 | A **React route component** whose sleep was deliberate app behaviour | first real audit |
| 4 | A textbook **bounded poll** — the pattern the gate's own advice recommends | first real audit |
| 5 | `nonexistent@example.com`, a **not-found probe**, read as a shared account | first real audit |
| 6 | `serialised-suite` only matched configs *named* after a tool, so `e2e.config.ts` was invisible | `fires` fixture |

Flagging the remedy as the defect (4) and flagging correct app behaviour (3) are the two fastest
ways to lose a reader permanently. Every shape above is now a permanent fixture, so none can return.

### ⚠️ Honest gap

`shared-test-identity` is **proven to fire and proven specific, but has caught nothing real yet.**
Its fixtures pass and two classes of false positive have been eliminated from it — but no target so
far actually shares an identity across specs. A gate with zero field findings is not yet validated
in the field, and saying otherwise would be the exact self-deception this tool exists to catch.

⛔ **A claim I made here was WRONG and is retracted.** I wrote that the RealWorld App's
`database-seed.json` was "mutated by the run it seeds". It is not: the seed is regenerated
deliberately by `scripts/generateSeedData.ts`, and `prestart` copies seed to live. What I had
actually seen was a `git status` showing the file modified after someone ran `yarn db:seed`. I
inferred a defect from a dirty working tree — the same shape of mistake this tool is built to find,
made while building it.

The real collision shape, verified, is better anyway and is the next gate: the RealWorld App's
`vite.config.ts` carries

```js
fileParallelism: false, // #1666: Run tests sequentially to avoid race conditions with shared database.json file.
```

**Parallelism surrendered repo-wide, with an upstream issue number attached.** That is the true cost
of shared mutable state — not a flaky test, but permanently giving up concurrency.
