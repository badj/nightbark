# ADR-0008 — spec-kit requirements are context for the judge, not a gate

**Status:** accepted · 2026-10-21

## Context

[spec-kit](https://github.com/github/spec-kit) (v1.2.2 at the time of writing) has an AI agent write
numbered requirements before code: `FR-012` in `specs/<feature>/spec.md`, with Given/When/Then
acceptance scenarios. Tests cite them in comments. On paper that is the written contract nightbark's
traceability and vacuity checks have always lacked.

Four ways to use it were proposed, and measured in that order:

1. audit spec-kit projects as targets;
2. a `spec-coverage` **gate**: a requirement no test cites, a test citing one that does not exist;
3. show the judge the requirement a test cites;
4. ship nightbark as a spec-kit **extension**.

## What was measured, 2026-10-21

**Targets.** 23 public repos had `.specify/`, `specs/*/spec.md` and a Playwright config; the 13 with
at least 10 test files were audited. **1009 gate findings**: fixed-wait 932, serialised-suite 53,
shared-test-identity 24, traceability 0. Fixed-wait on a seeded random sample of 30, hand-checked:
**22 real, 8 not**. 7 of the 8 are one new class: deliberate pauses in **demo/recording specs**,
where pacing for a human viewer is the point. 87 of the 932 sit under a `demo/` directory, all in
one repo. Not yet fixed; see Consequences.

⚠️ **The first run of this measurement was wrong and was discarded.** The sparse clones checked out
`*.spec.ts`/`*.test.ts` only, so every `.tsx`, `.jsx`, `.cjs` and `.mts` test and every test helper
was missing. It reported 894 findings from a partial checkout. The re-run checked that every
test-named file git tracks was on disk before auditing. This is the same failure as the gate that
read none of cal.com's specs: a tool that cannot see a file finds nothing in it.

**The gate (#2) was prototyped and rejected: 0 of 4 hand-checked hits were correct.**

- spec-kit numbers requirements **per feature**. Every spec starts at FR-001: 45 of 45 specs in one
  repo, 187 of 187 in another. Of the 714 requirement ids cited by vacuity candidates, **663 are
  defined in more than one feature**.
- Tests name their feature in prose: `specs/045 row F10`, `Feature 234`, or not at all. The prototype
  attributed each file to the one feature directory it mentioned; in all four checked hits, the FR
  belonged to a different feature, cited another way.

Deciding which requirement a citation means is reading, not matching. Under
[ADR-0004](0004-where-the-smarts-live.md) that makes it judgement, so it moved into #3.

**The contract for the judge (#3): no verdict changed.** Same 12 seeded candidates, judged twice by
the vacuity judge, with and without the contract section:

| | without | with |
| --- | --- | --- |
| verdicts | 11 established, 1 uncertain | **identical** |
| evidence that engages the cited requirement | 0 | 5 of 12: 2 "the cited FR does not match what this test checks", 2 confirmed matches, 1 "cannot tell which feature" |
| judge tokens | 26,016 | 36,449 (+40%) |

That is the design working as intended: the premise question is unchanged, and the requirement adds
a second, recorded observation. It is not evidence that the contract finds vacuous tests. It
surfaces **requirement drift**: a test citing an FR it does not check.

336 of the 1641 vacuity candidates across the 13 repos cite a requirement; the other 1305 see an
unchanged brief.

## Decision

**Requirements are context in the brief, never a gate.**

- `src/irregulars/contract.mjs` finds every definition of each cited `FR-`/`SC-` id and hands the
  judge **all** of them (up to 4), stating the ambiguity. It never picks one. Features the test file
  names itself are ranked first and marked "named in this file": a hint, not a resolution.
- One renderer feeds both the judge's brief and Moriarty's, so the adversary sees the same exhibits.
- A citation in the file header (before the first test) applies to every test in the file. The header
  ends at the first test; the first version used a fixed 30-line window and leaked one test's
  citations into the next. The fixture caught it before it ran on anything real.
- Definitions are read in the five shapes found in the field (template bold, titled bold, amended,
  plain, table row). Changelog and status-table mentions are rejected. The template shape alone found
  zero definitions in one real repo.

**The extension (#4) ships in the package** at `integrations/spec-kit/`: `speckit.nightbark.audit`
(the gates) and `speckit.nightbark.vacuity` (brief → judge → challenge → verdict). It hooks
`after_implement`, as an optional hook that asks first. spec-kit v1.2.2 has **no converge hook**, and
implement/converge alternate, so it runs on every implement pass.

Verified against a real install, not the docs: `specify extension add --dev` accepted it as 2
commands + 1 hook, registered under `hooks.after_implement`, and the generated
`/speckit-implement` skill reads exactly that key.

## Consequences

- **The extension's prose is executed in CI.** Its commands tell an agent which nightbark lines to
  run; `test/spec-kit-extension.test.mjs` runs every one of them against a fixture. On its first run
  it found that `nightbark verdict --fail-on` had **always been refused**: the code read the flag and
  the help advertised it, but the flag allow-list omitted it. `test/cli-flags.test.mjs` now checks
  every flag each command reads against the allow-list, from the source. That is the third
  "feature on one of two code paths" in this repository.
- The contract makes a judged brief about 40% more expensive where it applies. Worth it while the
  requirement observations are read; if they never are, make it opt-in.
- **Open:** fixed-wait's demo/recording false-positive class. An exemption needs a near-miss fixture
  first: a real test that happens to live in a `demo/` folder must still fire.
- **Open:** a vacuity shape for `if (await x.isVisible()) { … }`, which wraps assertions so they can
  be skipped entirely. Seen in a personal repo, not yet measured on the targets.
