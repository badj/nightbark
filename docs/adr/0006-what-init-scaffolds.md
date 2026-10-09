# ADR-0006 — What `init` scaffolds, and the three things it refuses to do

- **Status:** accepted
- **Date:** 2026-10-09

## The problem with "scaffold a Playwright project"

It is unbounded. Every repo wants it slightly different, every request sounds reasonable, and the
end state is a generator with forty flags that produces something nobody likes. That failure is so
common it barely needs describing.

It is also **already solved**. `npm init playwright@latest` gives you a working project, maintained
by the people who write Playwright. Competing with that would be daft, and losing to it would be
embarrassing.

## What is actually missing

Not the project. The **structural decisions that are expensive to retrofit** — the ones a suite gets
wrong in week one and pays for in month six:

| Decision | Cost of getting it wrong later |
| --- | --- |
| Shared test identities | Retrofitting an allocator means touching every spec. Until then: no parallelism, or flakes that land in the wrong test |
| No teardown path | Orphaned records accumulate until a run fails on "already in use", months after the cause |
| Detectors nobody proved | A guard that cannot fail reports compliance it never verified, silently, forever |
| No audit in CI | Vacuous assertions accrete, and each one is cheap to add and expensive to find |

Those are the scaffold. A page-object example is not — anyone can write one, and ours would not be
better.

## Decision

`nightbark init` produces a **small, opinionated, immediately-runnable** Playwright + TypeScript
project in which **the disciplines are structural rather than documented**:

1. **A per-worker identity allocator with teardown** — the one thing that stops a suite sharing
   state before it has started. Not a helper you may call; the only way the example gets an identity.
2. **`playwright.config.ts` with the defaults argued for** — `fullyParallel: true`, workers capped
   to the pool size (exceeding it throws *up front* rather than mid-run), retries 0 by default so
   flakiness surfaces instead of being masked.
3. **CI for both platforms**, generated from one definition by the same generator this repo uses on
   itself, with `nightbark audit` wired in from commit one.
4. **One worked example** that uses the allocator properly, plus **one deliberately vacuous test**
   that the audit catches — because a scaffold which ships entirely green teaches nothing about what
   the tool is for.

## The three refusals

**1. No configuration surface.** One layout. No `--style`, no `--with-x`. A generator's flags are
where its complexity goes to hide, and a scaffold is a starting point: if the layout is wrong for
somebody, forking it is cheaper for everyone than a flag.

**2. No page objects, helpers, or utilities beyond what the example needs.** Everything generated
must be *load-bearing*. A scaffold that ships speculative furniture teaches people to delete
generated code without reading it, and the day they delete the allocator is the day the suite starts
sharing state.

**3. No attempt to be a Playwright tutorial.** It assumes Playwright is understood. The generated
README explains **why each structural decision was made and what it costs to reverse** — the part
that is genuinely ours — and links to Playwright's docs for everything else.

## Done means

- `nightbark init <dir>` then `npm install && npx playwright test` runs green **except** the one
  deliberately-vacuous test, which `nightbark audit` flags.
- `npm run selftest` in the generated project passes.
- The generated CI parses as valid YAML on both platforms (proven by a parser, not by eye — the
  first CI this repo generated for itself was invalid YAML because of an unquoted colon).
- The whole thing is small enough to read in one sitting. If it is not, the refusals above have been
  broken.
