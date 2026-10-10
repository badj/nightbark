# ADR-0007 — Bug triage is a gate with a brief, not an agent with a prompt

**Status:** accepted · 2026-10-10

## Context

The `ai-bug-triage` discipline (from the author's own `badj/qa-skills` pack — no ADR-0001 concern,
it is the same person's IP) describes a seven-step pipeline: normalise a CI log, extract stable
anchors, hash a canonical form, cluster near-duplicates, classify, write a ticket, and get human
approval.

Its central claim is one this repository already made independently, in
[ADR-0004](0004-where-the-smarts-live.md): **deterministic first, model second.** Two disciplines
arriving at the same split from different directions is the strongest evidence either of them is
right, so the question was not *whether* to adopt it but *where the seam falls*.

## Decision

**Steps 1-4 are a gate. Steps 5-6 are a brief. Step 7 is a person.**

| Steps | What | Where it lives |
| --- | --- | --- |
| 1-4 normalise, anchor, hash, cluster | mechanically decidable | `src/triage/` — pure functions, no model, no network |
| 5-6 severity, category, root cause, ticket prose | genuine judgement | a markdown brief, answered by any agent ([ADR-0005](0005-how-an-irregular-runs.md)) |
| 7 create / merge / close | consequence | a human, always |

**Deduplication is never a model's job.** A model asked twice whether two errors match may answer
differently, and a dedup that is not reproducible merges distinct bugs at random — hiding a live bug
behind a ticket somebody already closed. A SHA-256 of a canonical form answers identically every
time, which is the only property that makes merging safe to suggest at all.

**Nothing is created, closed or merged.** `nightbark triage` prints groups and *links*, each carrying
its score and the dimensions that produced it. False deduplication costs more than manual triage, so
a suggestion a human cannot audit is worse than no suggestion.

## ⚠️ Why this had to become code: the spec contradicts itself

Writing it down exposed two defects that prose had held comfortably:

**1. Step 2b versus Test 5.** The rules say *"replace quoted strings with `<STR>`"*. Test 5 requires
`Cannot read property 'name'` and `...'email'` to produce **different** fingerprints. Both cannot
hold — those ARE quoted strings, so the literal rule collapses them and Test 5 fails, which it duly
did on the first run. Resolved by length: a short quoted token is part of the template and says
*which* property is missing; a long one is a specific and belongs behind `<STR>`. **Where a spec's
example disagrees with its rule, the example is what somebody actually wanted** — the rule is a
technique, the example is the intent.

**2. The reference extractor reads one level of Playwright suites.** Playwright nests them, so every
failure inside a `describe` block was silently skipped. A triage tool that sees a third of the
failures is worse than none, because the board looks short.

Neither is a criticism of the discipline — prose cannot execute, and this is precisely what
[ADR-0002](0002-gates-not-prose.md) means by *a discipline ships as a gate or an auditor, never as
prose*. The five fingerprint stability assertions are now tests, and the clustering weights are
asserted to sum to exactly 1.00, because the thresholds are calibrated against that total and a
later edit would silently change what `0.75` means.

## Consequences

- One more command, no new dependency, and nothing that needs an API key.
- The brief is a portable artefact: no vendor, reviewable before anyone acts on it.
- An unanchored failure gets **no** fingerprint rather than a shared one. Pooling them would create a
  single enormous false cluster whose dedup rate looks excellent and means nothing.
- A failure the reader cannot parse **throws**. "0 failures" and "I could not read your report" must
  never look the same.
