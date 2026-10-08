# ADR-0002 — A discipline ships as an executable gate or an auditor. Never as prose.

- **Status:** accepted
- **Date:** 2026-10-09

## Decision

If a rule matters, it ships as something that **runs**: a lint gate, an auditor, or a failing test.
Rules that exist only as documentation — a README section, a style guide, a comment block — are
treated as **not shipped**.

Corollary: every gate must be **proven able to fire** before it is trusted. A gate with no
red/green proof is assumed broken.

## Why — this was measured, not assumed

**Experiment 1 — the prose did nothing.** A set of generic testing disciplines was written up as a
skill document and tested properly: the same high-pressure scenario was given to several agents, some
with the document loaded and some without, and the outputs compared.

**Result: six arms, six refusals. The document changed nothing.** Every closed-book agent
independently reached the same conclusions the document asserted — refuse to write an assertion from
observed behaviour, do not consume a shared quota from a pooled account, assert the preconditions
before the limit, size a waiting window from measured latency rather than a guess. Two of them
produced ideas the document did not contain.

The conclusion is uncomfortable and worth keeping: **a capable reader already holds the generic
disciplines.** Writing them down costs tokens and buys nothing. What a reader cannot know is the
*specific, local, non-obvious* fact — and that belongs in a gate or a comment at the point of use,
not in a portable style guide.

**Experiment 2 — the prose was read and still broken.** In a separate codebase, an encoding rule was
documented in a shared file *and four more times inside the single file that violated it*. It was
violated anyway, across two commits, by someone who had demonstrably read it. Replacing those five
paragraphs with one check that exits non-zero ended the class of defect immediately.

Four readings did not hold. One gate did.

## Consequences

- The deliverable of a discipline is a check, not a chapter. If it cannot be checked, say so
  explicitly and keep it short.
- **Every gate carries a self-test** that proves it fires on a deliberately broken input *and* does
  not fire on a known-good one. A gate that cannot fail reports compliance it never verified. This
  has happened in practice: a check shipped with a pattern that could not match its target and
  reported a clean pass for weeks.
- Documentation's job becomes narrow and honest: explain *why* a gate exists and what it cost to
  learn. Not to carry the rule — the gate carries the rule.
- When a gate is wrong, fix the gate. A standing waiver is a rule nobody is following.

## Not a licence to under-document

This says prose cannot *enforce*. It does not say prose is worthless. The reason a gate exists, the
incident that produced it, and the measurement behind a threshold are all worth recording — because
the next person's instinct will be to delete the gate, and the only defence is knowing what it caught.
