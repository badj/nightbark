# nightbark

A read-only auditor for Playwright/E2E suites. Finds **tests that pass while proving nothing** —
assertions that cannot fail, fixtures that collide, detectors that were never able to fire.

Named from *Silver Blaze*: the dog that did not bark. **The absence of a signal was the evidence.**
Auditors are "the Irregulars"; the adversarial reviewer is "Moriarty".

**Audience: the author, on the next contract.** Not a product. Optimise for being re-read in six
months, not for feature count.

---

## Pushing: `badj` only

Since 2026-10-21, **`badj` is the active `gh` account and the only one used for pushes.** Do not
switch to `JJ-Badenhorst-MWNZ`, before or after. If `gh auth status` shows another account active,
switch to `badj` and leave it there:

```bash
gh auth switch --user badj   # only if it is not already active
git push
```

Commits use `-c user.name="JJ (Jacob) Badenhorst" -c user.email=jjbadenhorst@gmail.com`.

⚠️ **There is a second checkout at `~/Documents/GitHub/badj/nightbark`.** It was the original working
copy and is now stale. Work here (`~/Documents/GitHub/nightbark`); delete the other one or treat it
as read-only, because two checkouts of one repo is how work gets silently overwritten.

---

## Releasing to npm (`@obvioapac/nightbark`)

**npm only changes on `npm publish`.** Pushing to GitHub does not touch it — including the README,
which npm shows *as published*. Release when installers would get something: a fix, a gate, docs.

**Choosing the bump (0.x, so everything shifts down one place):**

| Change | Bump |
| --- | --- |
| Bug fix, a gate flagging **less** (FP removed), docs/README only | **patch** |
| New gate/command/flag, **or anything that can turn a user's CI red** | **minor** |
| Declared stable | **1.0.0**, then breaking = MAJOR |

⚠️ Users run this in CI with `--fail-on`, so **a gate that flags MORE is breaking** even when it is a
"fix": their pipeline goes red with no change on their side. A new gate, a widened gate, a severity
raised note→warning, a changed exit code, a renamed command/flag, or a SARIF shape change is
**minor**, never patch. When asked for a bump, read `git log v<last>..HEAD` and say so if the
changes imply a bigger one.

**Steps** — the agent does 1–4, the author does 5:

```bash
npm version patch --no-git-tag-version      # 1. or minor. Edits package.json only
npm run selftest                            # 2. must be green
git commit ...                              # 3. long WHY message: what changed since the last tag
git tag v0.1.1                              #    tag = the exact code that version shipped
git push --follow-tags                      #    as badj (see Pushing)
npm publish                                 # 5. AUTHOR'S terminal — browser 2FA needs a TTY
npm view @obvioapac/nightbark version       # 6. verify; can take ~3 min to appear
```

Not plain `npm version patch`: it makes its own one-line commit, and commits here are the design
record. ⛔ A published version can be unpublished only within 72h, and that number can **never** be
reused — so selftest before tagging, not after.

**Tags:** `v0.1.0` = `89d2d28`, tagged after the fact; `npm pack` of that commit reproduces the
registry shasum exactly (`d7c6448c…`, checked 2026-10-10).

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

## The eight decisions (docs/adr/)

| | |
| --- | --- |
| [ADR-0001](docs/adr/0001-no-client-code.md) | No client code, ever. Patterns re-expressed from scratch, enforced by `selfcheck` |
| [ADR-0002](docs/adr/0002-gates-not-prose.md) | A discipline ships as a **gate or an auditor, never prose**. The single most important one |
| [ADR-0003](docs/adr/0003-targets-and-app-under-test.md) | What we audit — and why the targets were widened |
| [ADR-0004](docs/adr/0004-where-the-smarts-live.md) | **Gates first (deterministic); agents only for judgement** |
| [ADR-0005](docs/adr/0005-how-an-irregular-runs.md) | Irregulars **gather locally, judge elsewhere**. No API key, no vendor |
| [ADR-0006](docs/adr/0006-what-init-scaffolds.md) | `init` scaffolds only what is expensive to retrofit. **Three written refusals** |
| [ADR-0007](docs/adr/0007-triage-is-a-gate-with-a-brief.md) | Triage is a gate with a brief, not an agent with a prompt |
| [ADR-0008](docs/adr/0008-spec-kit-is-context-not-a-gate.md) | spec-kit requirements are **context for the judge, not a gate** (the gate scored 0/4). Ships a spec-kit extension |

**Read ADR-0002 and ADR-0004 before adding anything.** Most "should this be an agent?" questions are
already answered there, with measurements.

---

## State

```bash
npm run selftest    # 4 gates / 8 proofs + ADR-0001 self-check + CI drift + 186 tests (2026-10-21)
npm run audit       # audit this repo's own fixtures
```

**Commands:** `init` · `audit` · `selftest` · `selfcheck` · `brief vacuity` · `challenge` ·
`verdict` · `triage` · `sink:ado` (+ `--diagnose`) · `logo`

**Gates (4):** `fixed-wait`, `serialised-suite`, `traceability`, `shared-test-identity`
**Irregular (1):** vacuity, with Moriarty as the adversarial pass. Shows cited spec-kit `FR-`/`SC-`
requirements as context ([ADR-0008](docs/adr/0008-spec-kit-is-context-not-a-gate.md))
**Integration:** a spec-kit extension at `integrations/spec-kit/`, hooked `after_implement`

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

### Measured, 2026-10-21: 13 public spec-kit repos ([ADR-0008](docs/adr/0008-spec-kit-is-context-not-a-gate.md))

**1009 findings**: fixed-wait 932, serialised-suite 53, shared-test-identity 24, traceability 0.
Fixed-wait on a seeded sample of 30, hand-checked: **22 real**. 7 of the 8 misses are one new class,
pauses in **demo/recording specs**. A separate population from the 2026-10-10 figures: do not sum them.

⚠️ The first run used sparse clones that checked out only `*.spec.ts`/`*.test.ts`, so `.tsx`/`.jsx`/
`.cjs` tests were missing. It reported 894. **Before auditing a clone, check that every test-named
file git tracks is on disk.**

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
3. **Published as `@obvioapac/nightbark`**, not `nightbark`. The unscoped name is unregistered but
   **unpublishable**: on 2026-10-10 npm's typosquat filter refused it as "too similar to existing
   package nightmare". Scoped names skip that check; the `bin` stays `nightbark`. 0.1.0 went live
   2026-10-10 (81 files; `npm i -D @obvioapac/nightbark && npx nightbark selftest` → 8 proofs, 0
   failing, from the registry). The repo was made public the same day. ⚠️ The npm page shows the
   README **as published** — README edits reach npm only with a new version. Publishing needs a TTY
   for npm's browser 2FA approval, so it is run from the author's terminal, not from an agent shell.

4. **fixed-wait: demo/recording pacing** is a false-positive class (7 of 30 sampled, ADR-0008).
   Needs a near-miss fixture first: a real test that lives in a `demo/` folder must still fire.
5. **Vacuity shape: `if (await x.isVisible()) { …assertions… }`**, which lets a test skip its own
   checks. Seen in a personal repo, not yet measured on the targets.

A fixture-collision auditor is an idea with a precedent and no measurement. Say so if it comes up.
