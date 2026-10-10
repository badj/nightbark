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
 * The dog, in profile, mid-bark — ear up, jaws open.
 *
 * ⚠️ DRAWN, NOT TRACED. The pose came from a reference the author found (a watermarked stock
 * image): barking dog head, profile, ear up, jaws apart. The POSE is subject matter and nobody owns
 * it; the reference's actual linework is theirs, so none of it is here. At 20x16 pixels there is
 * room for a silhouette and nothing else anyway.
 *
 * Designed as a 20x16 PIXEL grid and rendered two rows at a time with ▀▄█, which is what makes a
 * recognisable dog possible at this size: six terminal rows of whole blocks is far too coarse — the
 * first four attempts all came out as blobs — but half-blocks give 16 vertical pixels in 8 rows.
 *
 * The open jaw is the whole point. Earlier passes drew the mouth CLOSED, and a closed-mouth dog is
 * a poor logo for something called nightbark.
 */
const DOG_PIXELS = [
    '..###...............',
    '..#####.............',
    '.#######.......#####',
    '.########....#######',
    '.#########.#########',
    '.##########.########',
    '.###########........',
    '.###########........',
    '.############.......',
    '.############.#####.',
    '.###########.#######',
    '..##########.######.',
    '..##########.####...',
    '..##########........',
    '...#########........',
    '....#######.........',
];

/** Two pixel rows per terminal row: ▀ top only, ▄ bottom only, █ both. */
function fromPixels(grid) {
    const out = [];
    for (let y = 0; y < grid.length; y += 2) {
        const top = grid[y] ?? '';
        const bot = grid[y + 1] ?? '';
        let line = '';
        for (let x = 0; x < Math.max(top.length, bot.length); x++) {
            const a = top[x] === '#';
            const b = bot[x] === '#';
            line += a && b ? '█' : a ? '▀' : b ? '▄' : ' ';
        }
        out.push(line);
    }
    return out;
}

export const DOG = fromPixels(DOG_PIXELS);
export const DOG_WIDTH = Math.max(...DOG.map((l) => l.length));
const GAP = 2;

/**
 * Dog and wordmark side by side, the 6-row wordmark centred against the 8-row dog.
 *
 * ⚠️ The LOCKUP needs 93 columns. That is wider than the 80 most terminals default to, which is why
 * it is the widest of four tiers rather than the only one — a logo that wraps is worse than no logo.
 */
function lockup(paint, dim, colour) {
    const pad = Math.floor((DOG.length - FULL.length) / 2);
    return DOG.map((d, i) => {
        const word = FULL[i - pad] ?? '';
        const left = d.padEnd(DOG_WIDTH + GAP);
        return paint(left) + (word ? paint(word) : '');
    });
}
export const LOCKUP_WIDTH = DOG_WIDTH + GAP + WORDMARK_WIDTH;

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
export const BRAND = { hex: 'A627F5', rgb: [166, 39, 245], xterm256: 129 };

export function brandEscape({ env = process.env } = {}) {
    const ct = (env.COLORTERM ?? '').toLowerCase();
    if (ct.includes('truecolor') || ct.includes('24bit')) return `\x1b[38;2;${BRAND.rgb.join(';')}m`;
    if ((env.TERM ?? '').includes('256color')) return `\x1b[38;5;${BRAND.xterm256}m`;
    return '\x1b[1;35m';
}

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

    // Widest tier: the dog beside the word.
    if (width >= LOCKUP_WIDTH + 2) {
        const pad = ' '.repeat(Math.max(0, Math.floor((Math.min(width, 110) - LOCKUP_WIDTH) / 2)));
        const lines = lockup(paint).map((l) => pad + l);
        const tagPad = ' '.repeat(Math.max(0, Math.floor((Math.min(width, 110) - tagline.length) / 2)));
        return ['', ...lines, '', tagPad + (colour ? DIM + tagline + RESET : tagline), ''].join('\n');
    }
    if (width >= WORDMARK_WIDTH + 2) {
        const pad = ' '.repeat(Math.max(0, Math.floor((Math.min(width, 100) - WORDMARK_WIDTH) / 2)));
        const lines = FULL.map((l) => pad + paint(l));
        const tagPad = ' '.repeat(Math.max(0, Math.floor((Math.min(width, 100) - tagline.length) / 2)));
        return ['', ...lines, '', tagPad + (colour ? DIM + tagline + RESET : tagline), ''].join('\n');
    }
    if (width >= COMPACT[0].length + 2) {
        return ['', ...COMPACT.map((l) => ' ' + paint(l)), '', ` ${colour ? DIM + tagline + RESET : tagline}`, ''].join('\n');
    }
    // Narrower than even the compact form: a plain name beats wrapped rubble.
    //
    // ⚠️ AND THE TAGLINE GOES TOO when it does not fit. The first version always appended it, so the
    // "narrow" fallback was 46 columns and wrapped at 12 — reintroducing the exact failure the three
    // tiers exist to prevent, in the tier whose whole job is to prevent it. Caught by asserting that
    // no rendered line exceeds the terminal width, at each tier.
    const name = 'nightbark';
    const full = ` ${name} — ${tagline}`;
    if (visible(full) <= width) return `\n ${paint(name)} ${colour ? DIM + '— ' + tagline + RESET : '— ' + tagline}\n`;
    if (visible(` ${name}`) <= width) return `\n ${paint(name)}\n`;
    return '';
}
