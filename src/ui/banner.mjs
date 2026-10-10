/**
 * The wordmark, in the ANSI Shadow style.
 *
 * ⚠️ WIDTH IS THE WHOLE PROBLEM with a banner this wide. "NIGHTBARK" is nine glyphs — 71 columns —
 * and a terminal narrower than that does not clip it, it WRAPS it, which turns the art into six
 * lines of rubble. So the width is measured and there are three tiers, not one.
 *
 * And it is skipped entirely when output is not a terminal: a banner in a CI log or a piped file is
 * noise in someone's grep.
 */

import { LOGO_ART, LOGO_WIDTH, LOGO_HEIGHT } from './logo.mjs';

const FULL = [
    '███╗   ██╗██╗ ██████╗ ██╗  ██╗████████╗██████╗  █████╗ ██████╗ ██╗  ██╗',
    '████╗  ██║██║██╔════╝ ██║  ██║╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗██║ ██╔╝',
    '██╔██╗ ██║██║██║  ███╗███████║   ██║   ██████╔╝███████║██████╔╝█████╔╝ ',
    '██║╚██╗██║██║██║   ██║██╔══██║   ██║   ██╔══██╗██╔══██║██╔══██╗██╔═██╗ ',
    '██║ ╚████║██║╚██████╔╝██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║██║  ██╗',
    '╚═╝  ╚═══╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝',
];

/** A half-height form for terminals that cannot hold the full one. */
const COMPACT = [
    '▐ ▌▗▘▛▘▌▌▀▛▘▛▚ ▞▜ ▛▚ ▌▗▘',
    '▌▝▌▌ ▌▌▛▌ ▌ ▛▙ ▛▌ ▛▙ ▛▖ ',
    '▘ ▘▘ ▝▘▘▘ ▘ ▘▝ ▘▘ ▘▝ ▘▝ ',
];

export const WORDMARK_WIDTH = FULL[0].length;


/**
 * ⛔ THERE IS ONLY ONE DOG, and that is the whole point of this note.
 *
 * This file used to carry a SECOND dog — a 20x16 silhouette drawn to sit beside the wordmark on a
 * terminal too narrow for the full logo. It was decent art and it was the wrong idea: a terminal at
 * 101 columns showed one animal and a terminal at 111 showed a completely different one. A logo
 * that changes species with the window width is not a logo.
 *
 * ⚠️ AND THE BIG ART CANNOT SIMPLY BE SHRUNK. It is a fine-line conversion where the dog is formed
 * by subtle GAPS in a field of glyphs, so downsampling 67x109 to 8x30 — tried, both polarities —
 * produces mush rather than a smaller dog. There is no middle size available.
 *
 * So the tiers below degrade to the WORDMARK, never to a different drawing. If the dog does not
 * fit, there is no dog.
 */

/** Length ignoring escape sequences — the banner builds its own strings, so this stays local. */
const visible = (s) => s.replace(/\x1b\[[0-9;]*m/g, '').length;

/**
 * ⚠️ Colour is OPT-OUT via the conventions people already have — NO_COLOR (any value) and
 * FORCE_COLOR. Inventing a `--colour` flag for this would be a configuration surface, which
 * ADR-0006 refuses, and would also ignore the variable every other tool on the machine honours.
 */
export function colourEnabled({ env = process.env, stream = process.stdout } = {}) {
    if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '0') return true;
    if (env.TERM === 'dumb') return false;
    return Boolean(stream?.isTTY);
}

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/**
 * The brand colour, #A627F5 — rgb(166, 39, 245).
 *
 * ⚠️ THREE TIERS, because a 24-bit escape on a terminal that does not understand it does not degrade
 * gracefully — it prints the escape sequence as visible garbage across the wordmark. So the depth is
 * detected rather than assumed:
 *
 *   truecolor   COLORTERM=truecolor|24bit  → the exact hex
 *   256 colour  TERM contains 256color     → xterm 129 (#af00ff), the nearest neighbour
 *   anything else                          → bold magenta, which every ANSI terminal has had since 1979
 */
export const BRAND = { hex: 'A627F5', rgb: [166, 39, 245], xterm256: 129, basic: '\x1b[1;35m' };
export const ART = { hex: 'EB073D', rgb: [235, 7, 61], xterm256: 161, basic: '\x1b[1;31m' };
export const TAG = { hex: 'F04A0A', rgb: [240, 74, 10], xterm256: 202, basic: '\x1b[33m' };

/**
 * ⚠️ TRUECOLOUR IS DETECTED, NOT ASSUMED, and COLORTERM alone is not enough.
 *
 * COLORTERM is routinely unset even on terminals that handle 24-bit colour perfectly well — it was
 * unset on the author's own machine, so the brand silently degraded to its 256-colour neighbour.
 * Near enough to look right, wrong enough not to be the brand, and nothing announces it.
 *
 * The extra signals are existing conventions, not inventions: FORCE_COLOR=3 is the established
 * "16 million colours" level, and TERM_PROGRAM names the emulators known to support it.
 *
 * ⛔ Apple's Terminal.app is deliberately absent from that list. It genuinely has no 24-bit
 * support, so claiming it does would make the output worse there rather than better.
 */
