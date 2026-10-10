/**
 * Steps 5-6 as a BRIEF — the judgement half, handed out rather than guessed at.
 *
 * Per ADR-0005 the deterministic half runs locally and the judging happens elsewhere, in whatever
 * agent or harness the reader already has. The brief is a plain markdown artefact: no API key, no
 * vendor, and reviewable before anyone acts on it.
 *
 * ⛔ WHAT THIS DELIBERATELY DOES NOT DO: create, close or merge anything. Step 7 is human approval,
 * and false deduplication costs more than manual triage — a wrongly merged ticket hides a live bug
 * behind one somebody already closed. So the brief asks for a RECOMMENDATION and says so.
 */

const CATEGORIES = ['application bug', 'test bug', 'environment issue', 'flaky test', 'build failure'];

export function triageBrief({ groups, links, unanchored, total }, { target = '(unknown)', context = {} } = {}) {
    const lines = [];
    lines.push('# nightbark — triage brief');
    lines.push('');
    lines.push(`**Source:** \`${target}\``);
    lines.push(`**Failures:** ${total} → **${groups.length} distinct fingerprint(s)**`
        + `${links.length ? `, ${links.length} near-duplicate link(s)` : ''}`
        + `${unanchored.length ? `, ⚠️ ${unanchored.length} unanchored` : ''}`);
    if (Object.keys(context).length) {
        lines.push(`**CI context:** ${Object.entries(context).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
    }
    lines.push('');
    lines.push('## What you are being asked');
    lines.push('');
    lines.push('Fingerprinting and clustering are already done, deterministically — do NOT re-do them, and do');
    lines.push('not judge whether two fingerprints are "the same bug" by reading them. That work is a hash, and');
    lines.push('a hash is reproducible where an opinion is not.');
    lines.push('');
    lines.push('For each group below, answer only what needs understanding:');
    lines.push('');
    lines.push(`1. **Failure category** — ${CATEGORIES.join(' | ')}`);
    lines.push('2. **Severity** — critical | major | minor | trivial');
    lines.push('3. **Component** — inferred from the frames and file paths');
    lines.push('4. **Suspected root cause** — one or two sentences, a hypothesis, labelled as one');
    lines.push('5. **Confidence** — high | medium | low. ⚠️ If low, say what you would need to see.');
    lines.push('6. **Recommendation** — create | merge-into <fingerprint> | quarantine | retry-and-monitor | dismiss');
    lines.push('');
    lines.push('## Rules');
    lines.push('');
    lines.push('1. ⚠️ **Severity is impact, not annoyance.** If everything is critical, nothing is. A cosmetic');
    lines.push('   defect is trivial even when it is irritating.');
    lines.push('2. **An environment issue is not an application bug.** A runner that ran out of memory, a');
    lines.push('   service that was down, a DNS failure — those need different remediation and a different');
    lines.push('   owner. Mislabelling them as app bugs is how a backlog becomes untrustworthy.');
    lines.push('3. **`flakyRate` below is measured, not inferred.** A group that both failed and passed on');
    lines.push('   retry is mechanically flaky; say so rather than hypothesising about timing.');
    lines.push('4. ⛔ **Recommend, do not decide.** Nothing here is created, closed or merged automatically.');
    lines.push('   A wrong merge hides a live bug behind a closed ticket, so merges need a human.');
    lines.push('5. Judge only what you are shown. Prefer low confidence over a confident guess.');
    lines.push('');
    lines.push('## How to answer');
    lines.push('');
    lines.push('Return **only** this JSON, one entry per group, using the `fingerprint` verbatim:');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify([{
        fingerprint: '<copied exactly>',
        category: 'application bug',
        severity: 'major',
        component: '<module>',
        root_cause: '<one or two sentences>',
        confidence: 'high',
        recommendation: 'create',
        title: '<under 80 chars, includes the component>',
        description: '<plain language, no raw logs>',
        steps_to_reproduce: ['<derived from the test name and context>'],
    }], null, 2));
    lines.push('```');
    lines.push('');
    lines.push('⚠️ Never invent a fingerprint. Only the ones listed below exist.');
    lines.push('');
    lines.push('---');
    lines.push('');

    groups.forEach((g, i) => {
        lines.push(`## Group ${i + 1} — \`${g.fingerprint}\``);
        lines.push('');
        lines.push(`- **occurrences:** ${g.count}`);
        if (g.retried) lines.push(`- **flaky rate:** ${g.flakyCount}/${g.count} passed on retry (\`flakyRate\` ${g.flakyRate}) — mechanically flaky`);
        lines.push(`- **exception:** ${g.anchors.exceptionType ?? '(none extracted)'}`);
        lines.push(`- **message template:** \`${g.anchors.messageTemplate ?? '(none)'}\``);
        if (g.anchors.frames?.length) lines.push(`- **top frames:** ${g.anchors.frames.join(' → ')}`);
        if (g.anchors.urlPattern) lines.push(`- **request:** ${g.anchors.urlPattern}`);
        if (g.anchors.statusCode) lines.push(`- **status:** ${g.anchors.statusCode}`);
        lines.push('');
        lines.push('**Tests affected:**');
        lines.push('');
        for (const m of g.members.slice(0, 8)) {
            lines.push(`- ${m.testName ?? '(unnamed)'}${m.file ? ` — \`${m.file}\`` : ''}${m.isFlaky ? ' ⚠️ passed on retry' : ''}`);
        }
        if (g.members.length > 8) lines.push(`- …and ${g.members.length - 8} more`);
        lines.push('');
        // ⚠️ The NORMALISED error, not the raw log. Pasting 500 lines of CI output into a ticket is
        // how tickets stop being read; the five lines that matter are the deliverable.
        lines.push('**Normalised error** (noise already stripped):');
        lines.push('');
        lines.push('```');
        lines.push(g.members[0].normalised.slice(0, 600));
        lines.push('```');
        lines.push('');

        const related = links.filter((l) => l.a === g.fingerprint || l.b === g.fingerprint);
        if (related.length) {
            lines.push('⚠️ **Near-duplicates — a human decides whether these merge:**');
            lines.push('');
            for (const l of related) {
                const other = l.a === g.fingerprint ? l.b : l.a;
                const why = Object.entries(l.parts).filter(([, v]) => v > 0).map(([k]) => k).join(', ');
                lines.push(`- \`${other}\` — score **${l.score}** (${l.verdict}); matched on: ${why || 'nothing'}`);
            }
            lines.push('');
        }
        lines.push('---');
        lines.push('');
    });

    if (unanchored.length) {
        lines.push('## ⚠️ Unanchored failures');
        lines.push('');
        lines.push(`${unanchored.length} failure(s) yielded no stable anchor, so they have NO fingerprint and are`);
        lines.push('deliberately not clustered — pooling them would create one large false group whose dedup rate');
        lines.push('looks excellent and means nothing. They need a human read, or a better extractor.');
        lines.push('');
        for (const u of unanchored.slice(0, 10)) {
            lines.push(`- ${u.testName ?? '(unnamed)'} — \`${(u.normalised || '(empty)').slice(0, 120)}\``);
        }
        lines.push('');
    }
    return lines.join('\n');
}
