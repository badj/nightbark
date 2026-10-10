import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banner, brandEscape, colourEnabled, BRAND, WORDMARK_WIDTH } from '../src/ui/banner.mjs';
import { createUi, visibleWidth } from '../src/ui/steps.mjs';

/** A fake stream, so terminal behaviour can be asserted without a terminal. */
const fake = ({ isTTY = true, columns = 100, rows = 24 } = {}) => {
    const out = [];
    return { isTTY, columns, rows, write: (s) => out.push(s), lines: () => out.join('').split('\n') };
};

// ── the wordmark ───────────────────────────────────────────────────────────────────────────────

test('every row of the wordmark is the SAME width — a ragged row is a broken glyph', () => {
    // ⚠️ 80 columns pins this to the wordmark-ONLY tier. At 100 the lockup renders and the dog's
    // eight rows join the six, which is what this assertion caught when the dog was added.
    const lines = banner({ stream: fake({ columns: 80 }), env: { NO_COLOR: '1' }, force: true }).split('\n').filter((l) => l.includes('█') || l.includes('╚'));
    assert.equal(lines.length, 6, 'ANSI Shadow is six rows');
    const widths = new Set(lines.map((l) => l.trimStart().length));
    assert.equal(widths.size, 1, `rows differ in width: ${[...widths].join(',')} — a glyph is malformed`);
    assert.equal([...widths][0], WORDMARK_WIDTH);
});

test('⛔ nothing is printed when output is NOT a terminal', () => {
    // A banner in a CI log or a piped file is noise in somebody's grep.
    assert.equal(banner({ stream: fake({ isTTY: false }) }), '');
});



test('⚠️ a narrow terminal gets a SMALLER form, never a wrapped one', () => {
    // 71 columns of art does not clip on a narrow terminal — it WRAPS, and six wrapped rows are
    // rubble rather than a logo. So the width decides which of three forms is used.
    const wide = banner({ stream: fake({ columns: 100 }), env: { NO_COLOR: '1' }, force: true });
    const mid = banner({ stream: fake({ columns: 40 }), env: { NO_COLOR: '1' }, force: true });
    const tiny = banner({ stream: fake({ columns: 12 }), env: { NO_COLOR: '1' }, force: true });

    assert.ok(wide.includes('███'), 'the full wordmark');
    assert.ok(!mid.includes('███'), 'the compact form instead');
    assert.ok(tiny.includes('nightbark'), 'and finally just the name');

    for (const [label, out, cols] of [['wide', wide, 100], ['mid', mid, 40], ['tiny', tiny, 12]]) {
        for (const line of out.split('\n')) {
            assert.ok(visibleWidth(line) <= cols, `${label}: a line of ${visibleWidth(line)} would wrap at ${cols}`);
        }
    }
});

// ── the brand colour ───────────────────────────────────────────────────────────────────────────

test(`the brand colour is #${BRAND.hex}, emitted as 24-bit when the terminal says so`, () => {
    assert.deepEqual(BRAND.rgb, [166, 39, 245], 'A6=166, 27=39, F5=245');
    assert.equal(brandEscape({ env: { COLORTERM: 'truecolor' } }), '\x1b[38;2;166;39;245m');
    assert.equal(brandEscape({ env: { COLORTERM: '24bit' } }), '\x1b[38;2;166;39;245m');
});

test('⚠️ it DEGRADES rather than printing escape garbage across the logo', () => {
    // A 24-bit escape on a terminal that does not understand it is not ignored — it is printed.
    assert.equal(brandEscape({ env: { TERM: 'xterm-256color' } }), `\x1b[38;5;${BRAND.xterm256}m`);
    assert.equal(brandEscape({ env: {} }), '\x1b[1;35m', 'basic magenta is universal');
});

