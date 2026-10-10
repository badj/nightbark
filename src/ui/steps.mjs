import { createInterface } from 'node:readline';
import { brandEscape } from './banner.mjs';

/**
 * A stepped terminal UI — the gutter-and-diamond shape, implemented here rather than depended on.
 *
 * ⚠️ WHY NOT A LIBRARY. nightbark has ZERO dependencies, and that is load-bearing rather than
 * fussy: ADR-0005's whole argument is that it gathers locally with no vendor and no API key, which
 * is a weaker claim with a tree of transitive packages behind it. These glyphs are Unicode and the
 * prompt is `node:readline`; the entire renderer is shorter than the lockfile entry would be.
 *
 * ⛔ AND IT IS NOT A CONFIGURATION SURFACE. ADR-0006 refusal 1 says one layout, no `--with-x`. So
 * nothing here ASKS what to build — it shows what is about to be written, including the deliberately
 * broken test, and asks only whether to proceed. Confirming is not configuring, and showing the
 * planted fault up front means nobody is surprised by it later.
 */

const G = { top: '┌', bar: '│', step: '◇', dot: '●', end: '└', boxEnd: '├', corner: '╮', close: '╯', dash: '─' };
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

/** Visible width — box drawing and the wordmark are single-width, but emoji are not. */
export function visibleWidth(s) {
    const plain = s.replace(/\x1b\[[0-9;]*m/g, '');
    let w = 0;
    for (const ch of plain) {
        const c = ch.codePointAt(0);
        // ⚠️ ZERO-WIDTH codepoints must count as 0, and missing this is why a hand-drawn box goes
        // ragged on exactly the lines you care about. `⚠️` is TWO codepoints — U+26A0 plus U+FE0F,
        // the variation selector that asks for the emoji presentation — and the selector is
        // invisible. Counted as 1 it pushes every following column out by one, so the box edge
        // drifted by 2 on the two lines that used ⚠️ and nowhere else.
        if ((c >= 0xfe00 && c <= 0xfe0f) || c === 0x200d || (c >= 0x0300 && c <= 0x036f)) continue;
        // ⚠️ Emoji and CJK occupy two columns. Counting them as one is why hand-drawn boxes end up
        // ragged, and this codebase uses ⚠️ and ⛔ heavily enough for it to matter.
        w += (c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3)
            || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60)
            || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1f64f) || (c >= 0x1f900 && c <= 0x1f9ff)
            || c === 0x26a0 || c === 0x26d4)) ? 2 : 1;
    }
    return w;
}

export function createUi({ stream = process.stdout, env = process.env, colour = undefined } = {}) {
    const brand = brandEscape({ env });
    const paint = colour ?? ((env.NO_COLOR === undefined || env.NO_COLOR === '') && Boolean(stream.isTTY));
    const c = (code, s) => (paint ? `${code}${s}${RESET}` : s);
    const w = (s = '') => stream.write(`${s}\n`);

    return {
        // The product name carries the brand colour here too — it was plain, which made the one
        // place the name appears on EVERY run the one place it was not branded.
        intro(title) { w(''); w(`${c(DIM, G.top)}   ${paint ? brand + title + RESET : title} `); w(c(DIM, G.bar)); },

        /** One completed step, optionally with the value it produced on the gutter line below. */
        step(label, value) {
            w(`${c(GREEN, G.step)}  ${label}`);
            if (value !== undefined) for (const line of String(value).split('\n')) w(`${c(DIM, G.bar)}  ${line}`);
            w(c(DIM, G.bar));
        },

        /**
         * A caveat. Multi-line notes continue on the GUTTER rather than growing a second bullet —
         * two ● markers read as two separate remarks, so a single sentence wrapped across them
         * looks like a formatting accident, which is exactly how it looked on the first real run.
         */
        note(label) {
            const [first, ...rest] = String(label).split('\n');
            w(`${c(YELLOW, G.dot)}  ${first}`);
            for (const line of rest) w(`${c(DIM, G.bar)}  ${line}`);
            w(c(DIM, G.bar));
        },

        /**
         * The summary box. Width is driven by the CONTENT, clamped to the terminal — a fixed width
         * either wraps on a narrow terminal or leaves a stripe of whitespace on a wide one.
         */
        box(title, lines) {
            const avail = Math.max(40, Math.min((stream.columns ?? 80) - 4, 100));
            const inner = Math.min(avail, Math.max(visibleWidth(title) + 4, ...lines.map((l) => visibleWidth(l) + 4)));
            const rule = G.dash.repeat(Math.max(1, inner - visibleWidth(title) - 2));
            w(`${c(GREEN, G.step)}  ${title} ${c(DIM, rule + G.corner)}`);
            // ⚠️ TRUNCATE, then pad. Padding alone cannot fix a line that is already too long: the
            // first version clamped the box WIDTH but never the CONTENT, so a 300-character line
            // produced a 304-column row and the right edge left the screen entirely. Clamping one
            // of the two is worse than clamping neither, because the box looks deliberate.
            const clip = (s) => {
                if (visibleWidth(s) <= inner) return s;
                let acc = '';
                for (const ch of s) {
                    if (visibleWidth(acc + ch) > inner - 1) break;
                    acc += ch;
                }
                return acc + '…';
            };
            const pad = (s) => { const v = clip(s); return v + ' '.repeat(Math.max(0, inner - visibleWidth(v))); };
            w(`${c(DIM, G.bar)}  ${pad('')}${c(DIM, G.bar)}`);
            for (const l of lines) w(`${c(DIM, G.bar)}  ${pad(l)}${c(DIM, G.bar)}`);
            w(`${c(DIM, G.bar)}  ${pad('')}${c(DIM, G.bar)}`);
            w(c(DIM, G.boxEnd + G.dash.repeat(inner + 2) + G.close));
            w(c(DIM, G.bar));
        },

        outro(message) { w(`${c(DIM, G.end)}  ${message}`); w(''); },

        /**
         * Ask before doing. Resolves `true` on a non-TTY WITHOUT prompting, so piped and CI use stays
         * scriptable — a prompt that blocks forever in CI is the worst of both worlds.
         */
        async confirm(question, { input = process.stdin } = {}) {
            if (!stream.isTTY || !input.isTTY) return true;
            w(`${c(GREEN, G.step)}  ${question}`);
            const rl = createInterface({ input, output: stream });
            try {
                const answer = await new Promise((resolve) => rl.question(`${c(DIM, G.bar)}  (Y/n) `, resolve));
                const yes = !/^n/i.test(answer.trim());
                w(`${c(DIM, G.bar)}  ${yes ? 'Yes' : 'No'}`);
                w(c(DIM, G.bar));
                return yes;
            } finally { rl.close(); }
        },
    };
}
