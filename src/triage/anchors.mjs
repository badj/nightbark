/**
 * Step 2 — EXTRACT STABLE ANCHORS.
 *
 * An anchor identifies a failure regardless of when or where it ran. The split that matters:
 *
 *   STABLE    exception type, message template, function names, test name, URL shape, status code
 *   UNSTABLE  timestamps, pids, ports, line numbers, request ids, node_modules frames
 *
 * Line numbers are the subtle one. They are stable within a build and useless across builds: edit a
 * file above the throw and every frame shifts, so a fingerprint keyed on them says "new bug" on a
 * whitespace change. Function name plus file name survives the edit.
 */

const EXCEPTION_PATTERNS = [
    /\b(\w+(?:Error|Exception))\b\s*:/,            // TypeError:, HttpException:
    /\bexit code (\d+)\b/i,                         // exit code 137
    /\b(FAILED|FAIL|Failure)\b\s*:/,                // FAILED:
];

/** The most SPECIFIC match wins — "TypeError" beats a bare "Error". */
export function exceptionType(text) {
    for (const re of EXCEPTION_PATTERNS) {
        const m = text.match(re);
        if (m) return (m[1] ?? m[0]).replace(/:$/, '').trim();
    }
    const generic = text.match(/\b(Error|Exception)\b\s*:/);
    return generic ? generic[1] : null;
}

/**
 * The message, with specifics removed and STRUCTURE kept.
 *
 * ⛔ THE SKILL'S SPEC CONTRADICTS ITSELF HERE, and only writing it down exposes that.
 *
 *   Step 2b says:  "Replace quoted strings with <STR>"
 *   Test 5 says:   "Cannot read property 'name'" and "...'email'" must give DIFFERENT fingerprints
 *
 * Both cannot hold. `'name'` and `'email'` ARE quoted strings, so the literal rule collapses them to
 * `Cannot read property <STR> of undefined` and Test 5 fails — which it duly did, on the first run.
 *
 * RESOLVED BY LENGTH, the same way `serialised-suite` tells a quoted VALUE from quoted PROSE: a short
 * quoted token is part of the message template (it says WHICH property is missing, and a different
 * property is a different bug); a long quoted string is a specific — an id, an email, a URL, a user's
 * input — and belongs behind <STR>. Test 5 is the authority here because it encodes intent, where 2b
 * encodes a technique; when a spec's example disagrees with its rule, the example is what someone
 * actually wanted.
 */
export const TEMPLATE_STR_MIN = 12;

export function messageTemplate(text, type) {
    let line = text;
    if (type) {
        const at = text.indexOf(type);
        if (at !== -1) line = text.slice(at + type.length).replace(/^\s*:\s*/, '');
    }
    line = line.split(/ at | in \/| File "/)[0];
    return line
        .replace(/(['"`])(.*?)\1/g, (m, q, body) => (body.length >= TEMPLATE_STR_MIN ? '<STR>' : m))
        .replace(/\b\d{4,}\b/g, '<NUM>')
        .trim();
}

/**
 * Top frames, function + file, line numbers stripped, framework noise dropped.
 *
 * ⚠️ node_modules frames are excluded deliberately. They are the SAME for every failure that goes
 * through the framework, so including them makes unrelated failures look similar — the opposite of
 * what an anchor is for.
 */
export function topFrames(text, max = 5) {
    const frames = [];
    const push = (fn, file) => {
        if (!fn || /node_modules/.test(file ?? '')) return;
        const base = (file ?? '').split('/').pop()?.replace(/:\d+(:\d+)?$/, '') ?? '';
        const key = base ? `${fn}(${base})` : fn;
        if (!frames.includes(key)) frames.push(key);
    };
    for (const m of text.matchAll(/\bat\s+([\w$.<>]+)\s+\(([^)]+)\)/g)) push(m[1], m[2]);
    for (const m of text.matchAll(/File "([^"]+)", line \d+, in (\w+)/g)) push(m[2], m[1]);
    for (const m of text.matchAll(/\bat\s+([^\s()]+\.[jt]sx?):\d+/g)) push(m[1].split('/').pop(), m[1]);
    return frames.slice(0, max);
}

export function testName(text) {
    for (const re of [/›\s+(.+?)\s+─/, /●\s+(.+?)\s+›/, /FAILED\s+(\S+::\S+)/]) {
        const m = text.match(re);
        if (m) return m[1].trim();
    }
    return null;
}

/** Path segments that look like ids become <ID>, so one endpoint is one anchor. */
export function urlPattern(text) {
    const m = text.match(/\b(GET|POST|PUT|DELETE|PATCH)\s+(\/\S*)/);
    if (!m) return null;
    const path = m[2]
        .split('?')[0]
        .split('/')
        .map((seg) => (/^\d+$/.test(seg) || /^[0-9a-f-]{8,}$/i.test(seg) || seg === '<UUID>' ? '<ID>' : seg))
        .join('/');
    return `${m[1]} ${path}`;
}

export function statusCode(text) {
    for (const re of [/status[_ ]?code[=: ]+(\d{3})/i, /HTTP\/\d\.\d\s+(\d{3})/, /\b(\d{3})\s+(?:OK|Created|Not Found|Internal Server Error|Bad Request|Unauthorized|Forbidden)\b/]) {
        const m = text.match(re);
        if (m) return m[1];
    }
    return null;
}

/** All six, in the fixed order the canonical form uses. */
export function anchorsOf(normalised) {
    const type = exceptionType(normalised);
    return {
        exceptionType: type,
        messageTemplate: messageTemplate(normalised, type) || null,
        frames: topFrames(normalised),
        testName: testName(normalised),
        urlPattern: urlPattern(normalised),
        statusCode: statusCode(normalised),
    };
}