test('NO_COLOR and FORCE_COLOR are honoured — the conventions that already exist', () => {
    // Inventing a --colour flag would be a configuration surface (ADR-0006) AND would ignore the
    // variable every other tool on the machine respects.
    assert.equal(colourEnabled({ env: { NO_COLOR: '1' }, stream: fake() }), false);
    assert.equal(colourEnabled({ env: { NO_COLOR: '' }, stream: fake() }), true, 'empty NO_COLOR is not set');
    assert.equal(colourEnabled({ env: { TERM: 'dumb' }, stream: fake() }), false);
    assert.equal(colourEnabled({ env: { FORCE_COLOR: '1' }, stream: fake({ isTTY: false }) }), true);
    assert.equal(colourEnabled({ env: {}, stream: fake({ isTTY: false }) }), false);
    assert.ok(!banner({ stream: fake({ columns: 80 }), env: { NO_COLOR: '1' }, force: true }).includes('\x1b['), 'no escapes at all');
});

// ── the stepped box ────────────────────────────────────────────────────────────────────────────

const boxRows = (title, lines, columns = 92) => {
    const s = fake({ columns });
    createUi({ stream: s, env: { NO_COLOR: '1' }, colour: false }).box(title, lines);
    return s.lines().filter((l) => l.startsWith('│') && visibleWidth(l) > 1);
};

test('box edges line up — including on rows containing emoji', () => {
    // ⚠️ `⚠️` is TWO codepoints: U+26A0 plus U+FE0F, the invisible variation selector. Counting the
    // selector as one column pushed the right edge out by one on exactly the lines that used it,
    // which is how a hand-drawn box ends up ragged only where it matters.
    for (const [name, title, lines] of [
        ['plain', 't', ['short', 'a bit longer than short']],
        ['emoji', 't', ['short', 'with ⚠️  an emoji', 'and a ⛔ one too']],
        ['long title', 'a much longer title than the content', ['x']],
    ]) {
        const widths = new Set(boxRows(title, lines).map(visibleWidth));
        assert.equal(widths.size, 1, `${name}: ragged edges ${[...widths].join(',')}`);
    }
});

test('visibleWidth counts what the eye sees, not what the string holds', () => {
    assert.equal(visibleWidth('abc'), 3);
    assert.equal(visibleWidth('\x1b[32mabc\x1b[0m'), 3, 'escapes are invisible');
    assert.equal(visibleWidth('⚠️'), 2, 'one glyph, two columns, two codepoints');
    assert.equal(visibleWidth('⛔'), 2);
    assert.equal(visibleWidth(''), 0);
});

test('the box never exceeds the terminal width', () => {
    for (const cols of [40, 60, 92, 200]) {
        const rows = boxRows('t', ['x'.repeat(300)], cols);
        for (const r of rows) assert.ok(visibleWidth(r) <= Math.max(44, cols), `${visibleWidth(r)} > ${cols}`);
    }
});

// ── the prompt ─────────────────────────────────────────────────────────────────────────────────

test('⛔ confirm() returns true WITHOUT prompting when there is no terminal', async () => {
    // A prompt that blocks forever in CI is the worst of both worlds, so the interactive path is
    // gated on a TTY at both ends — output and input.
    const s = fake({ isTTY: false });
    const ui = createUi({ stream: s, env: {}, colour: false });
    assert.equal(await ui.confirm('go?'), true);
    assert.equal(s.lines().join(''), '', 'and it asks nothing');

    const s2 = fake({ isTTY: true });
    const ui2 = createUi({ stream: s2, env: {}, colour: false });
    assert.equal(await ui2.confirm('go?', { input: { isTTY: false } }), true, 'a piped stdin counts as non-interactive');
});

test('the full step sequence renders the gutter shape', () => {
    const s = fake();
    const ui = createUi({ stream: s, env: { NO_COLOR: '1' }, colour: false });
    ui.intro('nightbark');
    ui.step('Target', '/tmp/x');
    ui.note('a caveat');
    ui.outro('Done!');
    const out = s.lines();
    assert.ok(out.some((l) => l.startsWith('┌')), 'opens');
    assert.ok(out.some((l) => l.startsWith('◇')), 'steps');
    assert.ok(out.some((l) => l.startsWith('●')), 'notes');
    assert.ok(out.some((l) => l.startsWith('└')), 'closes');
    assert.ok(out.includes('│  /tmp/x'), 'values sit on the gutter');
});

// ── the full logo ──────────────────────────────────────────────────────────────────────────────

