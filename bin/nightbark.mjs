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
import { adoSink } from '../src/sinks/ado.mjs';
import { describePublish, publishFailed } from '../src/sinks/sink.mjs';
import { diagnose, describeDiagnosis } from '../src/sinks/diagnose.mjs';
import { readFailures, triage } from '../src/triage/index.mjs';
import { banner, fullLogo, colourEnabled, brandEscape } from '../src/ui/banner.mjs';
import { createUi } from '../src/ui/steps.mjs';
import { triageBrief } from '../src/triage/brief.mjs';
import { readFileSync } from 'node:fs';
import { selftest } from '../src/selftest.mjs';
import { selfcheck } from '../src/selfcheck.mjs';
import { gates } from '../src/gates/index.mjs';

const [cmd = 'help', ...rest] = process.argv.slice(2);
// top-level await is available (ESM); sink:ado is the only async command.

/**
 * ⚠️ BOTH `--name value` AND `--name=value`, and an UNKNOWN flag is REFUSED.
 *
 * The first version read only the space-separated form and ignored everything else in silence. That
 * is not a cosmetic gap, and it is the exact failure this project exists to find:
 *
 *   --fail-on=never   was ignored, so the exit policy silently fell back to `error` and a run meant
 *                     to be advisory started breaking builds. The opposite is worse: --fail-on=note
 *                     ignored means a stricter intent silently relaxed, and NOTHING SAYS SO.
 *   --sarif=out.json  wrote no file, and reported success.
 *   --gate=fixed-wait audited every gate instead of one.
 *
 * Found by using the tool on four real repositories and believing four scoped audits were scoped.
 * If it misleads the author inside ten minutes it will mislead anyone, so an unrecognised flag now
 * exits non-zero rather than being dropped — a tool whose whole thesis is "a silent default is the
 * dangerous one" cannot ship a silent default in its own argument parser.
 */
const KNOWN = {
    audit: ['gate', 'sarif', 'fail-on'],
    init: ['base-url', 'force'],
    brief: ['out'],
    challenge: ['out'],
    verdict: ['answers', 'verdicts', 'sarif'],
    'sink:ado': ['org', 'project', 'plan', 'case', 'suites', 'outcome', 'arm', 'diagnose'],
    triage: ['out', 'json', 'branch', 'commit', 'runner'],
    selftest: [], selfcheck: [], help: [], logo: [],
};

const flag = (name) => {
    const i = rest.indexOf(`--${name}`);
    if (i !== -1) return rest[i + 1] ?? '';
    const eq = rest.find((a) => a.startsWith(`--${name}=`));
    return eq === undefined ? null : eq.slice(name.length + 3);
};
const bool = (name) => rest.includes(`--${name}`) || rest.includes(`--${name}=true`);

{
    const allowed = KNOWN[cmd];
    if (allowed) {
        const given = rest.filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')[0]);
        const unknown = [...new Set(given.filter((g) => !allowed.includes(g)))];
        if (unknown.length) {
            console.log(`\n  unknown flag(s) for "${cmd}": ${unknown.map((u) => `--${u}`).join(', ')}`);
            console.log(`  ${allowed.length ? `this command takes: ${allowed.map((a) => `--${a}`).join(', ')}` : 'this command takes no flags'}`);
            console.log('\n  \u26a0\ufe0f  Refusing rather than ignoring it. A dropped --fail-on or --gate changes what the');
            console.log('      command does while still reporting success, which is the one outcome this tool exists');
            console.log('      to prevent.\n');
            process.exit(2);
        }
    }
}

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

