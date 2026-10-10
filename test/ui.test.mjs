import { test } from 'node:test';
import assert from 'node:assert/strict';
import { banner, brandEscape, colourEnabled, BRAND, WORDMARK_WIDTH, DOG, DOG_WIDTH, LOCKUP_WIDTH } from '../src/ui/banner.mjs';
import { createUi, visibleWidth } from '../src/ui/steps.mjs';

/** A fake stream, so terminal behaviour can be asserted without a terminal. */
const fake = ({ isTTY = true, columns = 100 } = {}) => {
    const out = [];
    return { isTTY, columns, write: (s) => out.push(s), lines: () => out.join('').split('\n') };
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

test('the dog renders at the wordmark\'s scale, from a pixel grid', () => {
    // Six terminal rows of whole blocks is too coarse for a recognisable dog — the first four
    // attempts were blobs. Half-blocks give 16 vertical pixels in 8 rows, which is just enough for
    // an ear, a skull and an OPEN jaw. The open jaw matters: earlier passes drew it closed, and a
    // closed-mouth dog is a poor logo for something called nightbark.
    assert.equal(DOG.length, 8, 'eight terminal rows');
    assert.equal(DOG_WIDTH, 20);
    assert.equal(LOCKUP_WIDTH, DOG_WIDTH + 2 + WORDMARK_WIDTH);
    for (const row of DOG) assert.ok(row.length <= DOG_WIDTH);
    // The mouth is a GAP: a row with ink, then space, then ink again.
    assert.ok(DOG.some((r) => /[█▀▄]\s+[█▀▄]/.test(r)), 'no open jaw — the mouth closed up');
});

test('the lockup appears ONLY when it fits, and the word is centred against the dog', () => {
    const wide = banner({ stream: fake({ columns: 110 }), env: { NO_COLOR: '1' }, force: true });
    const narrow = banner({ stream: fake({ columns: 80 }), env: { NO_COLOR: '1' }, force: true });
    assert.ok(wide.includes(DOG[0].trimEnd()), 'the dog is present at 110 columns');
    assert.ok(!narrow.includes(DOG[2].trimEnd()), 'and absent at 80, where the lockup would wrap');
    assert.ok(narrow.includes('███╗'), 'the wordmark alone still renders at 80');
    for (const line of wide.split('\n')) assert.ok(visibleWidth(line) <= 110);
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
