# ADR-0001 — No client code, ever. Patterns only.

- **Status:** accepted
- **Date:** 2026-10-09

## Decision

Nothing in this repository is copied from any client codebase. Not a file, not a script, not a
reporter, not a config block, not a test. Where a pattern was learned on client work, it is
**re-expressed from scratch** here, with no client identifiers: no environment names, hostnames,
work-item ids, test-case ids, plan ids, persona names, phone numbers, inbox domains, webhook URLs or
API paths.

## Why — and note that the two reasons agree

**1. It is not ours to carry.** Work done under a contract belongs to the client. That is the whole
of the first reason and it is sufficient on its own.

**2. It would not work anyway.** This is the part worth writing down, because it is what makes the
rule cheap to follow rather than a sacrifice.

A mature client suite is welded to its context. Measured on the suite that prompted this project,
roughly **70% of the "reusable" machinery was unreusable**: the lint gates knew that company's tag
registry shape and work-item families; the reporters knew one Azure DevOps plan and one Slack card
layout; the helpers knew one identity provider's attribute migration, two temp-mail providers and a
particular SMS sink. Lifting any of it produces something that runs in exactly one place — the place
you are leaving.

What *does* travel is the shape of the problem and the discipline that solved it. "A detector must be
proven able to fire" is portable. "Check `getClientCapabilities()` for `userVerifyingPlatformAuthenticator`"
is not.

## Consequences

- Every pattern here must be re-derived and re-tested against a **public or synthetic** target. If it
  cannot be demonstrated without client data, it does not belong in this repo yet.
- Fixtures and examples use throwaway public sites, not client environments.
- Commit messages and docs may describe a *class* of incident ("a route matcher pinned to a stale
  path failed open on a security assertion") but never the client, the ticket, or the system.
- A reviewer should be able to read this entire repository and not learn who the client was.

## How to check

Before any commit, the repo must contain no client-identifying strings. This is enforceable and will
become a gate in Phase 1 rather than a habit — see [ADR-0002](0002-gates-not-prose.md).
