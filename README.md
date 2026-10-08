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
