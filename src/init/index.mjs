import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { poolTs, fixturesTs } from './templates/pool.mjs';
import {
    playwrightConfigTs, packageJson, tsconfigJson, gitignore,
    exampleSpecTs, vacuousSpecTs, readmeMd,
} from './templates/project.mjs';
import { renderGithub, renderAzure } from './templates/ci.mjs';

/**
 * Scaffold a project. See ADR-0006 for what this deliberately does NOT do.
 *
 * ⚠️ Refuses to write into a non-empty directory. A scaffolder that overwrites is a scaffolder that
 * eats somebody's work once, and then nobody runs it on a directory they care about.
 */
export function init(dir, { baseURL = 'http://localhost:3000', force = false } = {}) {
    const target = resolve(dir);
    const name = basename(target);

    if (existsSync(target) && readdirSync(target).length && !force) {
        throw new Error(
            `${target} is not empty.\n` +
            `Refusing to write into it — pass --force only if you are certain nothing there matters.`,
        );
    }

    const files = {
        'package.json': packageJson(name),
        'tsconfig.json': tsconfigJson(),
        '.gitignore': gitignore(),
        'playwright.config.ts': playwrightConfigTs(baseURL),
        'tests/fixtures/pool.ts': poolTs(),
        'tests/fixtures/index.ts': fixturesTs(),
        'tests/example.spec.ts': exampleSpecTs(),
        'tests/vacuous.spec.ts': vacuousSpecTs(),
        '.github/workflows/ci.yml': renderGithub(name),
        'azure-pipelines.yml': renderAzure(name),
        'README.md': readmeMd(name, baseURL),
    };

    for (const [rel, content] of Object.entries(files)) {
        const abs = join(target, rel);
        mkdirSync(join(abs, '..'), { recursive: true });
        writeFileSync(abs, content);
    }
    return { target, name, files: Object.keys(files) };
}
