#!/usr/bin/env node
import { audit } from '../src/runner.mjs';
import { selftest } from '../src/selftest.mjs';
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

if (cmd === 'audit') {
    const target = rest.find((a) => !a.startsWith('--')) ?? process.cwd();
    const only = flag('gate')?.split(',') ?? null;
    const { findings, filesRead, gatesRun } = audit(target, { only });

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
    console.log(`  ${findings.length} finding(s) from ${byGate.size} gate(s).\n`);
    process.exit(0);
}

console.log(`
  nightbark — finds the tests that did not bark

    nightbark audit [path]        run the gates over a repo (read-only)
    nightbark audit --gate <id>   run one gate
    nightbark selftest            prove every gate can fire, and is specific

  ${gates.length} gate(s) registered: ${gates.map((g) => g.id).join(', ')}
`);
process.exit(cmd === 'help' ? 0 : 1);
