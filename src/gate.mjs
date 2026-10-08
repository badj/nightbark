/**
 * The Gate contract.
 *
 * A gate is a deterministic check: no model, no network, no cost. Per ADR-0004, anything
 * mechanically decidable is a gate and only genuine judgement reaches an Irregular.
 *
 * ⚠️ THE `fixtures` FIELD IS MANDATORY AND IS THE POINT. Per ADR-0002, a gate that cannot be
 * shown to fire is assumed broken — so every gate names two synthetic files:
 *
 *   fires  — a file it MUST flag. Proves the gate can fail at all.
 *   silent — a NEAR MISS it must NOT flag. Proves the gate is not just matching everything.
 *
 * The second is the one people skip, and it is the one that catches a gate written too greedily.
 * `nightbark selftest` refuses to pass if either is missing, so an unproven gate cannot ship.
 * This is not a convention; `validateGate` below makes it a structural requirement.
 */

/** @typedef {{ line: number, message: string, excerpt?: string }} RawFinding */

/**
 * @typedef {object} Gate
 * @property {string}   id        kebab-case, stable; appears in output and in SARIF ruleId
 * @property {string}   title     one line, what it looks for
 * @property {string}   why       why it matters. Shown with the finding, so a reader can judge it
 * @property {'error'|'warning'|'note'} severity
 * @property {(path: string) => boolean} appliesTo
 * @property {(file: {path: string, text: string, lines: string[]}) => RawFinding[]} check
 * @property {{ fires: string, silent: string }} fixtures  paths under fixtures/, relative
 */

const REQUIRED = ['id', 'title', 'why', 'severity', 'appliesTo', 'check', 'fixtures'];
const SEVERITIES = new Set(['error', 'warning', 'note']);

/**
 * Reject a malformed gate at load time rather than letting it report nothing at run time.
 * A gate missing `check` would otherwise look like a clean pass forever — the exact failure
 * mode ADR-0002 exists to prevent.
 */
export function validateGate(gate) {
    const problems = [];
    for (const key of REQUIRED) if (gate?.[key] === undefined) problems.push(`missing "${key}"`);
    if (gate?.id && !/^[a-z][a-z0-9-]*$/.test(gate.id)) problems.push(`id "${gate.id}" is not kebab-case`);
    if (gate?.severity && !SEVERITIES.has(gate.severity)) problems.push(`severity "${gate.severity}" is not one of ${[...SEVERITIES].join('/')}`);
    if (typeof gate?.check !== 'function') problems.push('"check" is not a function');
    if (typeof gate?.appliesTo !== 'function') problems.push('"appliesTo" is not a function');
    if (gate?.fixtures && (!gate.fixtures.fires || !gate.fixtures.silent)) {
        problems.push('"fixtures" needs BOTH fires and silent — a gate with no near-miss fixture is a gate nobody has proven is specific');
    }
    if (problems.length) throw new Error(`invalid gate ${gate?.id ?? '(no id)'}: ${problems.join('; ')}`);
    return gate;
}
