# What each layer is verified against

One page, because the question *"how do you know this works?"* has a different answer for every layer
of this tool, and a reader who does not know which answer applies cannot calibrate how much to trust
a result.

The failure this page exists to prevent is the one nightbark is named for: **a proof that cannot
fail.** A green suite is evidence only if you know what it was capable of catching.

---

## The short table

| Layer | Verified against | What that CANNOT tell you |
| --- | --- | --- |
| **Gates** (`fixed-wait`, `serialised-suite`, `shared-test-identity`) | a `fires` + a `silent` fixture each, **plus 493 files of four real repositories, every finding hand-triaged** | whether a *fifth* repo's conventions produce false positives. Three of these gates were corrected by exactly that |
| **`traceability` gate** | fixtures, a **synthetic target with an answer key**, and a field run on a production suite | ⚠️ **no public-repo field data exists** — zero requirement ids across all three public targets. Its precision figure comes from a target I built, so it is kept in its own labelled row and never added to the 95% |
| **The vacuity Irregular** | **two independent judging agents**, then an adversarial pass that dropped one claim and downgraded another | whether a third model agrees. Judge-alone precision was 33%; the adversarial pass is what makes it 100%, and that gap is the measurement |
| **SARIF output** | parsed back and validated against the 2.1.0 shape | whether GitHub's code-scanning UI renders it as intended |
| **Generated CI** | **both files parsed as YAML**, plus a drift check that fails if they no longer match their source | whether the pipelines actually run on either platform |
| **The package** | built as a tarball and **installed into a clean directory**, then made to run its own selftest from there | nothing much — this one is close to the real thing |
| **ADO sink — reads** | the documented REST shapes via stub, **and through the real `fetch` against a loopback server** | your organisation's quirks, and whether a particular plan is shaped as you believe |
| **⚠️ ADO sink — WRITES** | **nothing.** Contract only | **this is the one genuine gap.** See below |

---

## The one genuine gap, stated plainly

**The ADO write path has never run against a real test plan.** Creating a test run, patching results
onto points, and completing the run are exercised against a stub and nothing else.

That is not a limitation anyone should route around quietly, so:

- every write is behind `--arm`, which nothing defaults to;
- `publish` without it performs **all the reads** and stops — which is a real check, not a no-op,
  because the resolve step is where a stale scope reveals itself;
- a zero-match publish is treated as a **failure**, not a clean run.

What would close it: one armed publish against a disposable plan, by someone with Test Management
read & write. Until that happens this sentence stays here.

### Why the reads are in better shape than "contract-tested" suggests

A live read-only run would prove **one** path: the happy one, on one plan, with one person's
permissions. Every read-side failure that costs somebody an afternoon is on the other paths, and
those cannot be provoked on a live instance *even with full access*:

| Failure | Provoking it live would require | Verified? |
| --- | --- | --- |
| Code scope but no Test Management (403 at rung 4 only) | issuing a deliberately broken PAT | ✅ test |
| a plan that exists but is invisible (404) | borrowing someone else's permissions | ✅ test |
| ⛔ a suite fence left behind by a plan reorganisation | reorganising a real plan | ✅ test |
| an anonymous call answered **203 + HTML**, not 401 | revoking a token mid-request | ✅ test, **and** through real `fetch` |
| DNS / proxy / TLS interception | breaking your own network | ✅ test, against a closed port |
| a case sitting in several suites, so every point is written | a plan arranged that way | ✅ test |

So for the read path, the stub is not a weaker substitute for a live run — it is the **only** way to
reach these at all. `sink:ado --diagnose` is the command that walks them.

### ⚠️ And the stub has its own blind spot

Every stub resembles whatever I assumed `fetch` does. If the assumption were wrong — the Headers
object case-sensitive after all, `res.json()` behaving differently on a 203 — then all 24 stub tests
would pass against a fiction and the ladder would fail on first contact with a real server.

Five further tests therefore run the ladder through the **real global `fetch`** against a loopback
HTTP server, passing no stub at all. They confirmed the assumptions rather than merely restating
them. That pattern generalises: *a mock verifies your logic against your beliefs; something real
verifies your beliefs.*

---

## Why gate fixtures come in pairs

Every gate declares two, and `selftest` refuses to pass without both:

- **`fires`** — a file it MUST flag. Proves the gate can fail at all.
- **`silent`** — a NEAR MISS it must NOT flag. Proves it is not simply matching everything.

The second is the one people skip, and it is the one that earns its keep: **three gate bugs were
caught by a `silent` fixture before any real code was audited** — a matcher matching inside a string
literal, a `setTimeout` *definition* read as a call, and an `appliesTo` that rejected its own fixture.

⚠️ **And a `fires` fixture needs a COUNT, not a `> 0`.** A gate that plants three faults and finds one
passed the proof for months' worth of plausible-looking green. Gates now declare
`fixtures.expect: <n>` and the selftest enforces the exact number. That is how the bug below was
found at all — and it was a bug in the *runner*, affecting every gate, not in the gate under test:

> A `.feature` file was only treated as test code if it sat under `features/` or `tests/`. A
> `.feature` file **is** a test whatever directory it is in.

---

## The synthetic target, and why its number is quarantined

`fixtures/targets/traced-suite/` is a purpose-built repo with an explicit
[answer key](../fixtures/targets/traced-suite/ANSWERS.md): five planted faults (2 error, 3 note) and
five **correct** patterns the gate must stay silent on. It measures 5/5 exactly, 0 false positives.

It exists because no public Playwright repo carries requirement ids — measured as zero across all
three real targets — so `traceability` would otherwise have no field data at all.

⛔ **Its number is never added to the real-repo figures**, and that is the whole discipline here: a
synthetic result measures a gate against *my own expectations*, where only a real repo measures it
against the world. Both are worth having; averaging them produces a number that means neither.

What makes it worth more than its fault count is the five correct patterns — **three of which broke
earlier versions of the gate**: an inherited `Feature:`-line tag read as a clash, a defect reference
on a parked test read as a lying id, and a collection-neutral decision marker read as an exclusion.

---

## ⛔ The self-check is verified in both directions

[ADR-0001](adr/0001-no-client-code.md) says no client code or client-identifying content ever ships.
`nightbark selfcheck` enforces it, and it has caught **two of my own leaks** — a real page id pasted
into this repo's README *and* a gate comment, and 23 real case ids copied into fixtures.

The second catch forced a design decision worth recording: a *synthetic* case id is indistinguishable
**by shape** from a real one, so the shape rules flagged every legitimate fixture. Resolved by
suspending the **shape** rules under `fixtures/` while keeping the **denylist** fully active there — a
shape rule guesses, a named term is certain.

⚠️ An exemption is only safe if the part you kept is proven to still work, so the selftest plants a
leak *inside* `fixtures/` and requires it to be caught. It is reported as `(redacted)`, never echoed.
Both directions are checked on every run: the exemption applies, and the denylist still bites.
