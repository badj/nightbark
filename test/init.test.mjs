import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init } from '../src/init/index.mjs';
import { audit } from '../src/runner.mjs';
import { candidates } from '../src/irregulars/vacuity.mjs';

const scaffold = () => {
    const dir = mkdtempSync(join(tmpdir(), 'nb-init-'));
    rmSync(dir, { recursive: true, force: true });
    return { dir, ...init(dir) };
};

test('writes every file the scaffold needs, and nothing speculative', () => {
    // ADR-0006 refusal 2: everything generated must be load-bearing. If this list grows, something
    // has been added that the example does not need — which teaches people to delete generated code
    // without reading it, and the day they delete the allocator the suite starts sharing state.
    const { dir, files } = scaffold();
    assert.deepEqual(new Set(files), new Set([
        'package.json', 'tsconfig.json', '.gitignore', 'playwright.config.ts',
        'tests/fixtures/pool.ts', 'tests/fixtures/index.ts',
        'tests/example.spec.ts', 'tests/vacuous.spec.ts',
        '.github/workflows/ci.yml', 'azure-pipelines.yml', 'README.md',
    ]));
    for (const f of files) assert.ok(existsSync(join(dir, f)), `${f} not written`);
    rmSync(dir, { recursive: true, force: true });
});

test('⚠️ @types/node is declared — without it a fresh scaffold fails tsc on its first run', () => {
    // Regression. The first version omitted it while tsconfig declared types:['node'], so a brand
    // new project failed `tsc --noEmit` before anybody had written a line. Found by actually running
    // npm install and tsc against the output instead of assuming.
    const { dir } = scaffold();
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    assert.ok(pkg.devDependencies['@types/node'], '@types/node missing');
    const tsconfig = JSON.parse(readFileSync(join(dir, 'tsconfig.json'), 'utf8'));
    assert.ok(tsconfig.compilerOptions.types.includes('node'), 'tsconfig no longer needs node types — drop the dep');
    rmSync(dir, { recursive: true, force: true });
});

test('refuses a non-empty directory rather than overwriting somebody work', () => {
    const { dir } = scaffold();
    assert.throws(() => init(dir), /not empty/);
    // ...but --force is honoured, for the case where the caller is certain.
    assert.doesNotThrow(() => init(dir, { force: true }));
    rmSync(dir, { recursive: true, force: true });
});

test('the audit flags the deliberately-vacuous spec and leaves the honest one alone', () => {
    // The scaffold's whole teaching device. If this stops discriminating, a new user either sees no
    // finding at all (and learns nothing) or sees one on the example they were told to copy.
    const { dir } = scaffold();
    const { findings } = audit(dir);
    assert.ok(findings.length > 0, 'the vacuous spec should produce at least one finding');
    assert.ok(findings.every((f) => f.file.includes('vacuous')),
        `findings must be confined to the vacuous spec, got: ${findings.map((f) => f.file).join(', ')}`);
    rmSync(dir, { recursive: true, force: true });
});

test('the vacuity Irregular finds the dead-selector assertion as a candidate', () => {
    const { dir } = scaffold();
    const found = candidates(dir);
    assert.ok(found.some((c) => c.file.includes('vacuous')), 'no candidate from the vacuous spec');
    rmSync(dir, { recursive: true, force: true });
});

for (const file of ['.github/workflows/ci.yml', 'azure-pipelines.yml']) {
    test(`${file}: every emitted scalar is quoted, so a colon cannot break the user's CI`, () => {
        // The same class of bug that made this repo's OWN first generated workflow invalid YAML.
        // Shipping it in a scaffold would be worse: the error surfaces in the user's repo.
        const { dir } = scaffold();
        for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
            const m = line.match(/^\s*-?\s*(name|run|script|displayName|sarif_file|path|targetPath|artifact):\s*(.+)$/);
            if (!m) continue;
            assert.ok(m[2].trim().startsWith("'"), `unquoted ${m[1]} in ${file}: ${m[2]}`);
        }
        rmSync(dir, { recursive: true, force: true });
    });
}

test('the pool throws rather than wrapping when workers exceed the identities', async () => {
    // Wrapping would hand two workers the same identity: a green run that is quietly invalid, which
    // is strictly worse than a loud failure at startup.
    const { dir } = scaffold();
    const src = readFileSync(join(dir, 'tests/fixtures/pool.ts'), 'utf8');
    assert.match(src, /throw new Error/, 'identityFor must throw past the pool size');
    assert.ok(!/%\s*POOL\.length|POOL\.length\s*\]/.test(src), 'must not modulo-wrap into the pool');
    rmSync(dir, { recursive: true, force: true });
});

test('release() exists and is clearly marked as a stub the user must wire up', () => {
    const { dir } = scaffold();
    const src = readFileSync(join(dir, 'tests/fixtures/pool.ts'), 'utf8');
    assert.match(src, /export async function release/);
    assert.match(src, /STUB/, 'the teardown stub must announce itself — a silent no-op accumulates state');
    rmSync(dir, { recursive: true, force: true });
});

test('the fixture is the only route to an identity', () => {
    // If a spec can write an address literal instead, eventually one will — and that is the first
    // shared-state defect.
    const { dir } = scaffold();
    assert.match(readFileSync(join(dir, 'tests/fixtures/index.ts'), 'utf8'), /identityFor\(testInfo\.workerIndex\)/);
    const example = readFileSync(join(dir, 'tests/example.spec.ts'), 'utf8');
    assert.match(example, /identity\.email/, 'the example must take its identity from the fixture');
    assert.ok(!/@example\.(invalid|com)/.test(example), 'the example must not hard-code an address');
    rmSync(dir, { recursive: true, force: true });
});

test('the config caps workers to the pool size and does not quietly retry', () => {
    const { dir } = scaffold();
    const cfg = readFileSync(join(dir, 'playwright.config.ts'), 'utf8');
    assert.match(cfg, /workers:\s*POOL\.length/);
    assert.match(cfg, /retries:\s*0/);
    assert.match(cfg, /fullyParallel:\s*true/);
    rmSync(dir, { recursive: true, force: true });
});
