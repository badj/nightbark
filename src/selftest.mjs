import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gates } from './gates/index.mjs';
import { audit } from './runner.mjs';

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

            // A project gate's fixture is a DIRECTORY — a collision cannot be shown in one file.
            // Running it through the real runner also exercises the project-gate plumbing, so the
            // proof covers the wiring and not just the gate's own logic.
            if (gate.kind === 'project') {
                let found;
                try {
                    found = audit(abs, { only: [gate.id] }).findings;
                } catch (err) {
                    results.push({ gate: gate.id, kind, ok: false, detail: `audit of fixtures/${rel} threw: ${err.message}` });
                    continue;
                }
                results.push({ gate: gate.id, kind, ...verdict(gate, kind, found, (f) => `${f.file}:${f.line}`) });
                continue;
            }

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
            results.push({ gate: gate.id, kind, ...verdict(gate, kind, found, (f) => `L${f.line}`) });
        }
    }
    return results;
}

/**
 * The verdict for one proof — ONE implementation, used by file gates and project gates alike.
 *
 * ⚠️ `>0` IS TOO WEAK AN ASSERTION, and that is not hypothetical. A fires fixture planting THREE
 * faults reported only one and the proof passed anyway, so a gate catching a third of what it should
 * looked healthy. Where a gate declares `fixtures.expect`, the count must match EXACTLY.
 *
 * ⛔ AND THIS FUNCTION EXISTS BECAUSE THE CHECK WAS ONLY ON ONE OF THE TWO PATHS. `fixtures.expect`
 * was read inside the project-gate branch and nowhere else, so declaring `expect: 4` on `fixed-wait`
 * — a FILE gate — was accepted by `validateGate` and then silently ignored. Blinding that gate's
 * matcher took its fires fixture from 4 findings to 2 and `selftest` still exited 0.
 *
 * A declaration that does nothing is worse than no declaration, because it reads as protection. And
 * it is the second instance of one shape in a day: a feature implemented on one of two parallel code
 * paths (the other was per-finding severity, honoured by the project path and dropped by the file
 * path). Hence one function rather than a third careful copy.
 *
 * Found by DEMONSTRATING the tool — breaking a gate on purpose in front of someone.
 */
function verdict(gate, kind, found, where) {
    const want = gate.fixtures.expect;
    const ok = kind === 'fires'
        ? (want === undefined ? found.length > 0 : found.length === want)
        : found.length === 0;
    const detail = kind === 'fires'
        ? (ok ? `${found.length} finding(s)${want !== undefined ? ' (exactly as declared)' : ''}`
              : want === undefined ? 'NO findings — this gate cannot fire'
              : `${found.length} finding(s) but the fixture declares ${want} — ${found.length < want ? 'faults are being MISSED' : 'something extra is firing'}`)
        : (ok ? 'silent, as required'
              : `${found.length} FALSE POSITIVE(s): ` + found.map((f) => `${where(f)} ${f.message}`).join(' | '));
    return { ok, detail };
}
