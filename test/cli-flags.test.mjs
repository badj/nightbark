import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The CLI's allow-list of flags (KNOWN) and the flags each command actually READS must agree.
 *
 * ⚠️ They did not. `verdict` read `--fail-on` and its help advertised it, but KNOWN.verdict omitted
 * it — so `nightbark verdict --fail-on never` was refused with exit 2 every time anyone tried. Found
 * 2026-10-21 by the spec-kit extension test, which executes the command lines the extension tells
 * an agent to run. It is the third instance here of "a feature on one of two code paths": a list
 * maintained by hand beside the code it describes. So this checks one against the other, from the
 * source, instead of trusting anyone to update both.
 */

const src = readFileSync(new URL('../bin/nightbark.mjs', import.meta.url), 'utf8');
const known = Object.fromEntries(
    [...src.match(/const KNOWN = \{([\s\S]*?)\n\};/)[1].matchAll(/'?([a-z:]+)'?:\s*\[([^\]]*)\]/g)]
        .map(([, cmd, list]) => [cmd, [...list.matchAll(/'([a-z-]+)'/g)].map((m) => m[1])]),
);

// Each command's body: from its `if (cmd === 'x')` to the next one.
const blocks = [...src.matchAll(/^if \(cmd === '([a-z:]+)'\)/gm)].map((m, i, all) => ({
    cmd: m[1], body: src.slice(m.index, all[i + 1]?.index ?? src.length),
}));

test('there are command blocks to check — a regex that matches nothing would pass vacuously', () => {
    assert.ok(blocks.length >= 8, `only ${blocks.length} command blocks found`);
});

for (const { cmd, body } of blocks) {
    test(`⛔ every flag "${cmd}" reads is one KNOWN allows`, () => {
        const read = [...new Set([...body.matchAll(/\b(?:flag|bool)\('([a-z-]+)'\)/g)].map((m) => m[1]))];
        const missing = read.filter((f) => !(known[cmd] ?? []).includes(f));
        assert.deepEqual(missing, [], `"${cmd}" reads ${missing.map((f) => `--${f}`).join(', ')} but KNOWN refuses it`);
    });
}
