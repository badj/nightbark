#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { audit } from '../src/runner.mjs';
import { toSarif } from '../src/report/sarif.mjs';
import { selftest } from '../src/selftest.mjs';
import { selfcheck } from '../src/selfcheck.mjs';
import { gates } from '../src/gates/index.mjs';

const [cmd = 'help', ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(`--${name}`); return i === -1 ? null : rest[i + 1]; };

if (cmd === 'selftest') {
    const results = selftest();
    const bad = results.filter((r) => !r.ok);
    for (const r of results) {
        console.log(`  ${r.ok ? 'ok  ' : 'FAIL'}  ${r.gate} / ${r.kind.padEnd(6)}  ${r.detail}`);
    }
    console.log(`\n  ${gates.length} gate(s), ${results.length} proof(s), ${bad.length} failing`);
    if (bad.length) {
        console.log('\n  A failing proof means a gate is untrustworthy, not that a fixture is awkward.');
        console.log('  "fires" failing = the gate cannot fail. "silent" failing = the gate is too greedy.\n');
    }
    process.exit(bad.length ? 1 : 0);
}

if (cmd === 'selfcheck') {
    const { findings, denylistTerms, shapeRules } = selfcheck();
    console.log(`\n  ADR-0001 self-check — ${shapeRules} shape rule(s), ${denylistTerms} denylist term(s)\n`);
    if (!denylistTerms) {
        console.log('  \u26a0\ufe0f  No .nightbark-denylist found. The shape rules ran, but named-term checking did NOT.');
        console.log('     An absent denylist is not a pass. Create one (gitignored, one term per line) on any');
        console.log('     machine that has worked on a client codebase.\n');
    }
    for (const f of findings) {
        console.log(`  ${f.rule}  ${f.file}:${f.line}  ${f.hit}`);
        console.log(`      ${f.why}`);
    }
    console.log(findings.length
        ? `\n  \u2716  ${findings.length} possible client-identifying item(s). ADR-0001 says none may ship.\n`
        : `  \u2714  No client-identifying content found by the rules that ran.\n`);
    process.exit(findings.length ? 1 : 0);
}

if (cmd === 'audit') {
    const target = resolve(rest.find((a) => !a.startsWith('--')) ?? process.cwd());
    const only = flag('gate')?.split(',') ?? null;
    const { findings, filesRead, gatesRun } = audit(target, { only });

    // ── SARIF ────────────────────────────────────────────────────────────────────────────────────
    const sarifPath = flag('sarif');
    if (sarifPath) {
        writeFileSync(sarifPath, JSON.stringify(toSarif({ findings, root: target, gatesRun }), null, 2));
        console.log(`\n  SARIF written: ${sarifPath}  (${findings.length} result(s))`);
    }

    // ── exit policy ──────────────────────────────────────────────────────────────────────────────
    // Default `error` and not `warning`, deliberately: a tool whose first run reds somebody's
    // pipeline gets removed from the pipeline. Tighten with --fail-on once the output is trusted.
    const RANK = { note: 1, warning: 2, error: 3 };
    const failOn = flag('fail-on') ?? 'error';
    const threshold = RANK[failOn] ?? 99;   // --fail-on never  -> nothing reaches it
    const breaching = findings.filter((f) => (RANK[f.severity] ?? 0) >= threshold);

    const byGate = new Map();
    for (const f of findings) byGate.set(f.gateId, [...(byGate.get(f.gateId) ?? []), f]);

    console.log(`\n  nightbark audit — ${target}`);
    console.log(`  ${filesRead} file(s) read · ${gatesRun.length} gate(s): ${gatesRun.join(', ')}\n`);

    if (!findings.length) {
        console.log('  No findings. ⚠️ That is a claim about these gates, not about the suite —\n'
                  + '  run `nightbark selftest` to confirm the gates can fire at all.\n');
        process.exit(0);
    }
    for (const [gateId, list] of byGate) {
        const gate = gates.find((g) => g.id === gateId);
        console.log(`  ${gateId} — ${gate?.title ?? ''}  (${list.length})`);
        for (const f of list) {
            console.log(`    ${f.file}:${f.line}  ${f.message}`);
            if (f.excerpt) console.log(`        ${f.excerpt}`);
        }
        if (gate?.why) console.log(`    why: ${gate.why}\n`);
    }
    const counts = ['error', 'warning', 'note']
        .map((s) => [s, findings.filter((f) => f.severity === s).length])
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${n} ${s}`)
        .join(' · ');
    console.log(`  ${findings.length} finding(s) from ${byGate.size} gate(s)  —  ${counts}`);
    console.log(`  exit policy: --fail-on ${failOn}  ->  ${breaching.length} breaching\n`);
    process.exit(breaching.length ? 1 : 0);
}

console.log(`
  nightbark — finds the tests that did not bark

    nightbark audit [path]        run the gates over a repo (read-only)
    nightbark audit --gate <id>   run one gate
    nightbark selftest            prove every gate can fire, and is specific
    nightbark selfcheck           enforce ADR-0001 on THIS repo - no client content

  ${gates.length} gate(s) registered: ${gates.map((g) => g.id).join(', ')}
`);
process.exit(cmd === 'help' ? 0 : 1);
