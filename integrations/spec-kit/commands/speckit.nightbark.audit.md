---
description: "Run nightbark's deterministic gates over the project's tests and report what they found"
---

# nightbark audit

Run nightbark's gates over this project and report the result. The gates are deterministic: no
model, no network. **You run them and report them; you do not re-judge them.**

## User Input

```text
$ARGUMENTS
```

`<path>` below is the path from the user input, or `.` when none was given. The user may also
pass `--gate <id>` to run one gate; append it if so.

## Steps

1. Run, from the project root:

   ```bash
   npx --no-install nightbark audit <path> --fail-on never --sarif .specify/nightbark/audit.sarif
   ```

   ⚠️ If this fails because nightbark is **not installed**, STOP and say so plainly:
   *"nightbark is not installed — the audit did not run. Install it with
   `npm i -D @obvioapac/nightbark`."* Do **not** report the project as clean. An audit that did not
   run and an audit that found nothing look identical unless you say which one happened.

   `--no-install` is deliberate: without it `npx` may fetch an unrelated package named
   `nightbark` from the registry.

2. Report the findings **as nightbark printed them**, grouped by gate. For each finding keep the
   `file:line` and the one-line message. Quote the gate's `why` once per gate, not per finding.

3. Say how many files were read. **"0 findings from 0 files" is not a clean result** — it means the
   audit could not see the tests. If the files-read count looks too low for this project, say so.

4. Do not fix anything in this command. If the user wants fixes, they ask for them separately — an
   auditor that edits what it audits cannot be trusted to report on it.

## What the gates mean

| Gate | Finds |
| --- | --- |
| `fixed-wait` | a sleep sized by a guess (`waitForTimeout(500)`) instead of a wait on a signal |
| `serialised-suite` | `workers: 1` / `describe.serial` — a suite that cannot run in parallel |
| `shared-test-identity` | one hard-coded account or record used by several specs |
| `traceability` | a test-case id on two tests, or on a test that cannot run |

⚠️ Known false-positive class (measured 2026-10-21): deliberate pauses in **demo or recording**
specs, where pacing for a human viewer is the point. If a `fixed-wait` finding sits in such a file,
say so rather than presenting it as a defect.
