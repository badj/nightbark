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

## The loop

Gates are deterministic and need nothing. The Irregular adds judgement, and **Moriarty decides what
you actually read** — measured, that is the difference between 33% and 100% precision.

```
nightbark audit <repo> --sarif out.json          # gates only. No model, no key, no network.

nightbark brief vacuity <repo> --out brief.md    # candidates + context + resolved locators
  → any agent judges each: established | absent | uncertain          → answers.json
nightbark challenge <repo> answers.json --out challenge.md
  → Moriarty attacks each claim: confirmed | downgraded | dropped    → verdicts.json
nightbark verdict <repo> --answers answers.json --verdicts verdicts.json --sarif out.json
```

What reaches a reader:

| Verdict | Reported as |
| --- | --- |
| `confirmed` | **warning** — survived an attack |
| `downgraded` | **note** — says plainly it needs a human read |
| `dropped` | **nothing.** Moriarty broke it; nobody should spend a minute on it |
| no verdict | **note, flagged UNREVIEWED** — ⚠️ skipped is not the same as cleared |

That last row is deliberate. Silently dropping an unreviewed claim would make an *incomplete*
adversarial pass indistinguishable from a clean one, which is the exact defect shape this tool is
named after.

## Usage

```bash
nightbark init <dir>                   # scaffold a suite whose disciplines are structural
nightbark audit <path>                 # run the gates over a repo (read-only)
nightbark audit <path> --gate <id>     # one gate
nightbark audit <path> --sarif out.json  # SARIF 2.1.0 for CI annotation
nightbark audit <path> --fail-on warning # exit policy: error (default) | warning | note | never
nightbark selftest                     # prove every gate can fire, and is specific
nightbark selfcheck                    # enforce ADR-0001 on this repo — no client content
nightbark verdict <path> --answers a.json --verdicts v.json   # merge into findings + SARIF
npm run selftest                       # the above, plus the output-format tests
```

**SARIF is the integration strategy, not an afterthought.** One serialiser buys GitHub Code Scanning
annotations *on the pull-request diff*, Azure DevOps ingestion, and VS Code problem matchers — with
no destination-specific code. See [INTEGRATIONS](docs/INTEGRATIONS.md).

⚠️ `--fail-on` defaults to **`error`**, not `warning`. A tool whose first run reds somebody's
pipeline gets removed from the pipeline; tighten it once the output has earned trust.

## Publishing results — `TestCaseSink`

SARIF and JUnit cover reporting, because the ecosystem already reads them. *"Record this outcome
against case 865914 in plan 764570"* has no interchange format, so it needs real code — and this is
the **one** place a bespoke adapter is justified.

```bash
nightbark sink:ado --org <o> --project <p> --plan <id> --case <id> [--suites a,b]
```

**Read-only without `--arm`.** It resolves each case to its test point(s) and tells you whether the
scope matches anything at all.

⚠️ **That read-only mode is the point of the command.** The failure it exists for is a scope that has
gone *stale*: the plan gets reorganised, the scoped suite ids stop matching any test point, and the
publish reports every case as a tick **while writing nothing**. There is no way to see that in a
normal run's output, so *"it ran green"* is not evidence anything was recorded. Run the check first.

Five behaviours the interface mandates of any adapter, because each one has bitten somebody:

| | |
| --- | --- |
| **Dry run by default** | Test-management systems have no undo |
| ⛔ **Zero matches is a FAILURE** | Not a clean run. This is the stale-fence defect, and it is the reason the interface specifies behaviour rather than just method names |
| **Distinguish 401 / 403 / 404** | Expired token, missing permission, wrong plan — three different fixes. ADO also answers 404 for a plan you cannot *see*, so that message says it may be permissions wearing a 404 |
| **Paginate** | Page one always looks complete |
| **Never invent an id** | Publishing to a guessed point is worse than publishing nothing, because somebody will believe it |

### ⚠️ Contract-tested, NOT live-verified

17 tests run the adapter against a stub implementing the documented REST shapes. That proves URL
construction, the PAT encoding (Basic auth with an *empty* username — the colon is required), the
pagination loop, error discrimination, idempotent linking, and that a zero-match publish fails
loudly.

It has **not** been run against a live Azure DevOps instance. What a stub cannot prove: that a
particular plan has particular suites, that permissions are right, or your org's API quirks.

One command settles it, for whoever has access:

```bash
AZURE_TOKEN=<pat> nightbark sink:ado --org <o> --project <p> --plan <id> --case <id>
```

Read-only, so there is nothing to undo if it is wrong.

⚠️ One behaviour is worth knowing even before that: an **empty** token is refused up front rather
than sent. Azure answers an unauthenticated call with **203 and an HTML sign-in page**, not a 401 —
parsed naively that becomes an empty result set, and the caller reports a clean run against a plan it
never reached.

## Installing

```bash
npm i -D nightbark        # once published
npm i -D /path/to/clone   # or straight from a checkout
npx nightbark             # either way
```

Verified by **building a tarball and installing it into a clean directory**, not by reading
`package.json`: all five subcommands run from inside `node_modules`, including `selftest`.

