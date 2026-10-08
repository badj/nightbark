# ADR-0005 — How an Irregular actually runs: shortlist locally, judge elsewhere

- **Status:** accepted
- **Date:** 2026-10-09

## The problem

[ADR-0004](0004-where-the-smarts-live.md) says judgement belongs to an agent. It does not say how an
agent gets invoked from a zero-dependency CLI, and the obvious answers are all bad:

- **Call a model API from the CLI.** Needs a key, a budget and a vendor choice baked into a tool
  whose whole pitch is portability. It also makes `audit` unrunnable in CI without secrets.
- **Send the repository to a model.** Expensive, slow, and it buries the signal — the question
  "is this premise established?" does not need 217 files of context, it needs one test body.
- **Ship the disciplines as a prose skill.** Already measured and already rejected: six arms, six
  refusals, no behavioural change ([ADR-0002](0002-gates-not-prose.md)).

## Decision

**Split it in two, at the point where cost appears.**

```
  nightbark brief vacuity <repo>     →  a prompt pack: candidates + the context each one needs
  (any agent, any harness)           →  judges each candidate, one question at a time
  nightbark verdict <answers.json>   →  Moriarty attacks, then merges into the findings
```

The CLI does the **gathering** — deterministic, free, offline, no key. The agent does the
**judging**. Nothing in this repo needs a model to be useful, and nothing about the judging is tied
to one vendor's harness.

## The insight that makes it cheap: recall and precision swap places

A **gate** must be precise. A false positive there costs a reader's trust directly.

A **candidate finder** must have high **recall**, and low precision is acceptable — because a judge
filters it. Those are opposite targets, and conflating them is what made the earlier attempt fail.

This is not theoretical. The negative-assertion check (`not.toBeVisible`, `toBeHidden`) was measured
at **0 of 3** as a gate and rejected outright. As a candidate finder it is *exactly right*: it finds
every assertion of the shape that can fail vacuously, and hands all three to a judge that asks
whether the premise is established. The rejected gate becomes the Irregular's input unchanged.

So: **a shape too ambiguous to be a gate is a good candidate finder.** That is where the ambiguous
shapes go, rather than being thrown away or shipped as noise.

## What a brief must contain

A candidate with no context is unjudgeable, and a judge given too much drifts. Each candidate carries:

| | |
| --- | --- |
| The assertion | the exact line, with its file and line number |
| The enclosing test | its **name** (a name promising more than the body checks is itself a finding) and its **whole body** — the premise usually sits several statements earlier |
| Shared setup | `beforeEach` / `Background` from the same file, since a premise is often established there |
| **One question** | not "review this test". One question, answerable yes/no/uncertain, with reasons |

⚠️ **`uncertain` must be a first-class answer.** A judge forced to choose yes or no will guess, and a
guess is a false positive wearing a confident hat. Uncertain candidates are reported as *needing a
human read*, which is honest and still useful.

## Moriarty

Every finding the judge returns is attacked before it is reported: *what would have to be true for
this to be wrong?* A finding that survives is `confirmed`; one that does not is dropped or
downgraded. Confident wrong findings are what kill trust in a tool, and a judge reviewing its own
output is not a second opinion.

## Consequences

- `nightbark audit` keeps working with no model access at all. The gates are the floor; Irregulars
  enrich.
- The brief is a **documented artefact**, not an internal prompt string. It can be read, diffed,
  reviewed, and executed by a harness nobody here has heard of.
- Answers come back as structured JSON against candidate ids, so a judge cannot invent findings for
  code it was never shown.
- Fan-out and parallelism are the harness's problem, not ours — which is the correct place for them.
