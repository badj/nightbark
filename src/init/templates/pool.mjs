/** The identity allocator — the one piece that makes this scaffold worth having. */
export const poolTs = () => `/**
 * Per-worker test identities.
 *
 * This is the file that stops a suite sharing state before it has started, and it is the one thing
 * here that is genuinely expensive to retrofit: adding an allocator later means touching every spec
 * that hard-codes an address, and until then the choice is no parallelism or flakes that land in the
 * wrong test.
 *
 * THE RULE: a test never names an identity. It asks for one.
 *
 * ── Why assignment is by WORKER INDEX and not a queue ──────────────────────────────────────────
 * A lock-and-queue allocator is the obvious design and the wrong one. Playwright already guarantees
 * one test at a time per worker, so \`workerIndex\` is a free, deterministic, contention-less
 * partition: worker 2 always gets identity 2, nothing waits, and a failure is reproducible because
 * the same worker gets the same identity on a re-run. A queue adds waiting, non-determinism, and a
 * lock to get wrong.
 *
 * ── Why the pool size is a HARD CEILING on workers ─────────────────────────────────────────────
 * More workers than identities means two workers sharing one, which is the exact defect this file
 * exists to prevent — and it would surface as a mysterious failure in whichever test got there
 * second. So \`identityFor\` throws, and playwright.config.ts caps \`workers\` to POOL.length. The
 * throw is the backstop in case somebody raises the cap with --workers.
 *
 * ── Why these values look odd ──────────────────────────────────────────────────────────────────
 * They are RESERVED and must stay disjoint from anything a human might register by hand. Pick values
 * no real user would own, write them down somewhere the team reads, and never widen the pool without
 * checking the target system for existing holders first.
 */

/**
 * The reserved pool. One entry per worker.
 *
 * ⚠️ Adding an entry is not a free action: it must be verified unused in the target system FIRST.
 * An identity already registered by somebody else turns every run on that worker red, and the red
 * appears to be about your test rather than about the data.
 */
export const POOL = [
    { email: 'nb-pool-00@example.invalid', mobile: '+640000000000' },
    { email: 'nb-pool-01@example.invalid', mobile: '+640000000001' },
    { email: 'nb-pool-02@example.invalid', mobile: '+640000000002' },
    { email: 'nb-pool-03@example.invalid', mobile: '+640000000003' },
] as const;

export type Identity = (typeof POOL)[number];

/**
 * The identity for a given worker.
 *
 * Throws rather than wrapping with a modulo. Wrapping would silently hand one identity to two
 * workers — a green run that is quietly invalid, which is worse than a loud failure at startup.
 */
export function identityFor(workerIndex: number): Identity {
    if (workerIndex >= POOL.length) {
        throw new Error(
            \`No identity for worker \${workerIndex}: the pool holds \${POOL.length}.\\n\` +
            \`Run with --workers=\${POOL.length} or fewer, or add a reserved identity to POOL in\\n\` +
            \`tests/fixtures/pool.ts — having FIRST checked the new value is unused in the target system.\\n\` +
            \`This throws on purpose: wrapping would give two workers the same identity and the run\\n\` +
            \`would pass while proving nothing.\`,
        );
    }
    return POOL[workerIndex];
}

/**
 * Return an identity to a reusable state.
 *
 * ⚠️ STUB — WIRE THIS UP. It is called after every test that takes an identity, and while it does
 * nothing your suite accumulates state: the second run of the day fails on data the first left
 * behind, and the failure looks like a product bug.
 *
 * Whatever "reset" means for your system goes here — delete the account, clear the cart, revoke the
 * session. If a reset can fail, let it LOG and carry on rather than failing the test: a teardown
 * that reds a passing test teaches people to disable teardown.
 */
export async function release(identity: Identity): Promise<void> {
    void identity;
    // Example shape, once you have an admin API:
    //
    //   const res = await fetch(\`\${process.env.ADMIN_API}/users?email=\${identity.email}\`, {
    //     method: 'DELETE',
    //     headers: { authorization: \`Bearer \${process.env.ADMIN_TOKEN}\` },
    //   });
    //   if (!res.ok) console.warn(\`[pool] reset failed for \${identity.email}: \${res.status}\`);
}
`;

/** The fixture that hands the identity out — deliberately the ONLY route to one. */
export const fixturesTs = () => `import { test as base } from '@playwright/test';
import { identityFor, release, type Identity } from './pool';

/**
 * The only way a test gets an identity.
 *
 * Deliberately the only route: if a spec can write an address literal instead, eventually one will,
 * and that is the first shared-state defect. The fixture also guarantees the matching \`release\`,
 * which is the half people forget — an allocator without teardown just moves the problem to the
 * second run of the day.
 */
export const test = base.extend<{ identity: Identity }>({
    identity: async ({}, use, testInfo) => {
        const identity = identityFor(testInfo.workerIndex);
        await use(identity);
        // Runs even when the test fails, which is the case that matters: a failed test is the one
        // most likely to have left something behind.
        await release(identity);
    },
});

export { expect } from '@playwright/test';
`;
