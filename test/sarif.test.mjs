import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSarif } from '../src/report/sarif.mjs';
import { gates } from '../src/gates/index.mjs';

/**
 * The output format gets proven too.
 *
 * ADR-0002 says a discipline ships as something that runs — that applies to the serialiser as much
 * as to the gates. A malformed SARIF file does not error: GitHub Code Scanning simply ingests
 * nothing and the run goes green, which is a dog that did not bark in the tool itself.
 */

const SEVERITIES = ['error', 'warning', 'note', 'none'];

const sample = {
    root: '/repo',
    gatesRun: gates.map((g) => g.id),
    findings: [{
        origin: 'gate', gateId: gates[0].id, severity: 'warning',
        file: 'tests/e2e/cart.spec.ts', line: 42,
        message: 'something worth a reader\'s time', excerpt: 'await page.waitForTimeout(500);',
        why: gates[0].why,
    }],
};

test('is SARIF 2.1.0 with the schema a consumer looks for', () => {
    const s = toSarif(sample);
    assert.equal(s.version, '2.1.0');
    assert.match(s.$schema, /sarif-2\.1\.0/);
    assert.equal(s.runs.length, 1);
});

test('rules mirror the gates that RAN, not the gates that fired', () => {
    // The distinction matters: a rules array listing gates that never executed lets a reader infer
    // coverage that was not attempted.
    const narrowed = toSarif({ ...sample, gatesRun: [gates[0].id] }).runs[0];
    assert.equal(narrowed.tool?.driver?.rules?.length ?? -1, 1);
    assert.equal(narrowed.tool.driver.rules[0].id, gates[0].id);

    const full = toSarif(sample).runs[0];
    assert.equal(full.tool.driver.rules.length, gates.length);
});

test('every rule carries a level a consumer can drive policy from', () => {
    for (const r of toSarif(sample).runs[0].tool.driver.rules) {
        assert.ok(SEVERITIES.includes(r.defaultConfiguration.level), `bad level on ${r.id}`);
    }
});

test('every rule carries the WHY, so a finding can be judged rather than guessed at', () => {
    for (const r of toSarif(sample).runs[0].tool.driver.rules) {
        assert.ok((r.fullDescription?.text?.length ?? 0) > 40, `${r.id} has no usable fullDescription`);
    }
});

test('results anchor to a RELATIVE path and a real line', () => {
    const [res] = toSarif(sample).runs[0].results;
    const loc = res.locations[0].physicalLocation;
    assert.equal(loc.artifactLocation.uri, 'tests/e2e/cart.spec.ts');
    assert.ok(!loc.artifactLocation.uri.startsWith('/'), 'absolute paths break annotation on the diff');
    assert.equal(loc.artifactLocation.uriBaseId, 'REPOROOT');
    assert.equal(loc.region.startLine, 42);
});

test('the uri base id a result refers to actually exists in the run', () => {
    const run = toSarif(sample).runs[0];
    const base = run.results[0].locations[0].physicalLocation.artifactLocation.uriBaseId;
    assert.ok(run.originalUriBaseIds?.[base]?.uri?.startsWith('file:///'), 'dangling uriBaseId');
});

test('a zero-line or missing line never emits startLine 0, which SARIF forbids', () => {
    const odd = toSarif({ ...sample, findings: [{ ...sample.findings[0], line: 0 }] });
    assert.equal(odd.runs[0].results[0].locations[0].physicalLocation.region.startLine, 1);
});

test('no findings still produces a valid, ingestible run', () => {
    // A tool that writes nothing on a clean pass looks identical to a tool that crashed.
    const empty = toSarif({ ...sample, findings: [] });
    assert.equal(empty.runs[0].results.length, 0);
    assert.ok(empty.runs[0].tool.driver.rules.length > 0);
});
