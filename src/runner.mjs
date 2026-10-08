import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gates } from './gates/index.mjs';

/** Directories never worth reading. Kept small and boring on purpose. */
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.svelte-kit',
    'playwright-report', 'test-results', 'allure-report', 'allure-results', '.features-gen',
    '.cache', '.turbo', '.venv', '__pycache__',
]);

const READABLE = /\.[cm]?[tj]sx?$|\.feature$/;
const MAX_BYTES = 512 * 1024; // a file larger than this is generated, not authored

/** Walk a tree, yielding candidate source files. Read-only by construction. */
export function* walk(root, dir = root) {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
        if (e.name.startsWith('.') && e.name !== '.') {
            if (SKIP_DIRS.has(e.name)) continue;
        }
        const full = join(dir, e.name);
        if (e.isDirectory()) {
            if (SKIP_DIRS.has(e.name)) continue;
            yield* walk(root, full);
        } else if (e.isFile() && READABLE.test(e.name)) {
            let size = 0;
            try { size = statSync(full).size; } catch { continue; }
            if (size > MAX_BYTES) continue;
            yield { abs: full, path: relative(root, full).split(sep).join('/') };
        }
    }
}

/**
 * Is this file TEST code?
 *
 * ⚠️ Decided by CONTENT, not by path alone — because a path guess gets this wrong in a way that
 * costs precision. The first version of the fixed-wait gate treated any `pages/` directory as Page
 * Objects and flagged `src/pages/CheckoutPage.tsx` in a React app, where the sleep was deliberate
 * application behaviour ("simulate order processing delay"). A correct app is not a finding.
 *
 * So: a conventional spec filename, or a conventional test root, or an actual import of a test
 * framework. That last one is what keeps genuine Page Objects in scope (they import `Page` for its
 * type) while leaving app components out.
 */
const SPEC_NAME = /\.(spec|test)\.[cm]?[tj]sx?$/;
const TEST_ROOT = /(^|\/)(tests?|e2e|__tests__|cypress|playwright|specs?|features)\//;
const FRAMEWORK_IMPORT = /from\s+['"](?:@playwright\/test|playwright(?:-core)?|@jest\/globals|vitest|cypress|@cucumber\/cucumber|playwright-bdd)['"]/;

export function looksLikeTestCode(path, text) {
    return SPEC_NAME.test(path) || TEST_ROOT.test(path) || FRAMEWORK_IMPORT.test(text);
}

/**
 * Run every gate over a target tree.
 *
 * ⚠️ Read-only: this function opens files and nothing else. Per TIER-1 that is a requirement, not a
 * courtesy — an auditor that can write is an auditor you cannot point at someone else's repo.
 */
export function audit(root, { only = null } = {}) {
    const active = only ? gates.filter((g) => only.includes(g.id)) : gates;
    const findings = [];
    let filesRead = 0;

    for (const file of walk(root)) {
        const applicable = active.filter((g) => g.appliesTo(file.path));
        if (!applicable.length) continue;

        let text;
        try { text = readFileSync(file.abs, 'utf8'); } catch { continue; }
        filesRead++;
        const lines = text.split('\n');

        // Gates declaring scope 'test-code' never see application source. Default is 'test-code',
        // because that is the safe direction: a missed finding is cheaper than a wrong one.
        const isTest = looksLikeTestCode(file.path, text);

        for (const gate of applicable) {
            if ((gate.scope ?? 'test-code') === 'test-code' && !isTest) continue;
            let raw = [];
            try {
                raw = gate.check({ path: file.path, text, lines }) ?? [];
            } catch (err) {
                // A gate that throws must say so loudly. Swallowing it would report a clean pass.
                findings.push({
                    origin: 'gate', gateId: gate.id, severity: 'error', file: file.path, line: 1,
                    message: `gate "${gate.id}" threw while reading this file: ${err.message}`,
                    why: 'A gate that throws reports nothing, which is indistinguishable from a clean pass.',
                });
                continue;
            }
            for (const f of raw) {
                findings.push({
                    origin: 'gate',
                    gateId: gate.id,
                    severity: gate.severity,
                    file: file.path,
                    line: f.line,
                    message: f.message,
                    excerpt: f.excerpt,
                    why: gate.why,
                });
            }
        }
    }

    return { findings, filesRead, gatesRun: active.map((g) => g.id) };
}
