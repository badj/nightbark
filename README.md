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
nightbark selfcheck                    # enforce ADR-0001 on this repo — no client content
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

The headline metric, per [TIER-1](docs/TIER-1.md) — not finding count. Every finding hand-triaged on
targets the gates were not written against.

| Target | Files read | Findings | True | Precision |
| --- | --- | --- | --- | --- |
| `testmart-parallel-demo` (Playwright) | 77 | 15 | 15 | 100% |
| `playwright-hybrid-integration-API-UI-A11y` (Playwright) | 29 | 0 | — | n/a |
| `cypress-realworld-app` (Cypress) | 170 | 2 | 2 | 100% |
| **a 217-file production suite** (Playwright + BDD) | 217 | 26 | 22 | **85%** |

### The production suite is where it earned its keep

The three public targets are unusually *good* code — a deliberate demo, a careful personal suite, and
a reference app. A mature suite under real delivery pressure found problems in the gates that none of
them could:

| Round | What the gate got wrong | Fix |
| --- | --- | --- |
| 7 | **Confluence page ids** read as phone numbers (`.../wiki/spaces/XX/pages/<10-digit id>/...`) across 19 files, plus an ADO plan pair and a doc filename — **9 false positives of 20** | strip URLs and paths before matching; require a phone literal to start `+`/`0` or carry separators |
| 8 | **Boundary and wrong-locale probes** (`maxValid`, "too long", "non-NZ") reported as shared accounts | 4 more noise rules |
| 9 | A pooled number quoted inside a **diagnostic message string** read as a usage | exclude matches inside long prose |
| 10 | ⚠️ `waitForTimeout` used as a **poll interval** inside a `while` loop — *the same bug already fixed on the `setTimeout` branch*, left unfixed on this one | apply the poll guard to both branches; both shapes now fixtures |

Round 10 is the instructive one: a defect fixed in one place and not swept for its siblings. That is a
recurring failure in its own right, and the only reason it surfaced is that a real suite polls in both
styles where the toy repos poll in neither.

### Gate verdicts after that pass

| Gate | Production precision | Status |
| --- | --- | --- |
| `fixed-wait` | **15/15** | solid |
| `serialised-suite` | **7/7** | solid — and four findings cite a reason the suite's own notes record as superseded, which is precisely the question the gate asks |
| `shared-test-identity` | ~1–2 of 4 | **demoted to `note`** and reframed as a question |

### ⚠️ `shared-test-identity` is demoted, on evidence

12% precision on first contact, ~25% after six rounds of noise rules. Below the bar this project set
itself, so it now reports as a `note` that asks a question rather than an `error` that declares a
defect. Three populations are indistinguishable on the line — a **managed** pool handed out per worker
behind a lock (correct), a **probe** value reused deliberately (coverage), and a **raw** hard-coded
account (the defect) — and only the surrounding mechanism separates them.

That is the second shape evidence has pushed from gate to agent, after vacuity. The one genuine
finding is the design brief for that Irregular: a spare value **defined as a constant beside a pool it
was not part of** — an allocator existed and this value sat outside it. *Shared **and** outside the
allocator that exists* is a far sharper signal than *shared*.
