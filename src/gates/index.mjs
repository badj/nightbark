/**
 * The gate registry.
 *
 * Adding a gate here is the ONLY way to ship one, and `selftest` walks this same list — so a gate
 * without working fires/silent fixtures fails the build. That coupling is deliberate: it is what
 * makes ADR-0002 structural rather than aspirational.
 */
import fixedWait from './fixed-wait.mjs';
import sharedTestIdentity from './shared-test-identity.mjs';
import serialisedSuite from './serialised-suite.mjs';
import traceability from './traceability.mjs';

export const gates = [
    fixedWait,
    sharedTestIdentity,
    serialisedSuite,
    traceability,
];
