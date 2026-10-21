---
description: "Judge whether negative assertions prove anything, with the cited spec requirements as context, then attack every finding before reporting it"
---

# nightbark vacuity

An assertion like `expect(x).not.toBeVisible()` passes when `x` is broken, renamed or never
rendered. nightbark finds every such assertion and gathers its context; **you judge each one, then
attack your own findings** before anything is reported. Both judgements are yours; the mechanics are
nightbark's.

When a test cites a spec-kit requirement (`FR-012`, `SC-003`), the brief shows that requirement's
definition from `specs/*/spec.md`. ⚠️ Requirement ids restart per feature, so an id is often defined
in several features. The brief lists them all. **Never pick one by guessing.**

## User Input

```text
$ARGUMENTS
```

`<path>` below is the path from the user input, or `.` when none was given.

## Steps

Work in `.specify/nightbark/`. Create it if needed.

1. **Gather.** Run:

   ```bash
   npx --no-install nightbark brief vacuity <path> --out .specify/nightbark/brief.md
   ```

   If nightbark is not installed, STOP and say so (see `speckit.nightbark.audit`). Do not continue
   as if there were no candidates.

2. **Judge.** Read `.specify/nightbark/brief.md` and answer it **exactly as it instructs**: one JSON
   entry per candidate, ids copied verbatim. Write the array to `.specify/nightbark/answers.json`.
   `uncertain` is a respectable answer. A confident wrong one is not.

3. **Challenge.** Run:

   ```bash
   npx --no-install nightbark challenge <path> .specify/nightbark/answers.json --out .specify/nightbark/challenge.md
   ```

   Read `challenge.md` and answer it as instructed. Write the result to
   `.specify/nightbark/verdicts.json`.

   ⚠️ **Independence matters.** The adversarial pass works because it does not share the judge's
   reasoning. Measured on this tool: judging alone was right on 1 of 3 claims, and right on 1 of 1
   after the adversarial pass. If your environment can run a separate agent with a fresh context
   (Claude Code: a subagent), give it ONLY `challenge.md` for this step. If it cannot, say in your
   report that the challenge was made by the same session that judged.

4. **Merge.** Run:

   ```bash
   npx --no-install nightbark verdict <path> --answers .specify/nightbark/answers.json --verdicts .specify/nightbark/verdicts.json --fail-on never
   ```

5. **Report** the merged findings as printed. For any finding whose test cites a requirement, add one
   line on whether the assertion checks what that requirement says. Do not fix anything in this
   command.