if (cmd === 'sink:ado') {
    // ⚠️ A FENCE CHECK FIRST, publishing second. The failure this exists for is a scope that has
    // gone stale: the plan is reorganised, the scoped ids no longer match any test point, and the
    // publish reports every case as a tick while writing nothing. That is invisible in the output
    // of a normal run, so it gets its own command - and it is READ-ONLY unless --arm is passed.
    const org = flag('org') ?? process.env.ADO_ORG;
    const project = flag('project') ?? process.env.ADO_PROJECT;
    const plan = flag('plan');
    const cases = (flag('case') ?? '').split(',').filter(Boolean);
    const suites = (flag('suites') ?? '').split(',').filter(Boolean);
    const pat = process.env.AZURE_TOKEN;
    const armed = bool('arm');
    const outcome = flag('outcome') ?? 'passed';

    const diagnosing = bool('diagnose');

    if (!org || !project || (!diagnosing && (!plan || !cases.length))) {
        console.log(`
  usage: nightbark sink:ado --org <o> --project <p> --plan <id> --case <id[,id]> [--suites a,b]
                            [--outcome passed|failed|blocked] [--arm]
         nightbark sink:ado --org <o> --project <p> [--plan <id>] [--suites a,b] [--case id] --diagnose

  Read-only without --arm: it resolves each case to its test point(s) and tells you whether the
  scope actually matches anything. AZURE_TOKEN must be set (needs Test Management read & write).

  --diagnose walks the chain ONE HOP AT A TIME - credential, organisation, project, plan, suites,
  the suite FENCE, then the points - and names the rung that broke plus what fixes it. Reach for it
  when the plain form fails, because the same status code means different things at different
  depths: a 404 on the organisation is a typo, a 404 on the plan is usually permissions wearing a
  404. Start it with just --org and --project; add --plan, --suites and --case to climb higher.

  \u26a0\ufe0f  Run this BEFORE trusting any scoped publish. A stale scope writes nothing and reports
      success, so "it ran green" is not evidence that anything was recorded.
`);
        process.exit(1);
    }

    if (diagnosing) {
        // No try/catch: the ladder is built never to throw on a bad response - it needs the status
        // number, not an exception. A throw here would be a bug in the ladder and should surface.
        const result = await diagnose({
            org, project, pat, planId: plan, suiteIds: suites, caseIds: cases,
        });
        console.log(`\n  ado-test-plans - diagnosing ${org}/${project}${plan ? ` plan ${plan}` : ''}\n`);
        console.log('  ' + describeDiagnosis(result).split('\n').join('\n  ') + '\n');
        process.exit(result.ok ? 0 : 1);
    }

    try {
        const sink = adoSink({ org, project, pat });
        const report = await sink.publish(
            cases.map((caseId) => ({ ref: { caseId, planId: plan, suiteIds: suites }, outcome, comment: 'nightbark' })),
            { armed },
        );
        console.log(`\n  ${sink.id} — plan ${plan}${suites.length ? ` scoped to suites ${suites.join(',')}` : ' (all suites)'}\n`);
        console.log('  ' + describePublish(report).split('\n').join('\n  ') + '\n');
        process.exit(publishFailed(report) ? 1 : 0);
    } catch (err) {
        console.log(`\n  ${err.message}\n`);
        process.exit(1);
    }
}

if (cmd === 'logo') {
    // Unconditional: the size gate belongs to the automatic banner, not to someone who typed `logo`.
    const colour = colourEnabled();
    console.log(fullLogo({ colour, brand: brandEscape() }));
    process.exit(0);
}

if (cmd === 'triage') {
    // ⛔ DETERMINISTIC HALF ONLY. Normalise, anchor, hash, cluster - steps 1-4 - then hand the
    // judgement out as a brief. Per ADR-0004 deduplication is NOT an agent's job: a model asked
    // twice whether two errors match may answer differently, and a dedup that is not reproducible
    // merges distinct bugs at random. Nothing is created, closed or merged here; that is a human.
    const src = rest.find((a) => !a.startsWith('--') && a !== 'triage');
    if (!src) {
        console.log(`
  usage: nightbark triage <report.json|log|dir> [--out brief.md] [--json out.json]
                          [--branch x] [--commit sha] [--runner os]

  Reads a Playwright JSON report, a JSON array of failures, a raw log, or a directory of them.
  Fingerprints each failure deterministically (same failure -> same 16-hex id, every run), groups
  exact duplicates, and LINKS near-duplicates with a score and the dimensions that matched.

  --out writes the brief for the judgement half (severity, category, root cause, ticket prose),
  which any agent can answer. Nothing is filed: a wrong merge hides a live bug behind a closed
  ticket, so creating and merging stay with a person.
`);
        process.exit(1);
    }

    let failures;
    try {
        failures = readFailures(src);
    } catch (err) {
        // ⚠️ Loudly. "0 failures" and "I could not read your report" must never look the same.
        console.log(`\n  ${err.message}\n`);
        process.exit(1);
    }

    const result = triage(failures);
    const context = Object.fromEntries(
        [['branch', flag('branch')], ['commit', flag('commit')], ['runner', flag('runner')]].filter(([, v]) => v),
    );

    console.log(`\n  nightbark triage — ${src}`);
    console.log(`  ${result.total} failure(s) · ${result.groups.length} distinct fingerprint(s)`
        + `${result.links.length ? ` · ${result.links.length} near-duplicate link(s)` : ''}`
        + `${result.unanchored.length ? ` · \u26a0\ufe0f ${result.unanchored.length} unanchored` : ''}\n`);

    for (const g of result.groups) {
        const flaky = g.retried ? `  \u26a0\ufe0f flaky ${g.flakyCount}/${g.count}` : '';
        console.log(`  ${g.fingerprint}  x${String(g.count).padEnd(3)} ${g.anchors.exceptionType ?? '(no type)'}${flaky}`);
        console.log(`      ${(g.anchors.messageTemplate ?? '(no message)').slice(0, 96)}`);
        if (g.anchors.frames?.length) console.log(`      ${g.anchors.frames.join(' -> ')}`);
        for (const m of g.members.slice(0, 3)) console.log(`      · ${m.testName ?? '(unnamed)'}`);
        if (g.members.length > 3) console.log(`      · …and ${g.members.length - 3} more`);
    }

    if (result.links.length) {
        console.log(`\n  near-duplicates — SUGGESTIONS, not merges:`);
        for (const l of result.links) {
            const why = Object.entries(l.parts).filter(([, v]) => v > 0).map(([k]) => k).join(', ');
            console.log(`      ${l.a} ~ ${l.b}  score ${l.score} (${l.verdict})  matched: ${why}`);
        }
    }

    if (result.unanchored.length) {
        console.log(`\n  \u26a0\ufe0f ${result.unanchored.length} failure(s) yielded no stable anchor, so they carry NO fingerprint`);
        console.log(`      and are deliberately NOT clustered — pooling them would make one large false group.`);
    }

    const outPath = flag('out');
    if (outPath) {
        writeFileSync(outPath, triageBrief(result, { target: src, context }));
        console.log(`\n  brief written: ${outPath}  (${result.groups.length} group(s) to judge)`);
    }
    const jsonPath = flag('json');
    if (jsonPath) {
        writeFileSync(jsonPath, JSON.stringify({
            total: result.total,
            groups: result.groups.map((g) => ({
                fingerprint: g.fingerprint, count: g.count, flakyRate: g.flakyRate,
                anchors: g.anchors, tests: g.members.map((m) => m.testName),
            })),
            links: result.links,
            unanchored: result.unanchored.length,
        }, null, 2));
        console.log(`  json written:  ${jsonPath}`);
    }
    console.log('');
    process.exit(0);
}

