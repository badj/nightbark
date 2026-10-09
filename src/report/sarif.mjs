import { gates } from '../gates/index.mjs';
import { irregulars } from '../irregulars/index.mjs';

/**
 * SARIF 2.1.0 output.
 *
 * Per docs/INTEGRATIONS.md this is the highest-leverage thing in the project, and it is one
 * serialiser rather than a connector. Emitting it buys, with no destination-specific code:
 *
 *   - GitHub Code Scanning — findings annotated INLINE ON THE PULL-REQUEST DIFF, which is where a
 *     reviewer already is. A finding on the line that caused it is worth more than the same finding
 *     in a dashboard somebody has to remember to open.
 *   - Azure DevOps, and VS Code's problem matcher.
 *
 * Two deliberate choices worth keeping:
 *
 * `level` is mapped straight from gate severity, because SARIF consumers drive policy off it (a
 * GitHub branch rule can require zero `error`s). Inventing our own scale would make that unusable.
 *
 * Every rule carries `fullDescription` = the gate's `why`. A finding a reader cannot judge gets
 * dismissed or, worse, "fixed" by deleting the assertion — so the reasoning travels with it into
 * whatever tool renders it.
 */

const SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';

export function toSarif({ findings, root, gatesRun = [] }, { version = '0.0.0' } = {}) {
    // Describe ONLY the gates that actually ran. A rules array listing gates that were never
    // executed (because `--gate` narrowed the run, say) invites a reader to assume coverage that was
    // not attempted — and "the rule exists" reading as "the rule was checked" is the same category
    // of mistake this tool reports elsewhere.
    const ran = gates.filter((g) => gatesRun.includes(g.id));
    // ⚠️ An Irregular's findings carry a ruleId too, and a result pointing at a ruleId with no
    // matching rule is invalid SARIF — GitHub ingests it and silently shows nothing, which is a dog
    // that did not bark inside the serialiser. Include any Irregular that actually produced a result.
    const usedIrregulars = irregulars.filter((ir) => findings.some((f) => f.gateId === ir.id));
    const allRules = [...ran, ...usedIrregulars];

    return {
        $schema: SCHEMA,
        version: '2.1.0',
        runs: [{
            tool: {
                driver: {
                    name: 'nightbark',
                    semanticVersion: version,
                    informationUri: 'https://github.com/badj/nightbark',
                    rules: allRules.map((g) => ({
                        id: g.id,
                        name: g.id.replace(/-(\w)/g, (_, c) => c.toUpperCase()),
                        shortDescription: { text: g.title },
                        fullDescription: { text: g.why },
                        defaultConfiguration: { level: g.severity },
                        properties: { kind: g.kind ?? 'file', scope: g.scope ?? 'test-code', origin: usedIrregulars.includes(g) ? 'irregular' : 'gate' },
                    })),
                },
            },
            // Lets a consumer resolve the relative URIs below without guessing.
            originalUriBaseIds: { REPOROOT: { uri: pathToFileUri(root) } },
            results: findings.map((f) => ({
                ruleId: f.gateId,
                level: f.severity,
                message: { text: f.message },
                locations: [{
                    physicalLocation: {
                        artifactLocation: { uri: f.file, uriBaseId: 'REPOROOT' },
                        region: {
                            startLine: Math.max(1, f.line | 0),
                            ...(f.excerpt ? { snippet: { text: f.excerpt } } : {}),
                        },
                    },
                }],
                properties: { origin: f.origin, ...(f.verdict ? { verdict: f.verdict } : {}) },
            })),
        }],
    };
}

/** file:// URI with a trailing slash, which SARIF requires for a base id. */
function pathToFileUri(abs) {
    const p = String(abs ?? '').replace(/\\/g, '/');
    return `file://${p.startsWith('/') ? '' : '/'}${p.replace(/\/?$/, '/')}`;
}