import { fullLogo } from '../src/ui/banner.mjs';
import { LOGO_ART, LOGO_WIDTH, LOGO_HEIGHT } from '../src/ui/logo.mjs';

test('the full logo puts the art FIRST and the wordmark beneath it', () => {
    // The arrangement was chosen by eye from two candidates; this pins it so a later refactor
    // cannot quietly flip them.
    const out = fullLogo({ colour: false }).split('\n');
    const artAt = out.findIndex((l) => l.includes(LOGO_ART[0].trim().slice(0, 20)));
    const wordAt = out.findIndex((l) => l.includes('███╗   ██╗'));
    assert.ok(artAt >= 0, 'the art is present');
    assert.ok(wordAt > artAt, 'and the wordmark comes AFTER it');
    assert.ok(out.some((l) => l.includes('finds the tests that did not bark')));
});

test('⛔ the only fallback is the WORDMARK — never a different dog', () => {
    // 67 rows is three screens on a default terminal. A banner that scrolls the thing you wanted to
    // read off the top is worse than a smaller one, so width alone is not enough.
    // ⛔ THE FALLBACK IS THE WORDMARK, NOT A DIFFERENT DOG. A second, smaller dog used to live here
    // and it meant a 101-column terminal showed one animal while a 111-column one showed another.
    const wide = banner({ stream: fake({ columns: 120, rows: 24 }), env: { NO_COLOR: '1' }, force: true });
    const narrow = banner({ stream: fake({ columns: 100, rows: 90 }), env: { NO_COLOR: '1' }, force: true });

    assert.ok(wide.includes(LOGO_ART[5]), 'the art shows on any terminal wide enough, short or not');
    assert.ok(!narrow.includes(LOGO_ART[5]), 'and never when it would wrap');
    assert.ok(narrow.includes('███╗'), 'the wordmark alone is the fallback');
    assert.ok(!/[↓↙↖←]/.test(narrow), 'no partial art leaks into the narrow tier');
});

test('`logo` prints unconditionally — the gate belongs to the automatic banner, not to asking', () => {
    const out = fullLogo({ colour: false });
    assert.equal(out.split('\n').filter((l) => l.trim()).length, LOGO_HEIGHT + 6 + 1, 'art + wordmark + tagline');
    assert.ok(!out.includes('\x1b['), 'colour: false means no escapes');
});

test('the stored art is intact — 67 rows, no row wider than it claims', () => {
    assert.equal(LOGO_HEIGHT, 67);
    assert.equal(LOGO_WIDTH, 109);
    for (const row of LOGO_ART) assert.ok(row.length <= LOGO_WIDTH, `a row is ${row.length} wide`);
    assert.ok(LOGO_ART[0].trim().length > 0 && LOGO_ART[LOGO_HEIGHT - 1].trim().length > 0, 'no blank edges');
});

test('⛔ the three colours never bleed into each other', () => {
    // Originally this asserted the art stayed PLAIN — true when the name was the only branded thing.
    // The art now has its own colour, so the property worth pinning changed: each region carries its
    // OWN escape and no other.
    const env = { COLORTERM: 'truecolor' };
    const b = escapeFor(BRAND, { env });
    const a = escapeFor(ART, { env });
    const out = fullLogo({ colour: true, brand: b, art: a, tag: escapeFor(TAG, { env }) }).split('\n');
    for (const l of out.filter((x) => x.includes(b))) assert.ok(!l.includes(a), 'a wordmark row carries the art colour');
    for (const l of out.filter((x) => x.includes(a))) assert.ok(!l.includes(b), 'an art row carries the name colour');
});

test('⚠️ truecolour is detected beyond COLORTERM, which is routinely unset', () => {
    // It was unset on the author's own machine, so the brand silently degraded to xterm 129
    // (#af00ff) — near enough to look right, wrong enough not to be the brand.
    const exact = `\x1b[38;2;${BRAND.rgb.join(';')}m`;
    assert.equal(brandEscape({ env: { FORCE_COLOR: '3' } }), exact, 'the established 16m convention');
    assert.equal(brandEscape({ env: { TERM_PROGRAM: 'iTerm.app' } }), exact);
    assert.equal(brandEscape({ env: { TERM_PROGRAM: 'vscode' } }), exact);
    // ⛔ Apple Terminal genuinely has no 24-bit support; claiming it does makes the logo worse.
    assert.equal(brandEscape({ env: { TERM_PROGRAM: 'Apple_Terminal', TERM: 'xterm-256color' } }), `\x1b[38;5;${BRAND.xterm256}m`);
});

