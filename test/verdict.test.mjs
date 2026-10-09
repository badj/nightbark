import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeVerdicts } from '../src/irregulars/verdict.mjs';

/**
 * The merge decides what an engineer actually reads, so it gets proven like a gate.
 *
 * Measured on the first real run: the judge produced 3 findings of which 1 was true (33%), and
 * after the adversarial pass 1 of 1 (100%). Every rule below exists to keep that ratio — a bug here
 * silently re-admits the two wrong findings Moriarty threw out.
 */

const cand = (id, line) => ({ id, file: 'tests/a.spec.ts', line, assertion: 'expect(x).toBeFalsy()', assertionVerbatim: 'expect(x).toBeFalsy();' });
const candidates = [cand('a#falsy', 10), cand('b#falsy', 20), cand('c#falsy', 30), cand('d#falsy', 40)];

test('established is not reported at all', () => {
    const { findings, stats } = mergeVerdicts({
        candidates,
        answers: [{ id: 'a#falsy', premise: 'established', evidence: 'the click above' }],
        verdicts: [],
    });
    assert.equal(findings.length, 0);
    assert.equal(stats.established, 1);
});

test('dropped is reported NOWHERE — Moriarty broke it, so nobody should spend a minute on it', () => {
    const { findings, stats } = mergeVerdicts({
        candidates,
        answers: [{ id: 'b#falsy', premise: 'absent', evidence: 'nothing establishes it' }],
        verdicts: [{ id: 'b#falsy', verdict: 'dropped', attack: 'the action establishes it' }],
    });
    assert.equal(findings.length, 0, 'a dropped claim must not reach a reader');
    assert.equal(stats.dropped, 1);
});

test('confirmed is a warning; downgraded is a note that says it needs a human', () => {
    const { findings } = mergeVerdicts({
        candidates,
        answers: [
            { id: 'b#falsy', premise: 'absent', evidence: 'e1' },
            { id: 'c#falsy', premise: 'absent', evidence: 'e2' },
        ],
        verdicts: [
            { id: 'b#falsy', verdict: 'confirmed', attack: 'tried X', why_it_survives_or_not: 'X fails' },
            { id: 'c#falsy', verdict: 'downgraded', attack: 'tried Y', why_it_survives_or_not: 'Y is unsettled' },
        ],
    });
    const byLine = Object.fromEntries(findings.map((f) => [f.line, f]));
    assert.equal(byLine[20].severity, 'warning');
    assert.equal(byLine[30].severity, 'note');
    assert.match(byLine[30].message, /human read/i);
});

test('⚠️ a claim with NO verdict surfaces as UNREVIEWED rather than vanishing', () => {
    // The important one. Silently dropping an unreviewed claim would make an INCOMPLETE adversarial
    // pass indistinguishable from a clean one — the exact defect shape this tool is named after.
    const { findings, stats } = mergeVerdicts({
        candidates,
        answers: [{ id: 'd#falsy', premise: 'absent', evidence: 'e' }],
        verdicts: [],
    });
    assert.equal(stats.unreviewed, 1);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].severity, 'note', 'unreviewed must NOT be reported as a defect');
    assert.match(findings[0].message, /NOT REVIEWED/);
    assert.match(findings[0].message, /not as cleared/);
});

test('uncertain is surfaced — "nobody could tell" is a real state of the world', () => {
    const { findings, stats } = mergeVerdicts({
        candidates,
        answers: [{ id: 'a#falsy', premise: 'uncertain', evidence: 'would need the page object' }],
        verdicts: [],
    });
    assert.equal(stats.uncertain, 1);
    assert.equal(findings[0].severity, 'note');
    assert.match(findings[0].message, /UNCERTAIN/);
});

test('the adversarial reasoning travels WITH the finding', () => {
    // A reader who can see the strongest argument against a finding judges it in seconds, and is
    // far less likely to "fix" it by deleting the assertion — the usual wrong response.
    const { findings } = mergeVerdicts({
        candidates,
        answers: [{ id: 'b#falsy', premise: 'absent', evidence: 'JUDGE_SAID' }],
        verdicts: [{ id: 'b#falsy', verdict: 'confirmed', attack: 'ATTACK_TEXT', why_it_survives_or_not: 'WHY_TEXT' }],
    });
    assert.match(findings[0].message, /JUDGE_SAID/);
    assert.match(findings[0].message, /ATTACK_TEXT/);
    assert.match(findings[0].message, /WHY_TEXT/);
});

test('an answer for an unknown candidate is ignored, not invented into a finding', () => {
    const { findings } = mergeVerdicts({
        candidates,
        answers: [{ id: 'ghost#falsy', premise: 'absent', evidence: 'invented' }],
        verdicts: [{ id: 'ghost#falsy', verdict: 'confirmed' }],
    });
    assert.equal(findings.length, 0);
});

test('findings come out ordered by file then line, so output is diffable between runs', () => {
    const { findings } = mergeVerdicts({
        candidates,
        answers: [
            { id: 'c#falsy', premise: 'absent' },
            { id: 'b#falsy', premise: 'absent' },
        ],
        verdicts: [
            { id: 'c#falsy', verdict: 'confirmed' },
            { id: 'b#falsy', verdict: 'confirmed' },
        ],
    });
    assert.deepEqual(findings.map((f) => f.line), [20, 30]);
});
