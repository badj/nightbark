import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { candidates } from '../src/irregulars/vacuity.mjs';
import { brief } from '../src/irregulars/brief.mjs';
import { challenge } from '../src/irregulars/challenge.mjs';
import { buildSpecIndex } from '../src/irregulars/contract.mjs';

/**
 * The spec-kit contract section of the vacuity brief. Each test pins one row of
 * fixtures/targets/spec-kit-suite/ANSWERS.md.
 *
 * Why it is context and not a gate: a `spec-coverage` gate was prototyped against 13 public
 * spec-kit repos on 2026-10-21 and scored 0 of 4 on hand-checked hits. See contract.mjs.
 */

const ROOT = fileURLToPath(new URL('../fixtures/targets/spec-kit-suite/', import.meta.url));
const found = candidates(ROOT);
const byFile = (f) => found.filter((c) => c.file === `tests/${f}`);

test('the fixture yields exactly the four planted candidates', () => {
    assert.equal(found.length, 4, found.map((c) => c.id).join('\n'));
});

test('a DEFINITION counts and a changelog MENTION does not', () => {
    const idx = buildSpecIndex(ROOT);
    assert.deepEqual(idx.get('FR-002').map((d) => d.feature), ['001-cart']);
    assert.equal(idx.get('FR-002').length, 1, '"6. FR-002 extended…" is a changelog line, not a definition');
});

test('every definition shape seen in the field is read: bold, titled-bold, plain, table row', () => {
    const idx = buildSpecIndex(ROOT);
    assert.ok(idx.get('FR-002')[0].text.includes('Empty state'), 'a title inside the bold');
    assert.ok(idx.get('FR-001').some((d) => d.text.startsWith('- FR-001:')), 'no bold at all');
    assert.ok(idx.get('SC-001')[0].text.startsWith('|'), 'a requirements table row');
});

test('⚠️ a citation in the FILE HEADER reaches the test — the commonest way real repos cite', () => {
    const [c] = byFile('cart.spec.ts');
    assert.deepEqual(c.contract.map((x) => x.id), ['FR-002']);
});

test('⛔ an id defined in SEVERAL features shows them ALL and says so — it is never resolved by guessing', () => {
    const c = byFile('guest.spec.ts').find((x) => x.kind === 'negative-visibility');
    const fr1 = c.contract.find((x) => x.id === 'FR-001');
    assert.equal(fr1.total, 2);
    assert.deepEqual(fr1.defs.map((d) => d.feature).sort(), ['001-cart', '002-guest-access']);
    assert.match(brief(found), /defined in \*\*2 features\*\*/);
});

test('a feature the test file NAMES is ranked first and marked — a hint, never a resolution', () => {
    const c = byFile('guest.spec.ts').find((x) => x.kind === 'negative-visibility');
    const fr1 = c.contract.find((x) => x.id === 'FR-001');
    assert.deepEqual(fr1.defs.map((d) => [d.feature, d.named]), [['002-guest-access', true], ['001-cart', false]]);
    assert.match(brief([c]), /specs\/002-guest-access\/spec\.md:\d+` _\(named in this file\)_/);
});

test('⛔ a later test does NOT inherit an earlier test\'s citations — the header stops at the first test', () => {
    const c = byFile('guest.spec.ts').find((x) => x.kind === 'empty-count');
    assert.deepEqual(c.contract.map((x) => x.id), ['FR-099'], 'a fixed 30-line header window leaked FR-001/SC-001 in here');
});

test('an id defined NOWHERE is said so plainly — a claim of coverage nobody can read', () => {
    const c = byFile('guest.spec.ts').find((x) => x.kind === 'empty-count');
    assert.equal(c.contract[0].total, 0);
    assert.match(brief([c]), /defined in no `specs\/\*\/spec\.md`/);
});

test('a test citing nothing leaves the brief exactly as before — no empty section', () => {
    const [c] = byFile('uncited.spec.ts');
    assert.equal(c.contract, null);
    assert.doesNotMatch(brief([c]), /Requirements this test cites/);
});

test('a repo with no specs/ directory gets no contract on any candidate', () => {
    const plain = candidates(fileURLToPath(new URL('../fixtures/fixed-wait/', import.meta.url)));
    assert.ok(plain.length > 0);
    assert.ok(plain.every((c) => c.contract === null));
});

test('⛔ Moriarty sees the SAME contract the judge saw — one renderer, both briefs', () => {
    const c = byFile('guest.spec.ts').find((x) => x.kind === 'negative-visibility');
    const text = challenge([c], [{ id: c.id, premise: 'absent', evidence: 'x', confidence: 'high' }]);
    assert.match(text, /Requirements this test cites/);
    assert.match(text, /specs\/002-guest-access\/spec\.md/);
});