function truecolour(env) {
    const ct = (env.COLORTERM ?? '').toLowerCase();
    if (ct.includes('truecolor') || ct.includes('24bit')) return true;
    if ((env.FORCE_COLOR ?? '') === '3') return true;
    const prog = (env.TERM_PROGRAM ?? '').toLowerCase();
    return ['iterm.app', 'vscode', 'wezterm', 'hyper', 'ghostty', 'rio', 'tabby'].includes(prog);
}

/**
 * The escape for one colour at the best depth this terminal actually supports.
 *
 * Both palette fallbacks were COMPUTED against the xterm cube rather than guessed: #A627F5 is
 * nearest 129 and #EB073D nearest 161. Eyeballing a 256-colour approximation is how a brand ends up
 * one shade out on every machine that is not the author's.
 */
export function escapeFor(spec, { env = process.env } = {}) {
    if (truecolour(env)) return `\x1b[38;2;${spec.rgb.join(';')}m`;
    if ((env.TERM ?? '').includes('256color')) return `\x1b[38;5;${spec.xterm256}m`;
    return spec.basic;
}

export const brandEscape = (opts) => escapeFor(BRAND, opts);
export const artEscape = (opts) => escapeFor(ART, opts);
export const tagEscape = (opts) => escapeFor(TAG, opts);

/**
 * Render the wordmark, or an empty string when it would do more harm than good.
 *
 * @returns {string} '' when not a terminal — a banner belongs on a screen, not in a log file.
 */
export function banner({ stream = process.stdout, env = process.env, force = false } = {}) {
    const isTty = force || Boolean(stream?.isTTY);
    if (!isTty) return '';

    const width = stream?.columns ?? 80;
    const colour = colourEnabled({ env, stream });
    const brand = brandEscape({ env });
    const paint = (s) => (colour ? `${brand}${s}${RESET}` : s);
    const tagline = 'finds the tests that did not bark';

    // ⚠️ WIDTH ONLY — the height gate is gone, deliberately. It required 79 rows, which almost no
    // terminal has, so the full logo effectively never appeared and the fallback showed a different
    // dog instead. Scrolling is a fair price for the art somebody actually chose; a substitute
    // animal is not.
    if (width >= LOGO_WIDTH + 2) {
        return fullLogo({ colour, brand, art: artEscape({ env }), tag: tagEscape({ env }), width });
    }

    if (width >= WORDMARK_WIDTH + 2) {
        const pad = ' '.repeat(Math.max(0, Math.floor((Math.min(width, 100) - WORDMARK_WIDTH) / 2)));
        const lines = FULL.map((l) => pad + paint(l));
        const tagPad = ' '.repeat(Math.max(0, Math.floor((Math.min(width, 100) - tagline.length) / 2)));
        return ['', ...lines, '', tagPad + (colour ? tagEscape({ env }) + tagline + RESET : tagline), ''].join('\n');
    }
    if (width >= COMPACT[0].length + 2) {
        return ['', ...COMPACT.map((l) => ' ' + paint(l)), '', ` ${colour ? tagEscape({ env }) + tagline + RESET : tagline}`, ''].join('\n');
    }
    // Narrower than even the compact form: a plain name beats wrapped rubble.
    //
    // ⚠️ AND THE TAGLINE GOES TOO when it does not fit. The first version always appended it, so the
    // "narrow" fallback was 46 columns and wrapped at 12 — reintroducing the exact failure the three
    // tiers exist to prevent, in the tier whose whole job is to prevent it. Caught by asserting that
    // no rendered line exceeds the terminal width, at each tier.
    const name = 'nightbark';
    const full = ` ${name} — ${tagline}`;
    if (visible(full) <= width) return `\n ${paint(name)} ${colour ? tagEscape({ env }) + '— ' + tagline + RESET : '— ' + tagline}\n`;
    if (visible(` ${name}`) <= width) return `\n ${paint(name)}\n`;
    return '';
}

/**
 * The full logo: art, then the wordmark centred beneath it, then the tagline.
 *
 * Exported so `nightbark logo` can print it whatever the terminal size — the size GATE belongs to
 * the automatic banner, not to an explicit request for the logo.
 */
export function fullLogo({ colour = true, brand = brandEscape(), art = artEscape(), tag = tagEscape(), width = LOGO_WIDTH } = {}) {
    const paint = (s) => (colour ? `${brand}${s}${RESET}` : s);
    const ink = (s) => (colour && s.trim() ? `${art}${s}${RESET}` : s);
    const span = Math.max(LOGO_WIDTH, WORDMARK_WIDTH);
    const pad = ' '.repeat(Math.max(0, Math.floor((span - WORDMARK_WIDTH) / 2)));
    const tagline = 'finds the tests that did not bark';
    const tagPad = ' '.repeat(Math.max(0, Math.floor((span - tagline.length) / 2)));
    return [
        '',
        // The dog in #EB073D, the name in #A627F5 below it.
        ...LOGO_ART.map(ink),
        '',
        ...FULL.map((l) => pad + paint(l)),
        '',
        tagPad + (colour ? tag + tagline + RESET : tagline),
        '',
    ].join('\n');
}
