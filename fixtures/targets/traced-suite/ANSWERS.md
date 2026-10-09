# Answer key — synthetic traceability target

⚠️ **SYNTHETIC.** This directory is a purpose-built target with *known* planted faults, used because
no public Playwright repo carries requirement ids (measured: zero across all three real targets). Its
numbers appear in the README in **their own row, labelled synthetic**, and are never added to the
real-repo precision figures. A synthetic number measures the gate against my own expectations; only a
real repo measures it against the world.

## Planted faults — what the gate MUST find

| # | Where | Fault | Expected severity |
| --- | --- | --- | --- |
| 1 | `features/checkout.feature` + `features/cart.feature` | case id `@[700001]` on two different scenarios | **error** |
| 2 | `tests/refund.spec.ts` + `features/refund.feature` | case id `@[700002]` on a spec AND a scenario (cross-format) | **error** |
| 3 | `features/sweep.feature` | family id `@E2E-G99-001` on three scenarios | **note** |
| 4 | `features/retired.feature` | case id `@[700003]` on an `@archived` scenario | **note** |
| 5 | `tests/skipped.spec.ts` | case id `@[700004]` on a `test.skip` | **note** |

**Expected total: 5 findings — 2 error, 3 note.**

## Correct patterns — the gate must find NOTHING here

| Where | Why it is correct |
| --- | --- |
| `features/inherited.feature` | one requirement tag on the `Feature:` line, inherited by 3 scenarios. 1 tag, 3 occurrences — **normal** |
| `features/paired.feature` | three case ids on ONE scenario (a progression case paired onto existing coverage). Several ids per test is fine; one id per several tests is not |
| `features/parked.feature` | `@wip` with only a **defect** reference. Tagging the blocking defect on a parked test is the correct pattern |
| `features/deferred.feature` | `@outOfScope` + a case id. That tag is a *decision marker* and collection-neutral — the test still runs and still publishes |
| `tests/versions.spec.ts` | version numbers, ports and dates that look id-shaped and are not |
