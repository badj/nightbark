# nightbark

A read-only auditor for Playwright/E2E suites. Finds **tests that pass while proving nothing** —
assertions that cannot fail, fixtures that collide, detectors that were never able to fire.

Named from *Silver Blaze*: the dog that did not bark. **The absence of a signal was the evidence.**
Auditors are "the Irregulars"; the adversarial reviewer is "Moriarty".

**Audience: the author, on the next contract.** Not a product. Optimise for being re-read in six
months, not for feature count.

---

## ⚠️ Pushing needs a GitHub account switch

`badj` is authenticated in `gh` but is usually NOT the active account (that is
`JJ-Badenhorst-MWNZ`, used for client work). Sequence:

```bash
gh auth switch --user badj && git push && gh auth switch --user JJ-Badenhorst-MWNZ
```

**Switch back afterwards**, or client-repo operations start failing with confusing 404s.
Commits use `-c user.name="JJ (Jacob) Badenhorst" -c user.email=jjbadenhorst@gmail.com`.

⚠️ **There is a second checkout at `~/Documents/GitHub/badj/nightbark`.** It was the original working
copy and is now stale. Work here (`~/Documents/GitHub/nightbark`); delete the other one or treat it
as read-only, because two checkouts of one repo is how work gets silently overwritten.

---

## The rule that matters most

⛔ **Never write a number that was not measured.** Not a precision figure, not a file count, not
"about 90%". If it was not counted today, either count it or do not state it. Several times this
repo has caught a documentation claim that was a restatement of intent wearing a measurement's
clothes — the ADO sink's "live-verified", `fixtures.expect` on file gates, and the README's claim
that Moriarty could rewrite a headline when no such mechanism existed.

A measurement has **a date and a command behind it**. A restatement has neither.

Corollary: when a stated figure and a fresh run disagree, **re-measure before editing either.**

---

## The seven decisions (docs/adr/)

| | |
| --- | --- |
| [ADR-0001](docs/adr/0001-no-client-code.md) | No client code, ever. Patterns re-expressed from scratch, enforced by `selfcheck` |
| [ADR-0002](docs/adr/0002-gates-not-prose.md) | A discipline ships as a **gate or an auditor, never prose**. The single most important one |
| [ADR-0003](docs/adr/0003-targets-and-app-under-test.md) | What we audit — and why the targets were widened |
| [ADR-0004](docs/adr/0004-where-the-smarts-live.md) | **Gates first (deterministic); agents only for judgement** |
| [ADR-0005](docs/adr/0005-how-an-irregular-runs.md) | Irregulars **gather locally, judge elsewhere**. No API key, no vendor |
| [ADR-0006](docs/adr/0006-what-init-scaffolds.md) | `init` scaffolds only what is expensive to retrofit. **Three written refusals** |
| [ADR-0007](docs/adr/0007-triage-is-a-gate-with-a-brief.md) | Triage is a gate with a brief, not an agent with a prompt |

**Read ADR-0002 and ADR-0004 before adding anything.** Most "should this be an agent?" questions are
already answered there, with measurements.

---

## State

```bash
npm run selftest    # 4 gates / 8 proofs + ADR-0001 self-check + CI drift + ~160 tests
npm run audit       # audit this repo's own fixtures
```

**Commands:** `init` · `audit` · `selftest` · `selfcheck` · `brief vacuity` · `challenge` ·
`verdict` · `triage` · `sink:ado` (+ `--diagnose`) · `logo`

**Gates (4):** `fixed-wait`, `serialised-suite`, `traceability`, `shared-test-identity`
**Irregular (1):** vacuity, with Moriarty as the adversarial pass

### Measured, 2026-10-10

**1463 files · 8 targets · 250 findings.** ⚠️ The older *493-file / 95%* figure is **superseded, not
extended** — it was taken against earlier gate versions, and summing them would describe no version
that ever existed.

| Gate | Findings | Note |
| --- | --- | --- |
| `fixed-wait` | 144 | the workhorse; 4 FP classes corrected |
| `serialised-suite` | 87 | 5 suite-level warnings, rest block-level notes. Was **5% precision** before splitting those apart |
| `traceability` | 13 | all `note` |
| `shared-test-identity` | 6 | **0/3 on the new targets** — demoted, and the Irregular conversion is now the indicated next step |

Vacuity Irregular: **33% judge-alone → 100% with Moriarty.** That gap is the whole argument for the
adversarial pass.

---

## Conventions

**Every gate declares two fixtures and an exact count.** `fires` (must flag) and `silent` (a near
miss it must NOT flag), plus `fixtures.expect: n`. ⚠️ A `>0` assertion is too weak — a gate catching
one of three planted faults passed for weeks. Three gate bugs were caught by a `silent` fixture
before any real code was audited.

**Shapes and exemptions are separate functions.** In `fixed-wait`, `matchSleep()` says *what* a line
is and `exemptBecause()` says whether it is legitimate. This is structural: a guard was added to one
branch and not swept onto its siblings **three times** before the split made it impossible.

**One definition of "a test file"** lives in `src/testfiles.mjs` — a leaf module, imported by the
runner and every gate. Four private copies gave three different answers, and the narrowest read
**zero** of cal.com's 53 `*.e2e.ts` specs while reporting the repo clean.

**Commit messages are long and explain the WHY.** They are the design record; read `git log` before
changing a subsystem. State what was measured, what broke, and what the fix prevents.

**Before any commit:** `npm run selftest` (gates, ADR-0001, CI drift, unit tests) must be green.

---

## Targets

Not committed. Re-clone shallow+sparse into a scratch dir; see
[ADR-0003](docs/adr/0003-targets-and-app-under-test.md) for the list and the selection criterion
(**ordinary quality under delivery pressure**, not "large" — a tidy repo cannot disconfirm a gate).

Four shipped products were added on 2026-10-10 and found **six defects in nightbark in an
afternoon**, including a gate that read none of a repo's spec files and reported it clean.

---

## ⚠️ Recurring failure patterns, all observed here

| | |
| --- | --- |
| **A silent default** | `--fail-on=never` was ignored because the parser read only `--name value`. Unknown flags now exit 2 |
| **A feature on one of two code paths** | `fixtures.expect` worked for project gates and not file gates; per-finding severity the same. Twice in one day — the fix is one shared function, not a third copy |
| **A fix that creates a false negative** | Widening the poll guard hid a genuine sleep inside `for (const x of xs)`. **An iteration loop is not a poll loop**, and a false negative is the worse trade because nothing announces it |
| **An assertion whose premise expired** | "The art stays plain" stayed true-looking after the art gained a colour. Replace such tests, do not delete them |
| **A claim with no mechanism** | The README described a capability (`headline`) the code did not have |

**The thing that pays off is making failures informative**, not adding features. Near-miss fixtures
caught 3 bugs pre-code; parsing generated YAML caught broken CI; installing the tarball caught a
package that could not run its own selftest; the ADR-0001 self-check caught two real leaks.

---

## Open threads

1. **`shared-test-identity` → Irregular.** Strongest candidate. Scored 0/3; the discriminator is
   named: its false positives are **inline call arguments**, its one true positive was **bound to a
   named constant beside a pool it was not part of**.
2. **One armed ADO publish** against a disposable plan — the only genuinely unverified path
   (`docs/CONTRACTS.md` records what every layer is verified against).
3. **Publish decision** — the npm name `nightbark` is free; the package is publish-ready. The repo
   is private. ⛔ **Do not publish or make the repo public without asking.**

A fixture-collision auditor is an idea with a precedent and no measurement. Say so if it comes up.