⚠️ `fixtures/` ships deliberately. `nightbark selftest` reads them, so without them an installed
package cannot prove its own gates fire — and that proof is the central claim. The first draft
excluded them to save 20kB, which would have shipped a CLI whose most important subcommand crashed
on a missing path. A consumer being able to run `npx nightbark selftest` and watch each gate fire on
a known-broken fixture is worth far more than the bytes.

`prepublishOnly` runs the full selftest, so a broken build cannot be published.

## `init` — what it scaffolds, and what it refuses

`npm init playwright@latest` already gives you a project, maintained by the people who write
Playwright. Competing with that would be daft. What is missing is the **structural decisions that
are expensive to retrofit** — the ones a suite gets wrong in week one and pays for in month six.

So the scaffold is small and every file is load-bearing:

| | Why |
| --- | --- |
| `tests/fixtures/pool.ts` | Per-worker identities by `workerIndex` — deterministic, no locks, no waiting. Retrofitting an allocator means touching every spec that hard-codes an address |
| `release()` | A stub that **announces itself**. An allocator without teardown moves the problem to the second run of the day, where the failure looks like a product bug |
| `tests/fixtures/index.ts` | The **only** route to an identity. If a spec can write a literal, one eventually will |
| `workers: POOL.length` | A hard ceiling. The pool **throws** rather than modulo-wrapping, because wrapping hands two workers one identity and the run passes while proving nothing |
| `tests/vacuous.spec.ts` | **Deliberately broken.** It passes and proves nothing; the audit flags it. A scaffold that ships entirely green teaches nothing about what the tool is for |

Three refusals, per [ADR-0006](docs/adr/0006-what-init-scaffolds.md): **no configuration surface**
(flags are where a generator's complexity hides), **no speculative furniture** (it teaches people to
delete generated code unread, and one day that is the allocator), and **no Playwright tutorial**.

Verified on the output, not assumed: `tsc --noEmit` clean, 2 specs collect, both CI files parse,
and the audit flags **only** the vacuous spec.

## CI — one definition, two platforms

[`ci/pipeline.mjs`](ci/pipeline.mjs) is the single source; `npm run ci:gen` emits
`.github/workflows/nightbark.yml` and `azure-pipelines.yml`. **A generator, not a lowest common
denominator** — each platform gets its own idioms (SARIF upload to Code Scanning on one side, task
groups on the other) from shared *intent*.

⚠️ **`npm run ci:check` is the load-bearing half**, and it runs in the selftest. A generated file
that is committed will be hand-edited eventually, and from that moment the "single source of truth"
is a lie nobody can see. The check regenerates, diffs, and fails the build — proven both ways: a
planted hand edit exits 1, and a regeneration clears it.

nightbark's own CI runs its own rules, in this order:

1. `selftest` — **first, deliberately.** A gate that cannot fail reports compliance it never
   verified, so gates are proven before anything is audited with them.
2. `selfcheck` — ADR-0001, no client-identifying content
3. `ci:check` — the generated files still match their definition
4. the unit tests
5. an audit of `fixtures/` — which contain deliberate defects, so a run finding **nothing** there
   means the tool is broken rather than the repo being clean

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

**Tier 1 complete** — 3 gates, 1 Irregular with an adversarial pass, SARIF, exit policy, and
ADR-0001 enforced by a self-check. 95% precision across 493 files of four real repositories, every
finding hand-triaged. See [docs/TIER-1.md](docs/TIER-1.md).

⚠️ One Tier-1 criterion is deliberately NOT met: it asked for four Irregulars, and one is shipped.
Two of the four intended shapes were pushed from gate to agent by measurement, and a third
(traceability) has **no field data** in any public target — building it would mean a second
fixture-only component and would make the figure above misleading. One Irregular that is proven
beats four that are not, and saying so is cheaper than discovering it later.

| Phase | Ships | State |
| --- | --- | --- |
| 0 | Repo, licence, ADRs, definition of done | ✅ done |
| 1 | `audit` + the vacuity Irregular + Moriarty, read-only, against **any** Playwright repo | ✅ done |
| 2 | `nightbark init` — scaffold carrying the disciplines as structure | ✅ done |
| 3 | One pipeline definition → GitHub Actions **and** Azure Pipelines | ✅ done |
| 4 | `TestCaseSink` interface + ADO Test Plans adapter | ✅ done (contract-tested) |
| 5 | Installable package | ✅ done |

Phase 1 deliberately comes before the scaffold: it works against suites that **already exist**, so it
is useful on day one of a contract with no migration, and the judgement is the part worth carrying.

## Licence

MIT © JJ (Jacob) Badenhorst

## Precision

The headline metric, per [TIER-1](docs/TIER-1.md) — not finding count. **Every finding below was
hand-triaged**, on targets the gates were not written against.

| Target | Files read | Findings | True | Precision |
| --- | --- | --- | --- | --- |
| `testmart-parallel-demo` (Playwright) | 77 | 15 | 15 | 100% |
| `playwright-hybrid-integration-API-UI-A11y` (Playwright) | 29 | 0 | — | n/a |
| `cypress-realworld-app` (Cypress) | 170 | 2 | 2 | 100% |
| a 217-file production suite (Playwright + BDD) | 217 | 25 | 23 | 92% |
| **total** | **493** | **42** | **40** | **95%** |

