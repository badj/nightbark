import { readFileSync } from 'node:fs';
import { walk } from '../runner.mjs';

/**
 * Resolve a locator expression back to where it is DEFINED.
 *
 * ⚠️ THIS EXISTS BECAUSE MORIARTY ASKED FOR IT BY NAME. Run end to end on 2026-10-09, the
 * adversarial pass said the single biggest structural push toward wrongly confirming a finding was
 * that every page object had been withheld:
 *
 *   "Withholding every page object while two of three claims turn on one is the biggest structural
 *    push toward confirm, defused only because the file explicitly says that case is `uncertain`."
 *
 * Two of three claims were undecidable for exactly that reason. The judge was shown
 * `homePage.heroSignInLink` as a NAME, and whether it sits inside an already-asserted locator
 * decided whether the finding was real. Nobody could tell, so both landed on `downgraded`.
 *
 * Proven on the first target it was pointed at: resolution answered the question decisively, and
 * answered it BETTER than the hypothesis under test. `heroSignInLink` turned out to be rooted on a
 * different element than the asserted one (siblings, not parent/child — so the containment defence
 * failed), while the SAME locator was asserted visible in a neighbouring test (so the stale-selector
 * risk, the finding's only remaining substance, was disproven). A hedged drop became a confident one.
 *
 * ⚠️ Deliberately NOT a TypeScript parser. A real parser is a dependency, a build step and a version
 * treadmill, for a job that is four greps. When this breaks it should break visibly on an unusual
 * layout — reported as `unresolved`, never as a confident wrong definition.
 */

const MAX_DEF_LINES = 8;

/**
 * Pull the thing being asserted on out of an assertion line.
 *
 * ⚠️ TRACES A BARE LOCAL ONE HOP, which is not a nicety — it is the shape the adversarial pass could
 * not settle. Real code routinely reads a locator into a variable first:
 *
 *     const signOutVisible = await loginPage.header.signOutButton.isVisible().catch(() => false);
 *     expect(signOutVisible).toBeFalsy();
 *
 * Extracting only dotted expressions sees `signOutVisible` — a plain local — and resolves nothing,
 * so the very claim this whole capability was built to decide stayed undecidable. Given the enclosing
 * test body, the local is traced back to its assignment and the locator inside it is used instead.
 */
export function locatorExpressions(line, bodyLines = []) {
    const dotted = /\bexpect\s*\(\s*(?:await\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)/g;
    const out = [...line.matchAll(dotted)].map((m) => m[1]);
    if (out.length) return out;

    // No dotted expression — is it a bare local we can trace?
    const bare = line.match(/\bexpect\s*\(\s*(?:await\s+)?([A-Za-z_$][\w$]*)\s*\)/);
    if (!bare || !bodyLines.length) return [];

    const decl = new RegExp(`\\b(?:const|let|var)\\s+${bare[1]}\\s*=`);
    for (let i = 0; i < bodyLines.length; i++) {
        if (!decl.test(bodyLines[i])) continue;
        // The assignment may wrap across lines, so look at a small window.
        const window = bodyLines.slice(i, i + 4).join(' ');
        const found = [...window.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)/g)]
            .map((m) => m[1])
            .filter((e) => !/^(?:Date|Math|JSON|Object|Promise|console|process)\./.test(e));
        if (found.length) return [found[0]];
    }
    return [];
}

/**
 * Build a one-off index of the target repo: class files, fixture type declarations, and every
 * `expect(...)` site. Built once per audit and reused, because the alternative is re-walking the
 * tree per candidate.
 */
export function buildIndex(root) {
    const files = [];
    for (const f of walk(root)) {
        let text;
        try { text = readFileSync(f.abs, 'utf8'); } catch { continue; }
        files.push({ ...f, text, lines: text.split('\n') });
    }
    return { files };
}

/**
 * @returns {{status:'resolved'|'unresolved', reason?:string, receiver:string, property:string,
 *            className?:string, file?:string, line?:number, definition?:string[],
 *            dependsOn?:object[], alsoAssertedAt?:string[]}}
 */
