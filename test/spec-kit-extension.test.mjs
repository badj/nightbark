import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

/**
 * The spec-kit extension in integrations/spec-kit/.
 *
 * ⚠️ Its commands are PROSE that tells an agent which nightbark commands to run. Prose cannot fail,
 * so a renamed flag or subcommand would leave the extension describing a mechanism that no longer
 * exists — the "claim with no mechanism" this repo has already shipped once (the README's
 * `headline`). So the commands are not checked by reading them: every `nightbark …` line in them is
 * EXECUTED against a fixture, and must not be refused.
 *
 * Verified against a real install separately (spec-kit v1.2.2, 2026-10-21): `specify extension add
 * --dev` accepted it as 2 commands + 1 hook, registered under `hooks.after_implement`, and the
 * generated /speckit-implement skill reads exactly that key.
 */

const REPO = fileURLToPath(new URL('../', import.meta.url));
const EXT = join(REPO, 'integrations/spec-kit');
const manifest = readFileSync(join(EXT, 'extension.yml'), 'utf8');

test('every command the manifest provides follows speckit.<ext-id>.<cmd> and its file exists', () => {
    const id = manifest.match(/^\s*id:\s*(\S+)/m)[1];
    const cmds = [...manifest.matchAll(/-\s*name:\s*(\S+)\s*\n\s*file:\s*(\S+)/g)];
    assert.equal(cmds.length, 2);
    for (const [, name, file] of cmds) {
        assert.match(name, new RegExp(`^speckit\\.${id}\\.[a-z-]+$`), name);
        assert.ok(existsSync(join(EXT, file)), `${file} is named in the manifest but missing`);
    }
});

test('the hook targets a command the extension actually provides, on a hook point that exists', () => {
    const hook = manifest.match(/after_implement:\s*\n\s*command:\s*(\S+)/);
    assert.ok(hook, 'after_implement hook missing — there is no converge hook in spec-kit v1.2.2, so this is the one that matters');
    assert.ok(manifest.includes(`name: ${hook[1]}`), `hook names ${hook[1]}, which the extension does not provide`);
});

test('the extension version tracks the package version', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
    assert.equal(manifest.match(/^\s*version:\s*"([^"]+)"/m)[1], pkg.version);
});

test('⛔ every `nightbark …` line the extension tells an agent to run is ACCEPTED by the real CLI', () => {
    const lines = ['speckit.nightbark.audit.md', 'speckit.nightbark.vacuity.md']
        .flatMap((f) => readFileSync(join(EXT, 'commands', f), 'utf8').split('\n'))
        .map((l) => l.trim())
        .filter((l) => l.startsWith('npx --no-install nightbark '));
    assert.equal(lines.length, 4, 'audit, brief, challenge, verdict');

    const work = mkdtempSync(join(tmpdir(), 'nb-speckit-'));
    try {
        // The judge and Moriarty steps are an agent's job; stand in for them with empty answers,
        // which is a legitimate input ("nothing judged absent") rather than a mocked one.
        writeFileSync(join(work, 'answers.json'), '[]');
        writeFileSync(join(work, 'verdicts.json'), '[]');
        for (const line of lines) {
            const argv = line.replace('npx --no-install nightbark ', '')
                .replaceAll('<path>', join(REPO, 'fixtures/targets/spec-kit-suite'))
                .replaceAll('.specify/nightbark/', `${work}/`)
                .split(/\s+/);
            const run = spawnSync(process.execPath, [join(REPO, 'bin/nightbark.mjs'), ...argv], { encoding: 'utf8' });
            assert.equal(run.status, 0, `refused: nightbark ${argv.join(' ')}\n${run.stdout}${run.stderr}`);
        }
        assert.ok(existsSync(join(work, 'brief.md')), 'the brief the judge is told to read was never written');
        assert.ok(existsSync(join(work, 'audit.sarif')), 'the SARIF the audit is told to write was never written');
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
});

test('⚠️ both commands tell the agent to STOP when nightbark is missing, rather than report clean', () => {
    for (const f of ['speckit.nightbark.audit.md', 'speckit.nightbark.vacuity.md']) {
        assert.match(readFileSync(join(EXT, 'commands', f), 'utf8'), /STOP/, f);
    }
});