if (cmd === 'init') {
    const dir = rest.find((a) => !a.startsWith('--') && a !== 'init');
    if (!dir) { console.log('\n  usage: nightbark init <dir> [--base-url http://localhost:3000] [--force]\n'); process.exit(1); }

    // ⛔ A CONFIRMATION SURFACE, NOT A CONFIGURATION ONE. ADR-0006 refusal 1 is "one layout, no
    // --with-x", and this does not ask what to build — it shows what is about to be written,
    // including the deliberately broken test, and asks only whether to go ahead. Showing the
    // planted fault BEFORE it lands is strictly better than surprising someone with it afterwards.
    //
    // ⚠️ And it is TTY-gated. On a pipe or in CI there is no banner and no prompt, so the command
    // stays scriptable — a prompt that blocks forever in CI is the worst of both worlds.
    const interactive = Boolean(process.stdout.isTTY);
    const ui = createUi();

    if (interactive) {
        process.stdout.write(banner());
        ui.intro('nightbark');
        ui.step('Target', resolve(dir));
        ui.box('What will be written, and why each piece is load-bearing', [
            'playwright.config.ts        workers 4 · fullyParallel · retries 0',
            'tests/fixtures/pool.ts      a per-worker allocator + a teardown STUB',
            'tests/fixtures/index.ts     the fixture that hands one identity per worker',
            'tests/example.spec.ts       one honest passing test',
            'tests/vacuous.spec.ts       \u26a0\ufe0f  DELIBERATELY broken \u2014 the audit finds it',
            '.github/workflows/ci.yml    generated from ci/pipeline.mjs',
            'azure-pipelines.yml         the SAME definition, second platform',
            'package.json · tsconfig.json · .gitignore · README.md',
        ]);
        ui.note('Two of those need your attention afterwards: release() is a stub, and\n'
            + 'tests/vacuous.spec.ts is broken on purpose. The README says why.');
        if (!(await ui.confirm('Scaffold it?'))) {
            ui.outro('Nothing written.');
            process.exit(0);
        }
    }

    try {
        // ⚠️ `baseURL`, capital URL — the option init actually takes. Spelled `baseUrl` it is
        // silently ignored and --base-url does nothing, which is the quietest kind of broken flag.
        const { files: written, name } = init(dir, { baseURL: flag('base-url') ?? 'http://localhost:3000', force: bool('force') });
        if (interactive) {
            ui.step(`Scaffolded ${name} — ${written.length} file(s)`, written.join('\n'));
            ui.box('Next', [
                `cd ${dir}`,
                'npm install && npx playwright install chromium',
                'npm test          # the vacuous test PASSES \u2014 that is the point',
                'npm run audit     # nightbark flags it',
            ]);
            ui.outro('Done!  Fix the planted fault, watch the finding disappear, then delete it.');
        } else {
            console.log(`\n  scaffolded ${name} -> ${dir} \u2014 ${written.length} file(s)\n`);
            for (const f of written) console.log(`      ${f}`);
            console.log('\n  Next:');
            console.log(`      cd ${dir}`);
            console.log('      npm install && npx playwright install chromium');
            console.log('      npm test            # one test PASSES while proving nothing');
            console.log('      npm run audit       # nightbark flags tests/vacuous.spec.ts\n');
            console.log('  \u26a0\ufe0f  release() in tests/fixtures/pool.ts is a STUB, and tests/vacuous.spec.ts is');
            console.log('      deliberately broken. The generated README explains both.\n');
        }
    } catch (err) {
        console.log(`\n  ${err.message}\n`);
        process.exit(1);
    }
    process.exit(0);
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
    nightbark sink:ado ...        check an ADO Test Plan scope resolves (read-only unless --arm)
    nightbark sink:ado --diagnose walk the ADO chain one hop at a time; name the rung that broke
    nightbark triage <report>     fingerprint + cluster CI failures; brief the judgement half
    nightbark logo                print the full logo (109 cols wide)

  ${gates.length} gate(s) registered: ${gates.map((g) => g.id).join(', ')}
`);
process.exit(cmd === 'help' ? 0 : 1);
