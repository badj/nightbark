import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from '../src/runner.mjs';

const TARGET = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures/targets/traced-suite');

/**
 * Measured against an explicit ANSWER KEY (fixtures/targets/traced-suite/ANSWERS.md).
 *
 * ⚠️ SYNTHETIC, and labelled as such everywhere it is reported. It exists because no public
 * Playwright repo carries requirement ids — measured as zero across all three real targets — so
 * there is no field data for this gate. A synthetic number measures the gate against MY OWN
 * expectations; only a real repo measures it against the world. The two must never be added together.
 *
 * The value is in the five CORRECT patterns it also contains. Three of them broke earlier versions
 * of this gate: an inherited Feature-line tag read as a clash, a defect reference on a parked test
 * read as a lying id, and a collection-neutral decision marker read as an exclusion.
 */

test('finds exactly the planted faults — 5 findings, 2 error and 3 note', () => {
    const { findings } = audit(TARGET, { only: ['traceability'] });
    assert.equal(findings.length, 5, `expected 5, got ${findings.length}: ${findings.map((f) => f.file).join(', ')}`);
    assert.equal(findings.filter((f) => f.severity === 'error').length, 2);
    assert.equal(findings.filter((f) => f.severity === 'note').length, 3);
});

test('the two ERRORS are the unambiguous case-id duplicates, including across formats', () => {
    const errs = audit(TARGET, { only: ['traceability'] }).findings.filter((f) => f.severity === 'error');
    const msgs = errs.map((f) => f.message).join(' ');
    assert.match(msgs, /700001/, 'the feature-to-feature duplicate');
    // A .spec.ts and a .feature sharing an id is the easiest duplicate to miss, because most tools
    // only look at one format.
    assert.match(msgs, /700002/, 'the spec-to-feature duplicate');
});

test('the three NOTES are the judgement calls, not declared defects', () => {
    const notes = audit(TARGET, { only: ['traceability'] }).findings.filter((f) => f.severity === 'note');
    const msgs = notes.map((f) => f.message).join(' ');
    assert.match(msgs, /E2E-G99-001/, 'family id across scenarios — deliberate for a sweep case');
    assert.match(msgs, /700003/, 'id on an @archived scenario');
    assert.match(msgs, /700004/, 'id on a test.skip');
    assert.ok(!/test\.skip\($/m.test(msgs), 'the skip marker should read as test.skip(), not a dangling paren');
});

for (const [file, why] of [
    ['inherited.feature', 'a Feature-line tag inherited by 3 scenarios is 1 tag and 3 occurrences — normal'],
    ['paired.feature', 'several ids on ONE test is fine; one id on several tests is not'],
    ['parked.feature', 'a defect reference on a parked test is the CORRECT pattern'],
    ['deferred.feature', '@outOfScope is a decision marker and collection-neutral — the test still publishes'],
    ['versions.spec.ts', 'version numbers and ports are not traceability links'],
]) {
    test(`silent on ${file} — ${why}`, () => {
        const hits = audit(TARGET, { only: ['traceability'] }).findings.filter((f) => f.file.endsWith(file));
        assert.equal(hits.length, 0, `false positive in ${file}: ${hits.map((f) => f.message).join(' | ')}`);
    });
}
