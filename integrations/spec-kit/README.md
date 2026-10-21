# nightbark for spec-kit

A [spec-kit](https://github.com/github/spec-kit) extension. After `/speckit-implement`, it audits the
tests the implementation produced, before `/speckit-converge` calls the feature done.

```bash
npm i -D @obvioapac/nightbark
specify extension add --dev node_modules/@obvioapac/nightbark/integrations/spec-kit
```

| Command | What it does |
| --- | --- |
| `speckit.nightbark.audit` | runs the deterministic gates. Hooked to `after_implement` (optional; you are asked) |
| `speckit.nightbark.vacuity` | the judged check: brief → judge → adversarial challenge → verdict, with cited `FR-`/`SC-` requirements as context |

Outputs go to `.specify/nightbark/`. Neither command edits your code.

Why `after_implement` and not converge: spec-kit v1.2.2 has no converge hook. Implement and converge
alternate, so the audit runs on every implement pass.