// ── the three brand colours ────────────────────────────────────────────────────────────────────

import { ART, TAG, artEscape, tagEscape, escapeFor } from '../src/ui/banner.mjs';

test('three colours, three jobs — art, name, tagline', () => {
    const env = { COLORTERM: 'truecolor' };
    const out = fullLogo({
        colour: true,
        brand: escapeFor(BRAND, { env }), art: escapeFor(ART, { env }), tag: escapeFor(TAG, { env }),
    }).split('\n');
    const count = (spec) => out.filter((l) => l.includes(escapeFor(spec, { env }))).length;
    assert.equal(count(ART), LOGO_HEIGHT, 'every art row');
    assert.equal(count(BRAND), 6, 'the six wordmark rows');
    assert.equal(count(TAG), 1, 'the tagline');
    // and they are genuinely different escapes
    assert.equal(new Set([BRAND, ART, TAG].map((s) => escapeFor(s, { env }))).size, 3);
});

test('⚠️ every 256-colour fallback is COMPUTED against the xterm cube, not eyeballed', () => {
    // One of these shipped wrong for a few minutes: #F04A0A was written as 166 from memory when the
    // nearest is actually 202. Eyeballing an approximation is how a brand lands a shade out on every
    // machine that is not the author's, and nothing in the output says so.
    const L = [0, 95, 135, 175, 215, 255];
    const palette = [];
    for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) palette.push([16 + 36 * r + 6 * g + b, [L[r], L[g], L[b]]]);
    for (let i = 0; i < 24; i++) { const v = 8 + i * 10; palette.push([232 + i, [v, v, v]]); }
    const nearest = (t) => palette.reduce((best, [i, c]) => {
        const d = (c[0] - t[0]) ** 2 + (c[1] - t[1]) ** 2 + (c[2] - t[2]) ** 2;
        return d < best.d ? { i, d } : best;
    }, { d: Infinity }).i;

    for (const spec of [BRAND, ART, TAG]) {
        assert.equal(spec.xterm256, nearest(spec.rgb), `#${spec.hex} should fall back to ${nearest(spec.rgb)}, not ${spec.xterm256}`);
        assert.equal(spec.rgb.length, 3);
        assert.match(spec.hex, /^[0-9A-F]{6}$/);
    }
});

test('a colour degrades through all three depths', () => {
    for (const spec of [BRAND, ART, TAG]) {
        assert.equal(escapeFor(spec, { env: { COLORTERM: 'truecolor' } }), `\x1b[38;2;${spec.rgb.join(';')}m`);
        assert.equal(escapeFor(spec, { env: { TERM: 'xterm-256color' } }), `\x1b[38;5;${spec.xterm256}m`);
        assert.equal(escapeFor(spec, { env: {} }), spec.basic);
    }
    assert.equal(artEscape({ env: { COLORTERM: 'truecolor' } }), `\x1b[38;2;${ART.rgb.join(';')}m`);
    assert.equal(tagEscape({ env: { COLORTERM: 'truecolor' } }), `\x1b[38;2;${TAG.rgb.join(';')}m`);
});

test('a multi-line note continues on the GUTTER, not with a second bullet', () => {
    // Two ● markers read as two separate remarks, so one sentence wrapped across them looks like a
    // formatting accident — which is exactly how it looked on the first real run.
    const s = fake();
    createUi({ stream: s, env: { NO_COLOR: '1' }, colour: false }).note('first line\nsecond line');
    const lines = s.lines().filter((l) => l.trim());
    assert.equal(lines.filter((l) => l.startsWith('●')).length, 1, 'exactly one bullet');
    assert.ok(lines.some((l) => l === '│  second line'), 'the continuation sits on the gutter');
});