export function resolveLocator(index, expr) {
    const parts = expr.split('.');
    const receiver = parts[0];
    const property = parts[parts.length - 1];
    const base = { receiver, property, expr };

    // 1. What TYPE is the receiver? A fixture declaration (`homePage: HomePage;`), a `new`, or a param.
    let className = findReceiverClass(index, receiver);
    if (!className) {
        return { ...base, status: 'unresolved', reason: `could not determine the class behind "${receiver}" — no fixture type declaration, \`new\`, or typed parameter found` };
    }

    // 1b. ⚠️ WALK NESTED COMPONENTS. `loginPage.header.signOutButton` does not define signOutButton
    // on LoginPage — it lives on whatever `header` is. The first version looked only at the first and
    // last segment and reported `unresolved` on this shape, which is the commonest page-object
    // layout there is (header / footer / nav). It failed honestly, with the real reason, which is
    // how the gap got spotted at all — but a resolver that cannot see through one `.` is not much
    // of a resolver.
    const hops = [];
    for (const mid of parts.slice(1, -1)) {
        const hop = findPropertyAssignment(index, className, mid);
        const viaNew = hop && hop.definition.join(' ').match(/new\s+([A-Z][\w$]*)\s*\(/);
        let nested = viaNew ? { type: viaNew[1], file: hop.file, line: hop.line } : null;
        // ⚠️ An AGGREGATE declared as a type is just as common as one built with `new`:
        //     export interface Pages { registration: RegistrationPage; signIn: SignInPage; }
        // The first version only understood `this.x = new Y()` and so could not see through a
        // BDD-style `pages.registration.*` at all — 6 of 9 misses on a real suite were this.
        if (!nested) nested = findTypeMember(index, className, mid);
        if (!nested) {
            return { ...base, status: 'unresolved', className,
                reason: `"${receiver}" is ${className}, but could not see what "${mid}" is — expected something like \`this.${mid} = new SomeComponent(page)\``,
                hops };
        }
        hops.push({ property: mid, from: className, to: nested.type, file: nested.file, line: nested.line });
        className = nested.type;
    }

    // 2. Where is that class, and where is the property assigned?
    const site = findPropertyAssignment(index, className, property);
    if (!site) {
        return { ...base, status: 'unresolved', className, reason: `found class ${className} but no assignment to "${property}" in it — it may be inherited, or built dynamically` };
    }

    // 3. Resolve one level of `this.X` the definition depends on. One level, not transitive: the
    //    question is "what is this rooted on", and chasing further buries the answer in noise.
    const dependsOn = [];
    for (const dep of new Set((site.definition.join(' ').match(/this\.([A-Za-z_$][\w$]*)/g) ?? []).map((s) => s.slice(5)))) {
        if (dep === property) continue;
        const d = findPropertyAssignment(index, className, dep);
        if (d) dependsOn.push({ property: dep, file: d.file, line: d.line, definition: d.definition });
    }

    // 4. ⚠️ THE MOST VALUABLE FIELD. Every OTHER place the same locator is asserted on. If a
    //    neighbouring test asserts it visible and passes, the selector demonstrably resolves — which
    //    disproves the stale-selector risk that is usually a vacuity finding's only real substance.
    const alsoAssertedAt = [];
    // Match the FULL expression, so loginPage.header.signOutButton is not confused with
    // someOther.signOutButton on a different component.
    const needle = expr;
    for (const f of index.files) {
        if (!f.text.includes(needle)) continue;
        f.lines.forEach((l, i) => {
            if (!l.includes(needle) || !/\bexpect\s*\(/.test(l)) return;
            if (/^\s*(?:\/\/|\*)/.test(l)) return;
            const negative = /\.not\.|toBeHidden/.test(l);
            alsoAssertedAt.push(`${f.path}:${i + 1}${negative ? ' (negative)' : ' (POSITIVE — proves the selector resolves)'}  ${l.trim().slice(0, 110)}`);
        });
    }

    return { ...base, status: 'resolved', className, hops, ...site, dependsOn, alsoAssertedAt };
}

/** A fixture type declaration, a `new`, or a typed parameter — in that order of reliability. */
function findReceiverClass(index, receiver) {
    const patterns = [
        new RegExp(`\\b${receiver}\\s*:\\s*([A-Z][\\w$]*)\\s*[;,)]`),      // homePage: HomePage;
        new RegExp(`\\b${receiver}\\s*=\\s*new\\s+([A-Z][\\w$]*)\\s*\\(`), // const homePage = new HomePage(
        new RegExp(`\\b${receiver}\\s*:\\s*([A-Z][\\w$]*)\\b`),            // looser, last resort
    ];
    for (const re of patterns) {
        for (const f of index.files) {
            const m = f.text.match(re);
            if (m) return m[1];
        }
    }
    return null;
}

/**
 * `this.<property> = ...` inside the class — FOLLOWING `extends` when it is not there.
 *
 * ⚠️ Inheritance is not an edge case, it is the default. `class LoginPage extends BasePage` with
 * `this.header = new HeaderComponent(page)` on the base is the commonest page-object layout in any
 * Playwright suite of size, and without this the resolver reports `unresolved` for every locator a
 * page inherits — which is most of the shared furniture: header, footer, nav, cookie banner.
 *
 * Found because the resolver said `unresolved` with the real reason instead of guessing, which is
 * the whole argument for failing loudly: an honest failure names the next feature.
 *
 * Depth-capped with a seen-set, because `A extends B extends A` should not hang the audit.
 */
function findPropertyAssignment(index, className, property, seen = new Set()) {
    if (seen.has(className) || seen.size > 6) return null;
    seen.add(className);

    const classFile = index.files.find((f) => new RegExp(`\\bclass\\s+${className}\\b`).test(f.text));
    if (!classFile) return null;

    // ⚠️ `get saveButton(): Locator { ... }` is a definition too. Page objects routinely expose a
    // locator as a getter so it re-queries on each access rather than being captured in the
    // constructor — which is the CORRECT pattern for anything that re-renders.
    // Property assignment, getter, OR a METHOD that returns a locator. `getCartItem(name)` is a
    // perfectly ordinary way to expose a parameterised locator, and treating it as unresolvable
    // would make every list-item and row lookup in every suite `uncertain`.
    const assign = new RegExp(`^\\s*(?:this\\.${property}\\s*=|(?:public\\s+|private\\s+|protected\\s+)?(?:get\\s+)?${property}\\s*\\()`);
    if (!classFile.lines.some((l) => assign.test(l))) {
        const ext = classFile.text.match(new RegExp(`\\bclass\\s+${className}\\s+extends\\s+([A-Z][\\w$]*)`));
        if (ext) {
            const inherited = findPropertyAssignment(index, ext[1], property, seen);
            // Say where it actually came from — "inherited from BasePage" is load-bearing context
            // for a judge, not trivia: it explains why the test file never mentions it.
            if (inherited) return { ...inherited, inheritedFrom: ext[1] };
        }
        return null;
    }
    for (let i = 0; i < classFile.lines.length; i++) {
        if (!assign.test(classFile.lines[i])) continue;
        return { file: classFile.path, line: i + 1, definition: balanced(classFile.lines, i) };
    }
    return null;
}

/** The whole statement, since a locator definition is routinely wrapped across lines. */
function balanced(lines, i) {
    let depth = 0, seen = false;
    const out = [];
    for (let k = i; k < Math.min(i + MAX_DEF_LINES, lines.length); k++) {
        out.push(lines[k]);
        for (const ch of lines[k]) {
            if (ch === '(' || ch === '{') { depth++; seen = true; }
            else if (ch === ')' || ch === '}') depth--;
        }
        if (seen && depth <= 0) break;
        if (!seen && /;\s*$/.test(lines[k])) break;
    }
    return out;
}

/**
 * A member declared by TYPE rather than built with `new`:
 *
 *     export interface Pages { registration: RegistrationPage; signIn: SignInPage; }
 *     class Harness { readonly header: HeaderComponent; }
 *
 * Returned in the same shape as a `new` match so the hop walk does not care which it was.
 */
function findTypeMember(index, containerName, property) {
    const decl = new RegExp(`\\b(?:interface|type|class)\\s+${containerName}\\b`);
    const member = new RegExp(`^\\s*(?:readonly\\s+)?${property}\\s*:\\s*([A-Z][\\w$]*)\\s*;`);
    for (const f of index.files) {
        if (!decl.test(f.text)) continue;
        for (let i = 0; i < f.lines.length; i++) {
            const m = f.lines[i].match(member);
            // Return COORDINATES, not just the type name. The first version returned a bare match
            // array, and the caller then read `.file` off the (null) `new`-lookup result and threw.
            // The declaration site is also genuinely useful context for a judge.
            if (m) return { type: m[1], file: f.path, line: i + 1 };
        }
    }
    return null;
}
