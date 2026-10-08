import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gates } from './gates/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Prove every gate can FIRE, and prove it is SPECIFIC.
 *
 * Two assertions per gate, and the second is the one that matters most:
 *   fires  -> at least one finding. A gate that cannot fail reports compliance it never verified.
 *   silent -> zero findings on a deliberate near miss. A gate that flags everything is noise, and
 *             noise is worse than silence because it trains people to stop reading the output.
 */
export function selftest() {
    const results = [];
    for (const gate of gates) {
        for (const kind of ['fires', 'silent']) {
            const rel = gate.fixtures[kind];
            const abs = join(ROOT, 'fixtures', rel);
            let text;
            try {
                text = readFileSync(abs, 'utf8');
            } catch {
                results.push({ gate: gate.id, kind, ok: false, detail: `fixture missing: fixtures/${rel}` });
                continue;
            }
            if (!gate.appliesTo(`fixtures/${rel}`)) {
                results.push({ gate: gate.id, kind, ok: false, detail: `appliesTo() rejects its own fixture fixtures/${rel} — the gate would never see it` });
                continue;
            }
            let found;
            try {
                found = gate.check({ path: `fixtures/${rel}`, text, lines: text.split('\n') }) ?? [];
            } catch (err) {
                results.push({ gate: gate.id, kind, ok: false, detail: `check() threw: ${err.message}` });
                continue;
            }
            const ok = kind === 'fires' ? found.length > 0 : found.length === 0;
            const detail = kind === 'fires'
                ? (ok ? `${found.length} finding(s)` : 'NO findings — this gate cannot fire')
                : (ok ? 'silent, as required' : `${found.length} FALSE POSITIVE(s): ` + found.map((f) => `L${f.line} ${f.message}`).join(' | '));
            results.push({ gate: gate.id, kind, ok, detail });
        }
    }
    return results;
}
