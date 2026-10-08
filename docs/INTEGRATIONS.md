# Integrations — emit formats, don't build connectors

> The short version: **do not build N integrations.** Emit the three formats the ecosystem already
> reads, and almost every integration arrives for free. Build a bespoke adapter only where no format
> exists.

This is the KISS answer to "support GitHub and Azure DevOps and Jira and Confluence". A connector per
destination is how a tool like this accumulates six half-maintained adapters that nobody trusts. A
standard output file is read by all of them.

## Layer 1 — the three outputs that do most of the work

| Output | What it buys, with no destination-specific code |
| --- | --- |
| **SARIF** | GitHub **Code Scanning** — findings annotated **inline on the pull-request diff**, which is where a reviewer actually is. Also consumed by Azure DevOps, VS Code's problem matcher, and most analysis tooling. The single highest-leverage item on this page. |
| **JUnit XML** | Native test reporting in **both** GitHub Actions and Azure Pipelines. Trend graphs and failure history for free. |
| **Exit code** | The universal CI contract. Non-zero fails the job, everywhere, forever. |

A finding annotated on the diff line that caused it is worth more than the same finding in a
dashboard someone has to remember to open. SARIF is how that happens, and it is one serialiser.

## Layer 2 — one real adapter, where no format exists

**Azure DevOps Test Plans.** Publishing a *result against a known test case* has no interchange
format, so it needs real code: match a test to its case id, write the outcome, link the defect.

Built first because it is the one that can be **verified by someone who knows the system cold** —
an adapter nobody can check is a liability, not a feature. The interface it implements:

```
TestCaseSink
  resolve(caseId)      -> does this case exist, and where does it live?
  publish(result)      -> outcome against that case
  link(finding, defect)-> relate a finding to an existing work item
```

## Layer 3 — contract-tested, not stubbed

Behind the same `TestCaseSink` interface, each with a contract test proving it satisfies the
interface *before* anyone wires it to a live instance:

| Destination | Note |
| --- | --- |
| **Jira** (Xray / Zephyr) | Both model test cases as issues with their own REST shape; pick one, not both |
| **Confluence** | Publish the audit summary / coverage matrix as a page. ⚠️ Read-only credentials are often unavailable to contractors — do not assume API access exists |
| **Slack / Teams** | A findings card. The lesson worth carrying: name the failures and link each one. A count with no links is a dead end |

A stub that cannot be tested is worse than an honest "not supported yet", because it implies
coverage that is not there.

## Layer 4 — speculative, Phase 5+

- **MCP server** — expose findings so *any* agent can query them, not only this plugin. The most
  interesting of these, and the least urgent.
- Allure, TestRail, code-coverage correlation.

## The ordering rule

Ship Layer 1 before Layer 2, and Layer 2 before Layer 3. A tool that writes SARIF and nothing else is
already useful in any CI on earth. A tool with six half-built connectors and no SARIF is useful
nowhere.

## CI targets

Both GitHub Actions and Azure Pipelines are first-class, generated from **one** definition rather
than maintained as two files that drift. That generation is Phase 3 — and the thing to get right is
that it must not degrade to a lowest common denominator: each platform gets its own idioms
(`actions/*` and Checks on one side, task groups and variable groups on the other) from a shared
source of truth.
