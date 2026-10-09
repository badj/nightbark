#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { audit } from '../src/runner.mjs';
import { toSarif } from '../src/report/sarif.mjs';
import { candidates } from '../src/irregulars/vacuity.mjs';
import { brief } from '../src/irregulars/brief.mjs';
import { challenge } from '../src/irregulars/challenge.mjs';
import { mergeVerdicts } from '../src/irregulars/verdict.mjs';
import { init } from '../src/init/index.mjs';
import { readFileSync } from 'node:fs';
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

if (cmd === 'init') {
    const dir = rest.find((a) => !a.startsWith('--') && a !== 'init');
    if (!dir) { console.log('\n  usage: nightbark init <dir> [--base-url http://localhost:3000] [--force]\n'); process.exit(1); }
    try {
        const { target, name, files } = init(dir, {
            baseURL: flag('base-url') ?? 'http://localhost:3000',
            force: rest.includes('--force'),
        });
        console.log(`\n  scaffolded ${name} -> ${target}\n`);
        for (const f of files) console.log(`      ${f}`);
        console.log(`
  Next:
      cd ${dir}
      npm install && npx playwright install chromium
      npm test            # one test FAILS to be found by the audit, see below
      npm run audit       # nightbark flags tests/vacuous.spec.ts

  \u26a0\ufe0f  Two things need your attention before this suite is honest:
      1. tests/fixtures/pool.ts - release() is a STUB. Until it is wired up your suite
         accumulates state, and the second run of the day fails on data the first left behind.
      2. tests/vacuous.spec.ts is deliberately broken. Fix it, watch the finding disappear,
         then delete it.
`);
        process.exit(0);
    } catch (err) {
        console.log(`\n  ${err.message}\n`);
        process.exit(1);
    }
}

if (cmd === 'brief') {
    const which = rest.find((a) => !a.startsWith('--') && a !== 'brief');
    const target = resolve(rest.filter((a) => !a.startsWith('--') && a !== which)[0] ?? process.cwd());
    if (which !== 'vacuity') {
        console.log('\n  usage: nightbark brief vacuity <path> [--out brief.md]\n  (vacuity is the only Irregular so far)\n');
        process.exit(1);
    }
    const found = candidates(target);
    const text = brief(found, { target });
    const out = flag('out');
    if (out) { writeFileSync(out, text); console.log(`\n  brief written: ${out}  (${found.length} candidate(s))\n`); }
    else console.log(text);
    process.exit(0);
}

