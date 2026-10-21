# spec-kit-suite — what the contract section must show

A synthetic spec-kit layout. Not a real product.

| Candidate | Cites | Contract section must show |
| --- | --- | --- |
| `cart.spec.ts` `not.toBeVisible` | FR-002 (in the FILE header, not the test) | `specs/001-cart` only — the changelog line `6. FR-002 extended…` is a MENTION, not a definition |
| `guest.spec.ts` `toBeHidden` | FR-001, SC-001 | FR-001 is defined in **2 features** (ids restart per feature) — both shown, ambiguity stated, and `002-guest-access` listed FIRST and marked because the file names it (`specs/002-guest-access`). SC-001 from the table row |
| `guest.spec.ts` `toHaveCount(0)` | FR-099 | **defined in no spec** |
| `uncited.spec.ts` | nothing | no section at all — the brief must be unchanged |

⚠️ The cart test's header comment (`FR-002`) is inherited by every test in the file, by design: a
file-level "covers FR-xxx" comment is the commonest way real repos cite.
