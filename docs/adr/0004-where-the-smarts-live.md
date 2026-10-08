# ADR-0004 — Where the smarts live: gates first, agents only for judgement

- **Status:** accepted
- **Date:** 2026-10-09

## The question

This project is built with AI assistance and ships *as* AI tooling — agents, skills, a plugin. So:
how much of the intelligence is a model, and how much is ordinary deterministic code?

Getting this wrong in either direction ruins it. All-static and it is just another ESLint plugin
nobody installs. All-agent and it is slow, expensive, non-deterministic, unusable in CI, and it will
confidently invent findings.

## Decision

**Two layers, and the deterministic one comes first.**

### Layer 1 — Gates (no model)

Anything **mechanically decidable** is a gate: plain code, instant, free, deterministic, CI-safe.

| Mechanically decidable |
| --- |
| A locator string that appears nowhere else in the repo or app |
| `waitForTimeout` / `sleep` / a numeric literal timeout |
| A requirement or test-case id that is missing, or duplicated across two tests |
| An `expect` with no `await` where the matcher is async |
| A shared fixture written by more than one spec |
| A comment claiming a parking with no excluding tag behind it |

### Layer 2 — the Irregulars (agents, read-only, narrow brief)

Only what **genuinely needs judgement**:

| Needs judgement |
| --- |
| Is this assertion's premise established anywhere, or assumed? |
| Would this guard still pass if the application were broken? |
| Is this asserting an approved contract, or merely the behaviour someone observed? |
| Does this test's name match what it actually verifies? |
| Is this wait sized from a measured signal, or from a guess that happens to work? |

**The rule: if a gate can decide it, a gate decides it.** An agent is only reached for when the
answer requires reading intent. A tool that spends a model call on `grep waitForTimeout` is a toy.

## Why agents at all — and why NOT skills

There is a measurement in [ADR-0002](0002-gates-not-prose.md) that must not be misapplied here.
Writing generic disciplines as a **prose skill** changed nothing: six arms, six refusals, and two
closed-book agents produced ideas the document lacked. A capable model already holds the generic
rules, so *telling* it them is wasted tokens.

That finding is about **knowledge**. It says nothing against **capability**, and capability is what
an agent contributes:

- **Bounded scope** — a narrow brief and read-only tools, so it cannot wander or "helpfully" edit.
- **Fan-out** — several Irregulars in parallel, each with its own clean context, so one dimension's
  noise cannot drown another's signal.
- **An adversarial second pass** — Moriarty attacks each finding. A single agent reviewing its own
  output is not a second opinion, and confident wrong findings are what kill trust in a tool.
- **Repeatability** — the same brief every run, so findings are comparable over time rather than
  dependent on how the question was phrased today.

So: **agents yes, prose skills no.** Where a skill is shipped at all, it carries *project-specific,
non-obvious* facts — never a restatement of good practice.

## Shape: a Claude Code plugin

Agents + commands bundled as an installable plugin, because that is what makes it travel to the next
engagement rather than being copy-pasted. (Note: `skill-creator` and `plugin-dev` exist locally but
their marketplace is not enabled — enabling it is a prerequisite, not a given.)

## On third-party agent frameworks

Borrow the **methods**, refuse the **dependency**. Portable IP must not be coupled to someone else's
plugin release cycle. Two ideas worth taking outright:

- **The circuit-breaker** — after three failed fix attempts, stop and question the architecture
  rather than attempting a fourth from the same angle.
- **Red/green before implementation** — which is the same rule as *prove a detector can fire*,
  arrived at independently by someone else. Independent convergence is decent evidence a rule is
  load-bearing rather than taste.

## Consequences

- Every Irregular must justify why a gate could not do its job. If one cannot, it becomes a gate.
- Gates run in CI on every push. Irregulars run on demand and in a nightly or pre-merge job, because
  they cost money and wall-clock.
- `nightbark audit` must produce *something useful with no model access at all* — the gates alone.
  Agents enrich; they are not the floor.
- Findings are labelled by origin (`gate` or `irregular`) and, for agents, whether Moriarty confirmed
  them. A reader deserves to know which findings are deterministic.