if (cmd === 'verdict') {
    // nightbark verdict <repo> --answers a.json --verdicts v.json [--sarif out.json]
    const target = resolve(rest.find((a) => !a.startsWith('--') && a !== 'verdict') ?? process.cwd());
    const read = (p, what) => {
        try { const j = JSON.parse(readFileSync(p, 'utf8')); if (!Array.isArray(j)) throw new Error('expected a JSON array'); return j; }
        catch (err) { console.log(`\n  cannot read ${what}: ${err.message}\n`); process.exit(1); }
    };
    const answersPath = flag('answers');
    if (!answersPath) { console.log('\n  usage: nightbark verdict <repo> --answers a.json [--verdicts v.json] [--sarif out.json]\n'); process.exit(1); }
    const answers = read(answersPath, 'answers');
    const verdictsPath = flag('verdicts');
    const verdicts = verdictsPath ? read(verdictsPath, 'verdicts') : [];

    const found = candidates(target);
    const known = new Set(found.map((c) => c.id));
    const ghosts = [...answers, ...verdicts].filter((a) => !known.has(a.id)).map((a) => a.id);
    if (ghosts.length) {
        console.log(`\n  \u26a0\ufe0f  ${ghosts.length} entr(y/ies) name an id that is not a candidate — refusing:`);
        for (const g of [...new Set(ghosts)].slice(0, 5)) console.log(`      ${g}`);
        console.log('');
        process.exit(1);
    }

    const { findings, stats } = mergeVerdicts({ candidates: found, answers, verdicts });
    console.log(`\n  nightbark verdict — ${target}`);
    console.log(`  ${found.length} candidate(s) · judge: ${stats.established} established, ${stats.uncertain} uncertain`);
    console.log(`  Moriarty: ${stats.confirmed ?? 0} confirmed, ${stats.downgraded ?? 0} downgraded, ${stats.dropped ?? 0} dropped`
              + (stats.unreviewed ? `, \u26a0\ufe0f ${stats.unreviewed} UNREVIEWED` : ''));
    if (!verdictsPath) console.log('  \u26a0\ufe0f  No --verdicts given: nothing has been adversarially reviewed, so no claim is reportable as a defect.');
    console.log('');

    for (const f of findings) {
        console.log(`  [${f.severity}] ${f.file}:${f.line}  (${f.verdict})`);
        console.log(`      ${f.excerpt}`);
        console.log(`      ${f.message.slice(0, 400)}`);
        console.log('');
    }
    const sarif = flag('sarif');
    if (sarif) {
        writeFileSync(sarif, JSON.stringify(toSarif({ findings, root: target, gatesRun: [] }), null, 2));
        console.log(`  SARIF written: ${sarif}  (${findings.length} result(s))\n`);
    }
    const RANK = { note: 1, warning: 2, error: 3 };
    const failOn = flag('fail-on') ?? 'error';
    const breaching = findings.filter((f) => (RANK[f.severity] ?? 0) >= (RANK[failOn] ?? 99));
    console.log(`  ${findings.length} reportable finding(s) · exit policy --fail-on ${failOn} -> ${breaching.length} breaching\n`);
    process.exit(breaching.length ? 1 : 0);
}

if (cmd === 'challenge') {
    // nightbark challenge <repo> <answers.json> [--out challenge.md]
    const args = rest.filter((a) => !a.startsWith('--'));
    const target = resolve(args[0] ?? process.cwd());
    const answersPath = args[1];
    if (!answersPath) {
        console.log('\n  usage: nightbark challenge <repo> <answers.json> [--out challenge.md]\n');
        process.exit(1);
    }
    let answers;
    try {
        answers = JSON.parse(readFileSync(answersPath, 'utf8'));
        if (!Array.isArray(answers)) throw new Error('expected a JSON array');
    } catch (err) {
        console.log(`\n  cannot read answers: ${err.message}\n`);
        process.exit(1);
    }
    const found = candidates(target);
    // ⚠️ An answer naming an id that was never a candidate means the judge invented a finding for
    // code it was not shown. Refuse rather than carry it forward.
    const known = new Set(found.map((c) => c.id));
    const ghosts = answers.filter((a) => !known.has(a.id)).map((a) => a.id);
    if (ghosts.length) {
        console.log(`\n  \u26a0\ufe0f  ${ghosts.length} answer(s) name an id that is not a candidate:`);
        for (const g of ghosts.slice(0, 5)) console.log(`      ${g}`);
        console.log('      An invented id means a finding for code the judge never saw. Refusing.\n');
        process.exit(1);
    }
    const text = challenge(found, answers, { target });
    const out = flag('out');
    if (out) { writeFileSync(out, text); console.log(`\n  challenge written: ${out}\n`); }
    else console.log(text);
    process.exit(0);
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

    nightbark init <dir>          scaffold a suite whose disciplines are structural
    nightbark audit [path]        run the gates over a repo (read-only)
    nightbark audit --gate <id>   run one gate
    nightbark selftest            prove every gate can fire, and is specific
    nightbark selfcheck           enforce ADR-0001 on THIS repo - no client content
    nightbark brief vacuity <p>   gather candidates + context for the vacuity Irregular
    nightbark challenge <p> <a>   Moriarty: attack the findings a judge returned
    nightbark verdict <p> ...     merge judge + Moriarty into findings (--sarif, --fail-on)

  ${gates.length} gate(s) registered: ${gates.map((g) => g.id).join(', ')}
`);
process.exit(cmd === 'help' ? 0 : 1);