Per gate:

| Gate | Findings | True | Precision | Note |
| --- | --- | --- | --- | --- |
| `fixed-wait` | 31 | 31 | **100%** | the workhorse — fixed sleeps appear even in careful code |
| `serialised-suite` | 8 | 8 | **100%** | ⚠️ 4 cite a reason the suite's own notes record as superseded |
| `shared-test-identity` | 3 | 1 | **33%** | reports as a `note` for exactly this reason |

### The Irregular, measured separately

| | Findings | True | Precision |
| --- | --- | --- | --- |
| Judge alone | 3 | 1 | **33%** |
| Judge + Moriarty | 1 | 1 | **100%** |

Moriarty **dropped one** claim and **downgraded another**. Without the adversarial pass this
Irregular would have shipped two wrong findings on its first run — and a reader sent to rewrite two
correct tests does not open the report a third time.

The one confirmed finding is a class **no gate could reach**:

```ts
if (page.url() === "/") {            // page.url() is ABSOLUTE — never "/"
  expect(hasScriptTag).toBeFalsy();  // unreachable
}
```

No `else` branch, so a test named *"should handle special characters in registration"* asserts
nothing on any path. Moriarty refuted its own best escape hatch from inside the same file — a sibling
test writes `new URL("/", page.url())`, which is only meaningful if the URL is absolute — then
**upgraded the headline** from "absent premise" to "unreachable guard, test asserts nothing", because
that is independently verifiable and the fix is one line.

Locator resolution closed the gap Moriarty named by name: **8/8** locators resolved on the demo
target, **8/9** on the production BDD suite (up from 0/9), tracing through nested components,
inheritance, interface aggregates, getters, locator-returning methods and one-hop locals.

### What it cost: thirteen rounds of red/green, every failure mine

| Found by | Count | Examples |
| --- | --- | --- |
| A `silent` fixture, before any real code | 3 | a matcher matched inside a **string literal**; a `setTimeout` **definition** read as a call; `appliesTo` rejecting its own fixture |
| First contact with a real repo | 6 | a **React component** whose sleep was deliberate; a textbook **bounded poll** — the pattern the gate's own advice recommends; a **not-found probe** read as a shared account |
| The production suite | 4 | **wiki page ids** read as phone numbers (9 false positives of 20); boundary and wrong-locale **probes**; a number inside a **diagnostic string**; `waitForTimeout` as a **poll interval** — *the same bug already fixed on the other branch and not swept for* |

⚠️ **And one leak of my own.** Documenting the page-id defect, I pasted a real client page id into
this README — and then into a gate comment. The `selfcheck` I wrote to enforce
[ADR-0001](docs/adr/0001-no-client-code.md) **missed it**, because it matched `@ado_123456` notation
and not a bare digit run in a URL path. Fixed the leak, added the shape rule, and the new rule
immediately found the second copy I had not noticed. Never committed.

### ⚠️ `shared-test-identity` is demoted, on evidence

12% precision on first contact; 33% after seven rounds of noise rules. Below the bar this project set
itself, so it reports as a `note` that asks a question rather than an `error` that declares a defect.
Three populations are indistinguishable on the line — a **managed** pool handed out per worker behind
a lock (correct), a **probe** value reused deliberately (coverage), and a **raw** hard-coded account
(the defect) — and only the surrounding mechanism separates them.

Its one genuine finding is the design brief for turning it into an Irregular: a spare value **defined
as a constant beside a pool it was not part of**. An allocator existed and this value sat outside it;
the suite's own notes record it causing a real concurrent-run failure. *Shared **and** outside the
allocator that exists* is a far sharper signal than *shared*.

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

### The Irregular, measured

| | Findings | True | Precision |
| --- | --- | --- | --- |
| Judge alone | 3 | 1 | **33%** |
| Judge + Moriarty | 1 | 1 | **100%** |

Moriarty **dropped one** claim and **downgraded another**. Without the adversarial pass this
Irregular would have shipped two wrong findings on its first run — and a reader sent to rewrite two
correct tests does not open the report a third time.

The one confirmed finding is a class **no gate could reach**:

```ts
if (page.url() === "/") {            // page.url() is ABSOLUTE — never "/"
  expect(hasScriptTag).toBeFalsy();  // unreachable
}
```

No `else` branch, so a test named *"should handle special characters in registration"* asserts
nothing on any path. Moriarty refuted its own best escape hatch from inside the same file — a sibling
test writes `new URL("/", page.url())`, which is only meaningful if the URL is absolute — and then
**upgraded the headline** from "absent premise" to "unreachable guard, test asserts nothing", because
that is independently verifiable and the fix is one line.

Locator resolution closed the gap Moriarty named: **8/8** locators resolved on the demo target and
**8/9** on a 217-file production BDD suite (up from 0/9), tracing through nested components,
inheritance, interface aggregates, getters, locator-returning methods and one-hop locals.

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
