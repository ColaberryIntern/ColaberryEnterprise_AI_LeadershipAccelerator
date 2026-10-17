/**
 * M24 - bind the Sales Readiness Score input contract to the real evidence registry.
 *
 * WHAT THIS IS FOR. Part 6 of docs/growth-os-reset/SALES_READINESS_SCORE_CONTRACT.md names, for
 * each input the score consumes, the evidence group that backs it. A document can say that and
 * then quietly stop being true: a group gets renamed or deleted in a refactor, the prose still
 * reads correctly, and the score keeps citing evidence that no longer exists. This test makes
 * that failure loud.
 *
 * THE BINDING IS DELIBERATELY TEXTUAL. `EVIDENCE` in evidenceRegistry.test.ts is not exported,
 * and importing a test file would re-run its suite. Parsing both files also gives the failure
 * mode we actually want: delete `engagement:` from the registry and the contract's claim about
 * `engagement` becomes unbacked, which is the thing M24 asks to be caught.
 *
 * EVERY RULE IS DRIVEN SYNTHETICALLY FIRST. The real files agree by construction the moment the
 * contract is written, so a suite that only reads them cannot show these rules are able to fail.
 * Each rule therefore gets a case that must FAIL and a control that must PASS - an over-refusing
 * check "catches" everything while being no check at all.
 */
import fs from 'fs';
import path from 'path';

const REGISTRY_PATH = path.join(__dirname, 'evidenceRegistry.test.ts');
const CONTRACT_PATH = path.join(
  __dirname, '..', '..', '..', '..', '..',
  'docs', 'growth-os-reset', 'SALES_READINESS_SCORE_CONTRACT.md',
);

/** The governing rule. If it leaves the document, the contract has lost its point. */
const THE_RULE = 'An absent input never scores as zero.';

/** The only verdicts an input may carry. A third value would be an unreviewed state. */
const VERDICTS = ['SAFE', 'EXCLUDED'];

/** Group keys from the `EVIDENCE` map, read as text. */
export function registryGroups(src: string): string[] {
  const start = src.indexOf('const EVIDENCE');
  if (start < 0) return [];
  const end = src.indexOf('};', start);
  if (end < 0) return [];
  const out: string[] = [];
  for (const line of src.slice(start, end).split('\n')) {
    const m = /^ {2}(\w+):\s*'/.exec(line);
    if (m) out.push(m[1]);
  }
  return out.sort();
}

/**
 * Evidence groups named in the Part 6.3 input table.
 *
 * Anchored on the SIX-column shape of that table, so the three-column tables elsewhere in the
 * document (6.6, and Parts 1 to 5) cannot contribute rows. The group is column 2 and must be a
 * single backticked identifier, which a prose cell cannot accidentally satisfy.
 */
export function contractGroups(md: string): string[] {
  const out = new Set<string>();
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    const m = /^`(\w+)`$/.exec(cells[1]);
    if (m) out.add(m[1]);
  }
  return [...out].sort();
}

/** Verdict tokens used in the input table's last column. */
export function contractVerdicts(md: string): string[] {
  const out = new Set<string>();
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    if (!/^`(\w+)`$/.test(cells[1])) continue;
    const m = /\*\*([A-Z]+)\*\*/.exec(cells[5]);
    if (m) out.add(m[1]);
  }
  return [...out].sort();
}

/** Inputs the contract claims evidence for that the registry no longer backs. */
export function lostGroups(contract: readonly string[], registry: readonly string[]): string[] {
  const known = new Set(registry);
  return contract.filter((g) => !known.has(g));
}

describe('M24 - the binding can fail (synthetic)', () => {
  const REGISTRY = [
    "const EVIDENCE: Readonly<Record<string, string>> = {",
    "  journey: 'buildJourney(',",
    "  engagement: 'visitor_sessions',",
    "};",
  ].join('\n');

  const ROW = (group: string, verdict: string) =>
    `| Passive | \`${group}\` | f | M | absent | **${verdict}** |`;

  it('reads the registry and the contract - the control', () => {
    expect(registryGroups(REGISTRY)).toEqual(['engagement', 'journey']);
    const md = [ROW('journey', 'SAFE'), ROW('engagement', 'EXCLUDED')].join('\n');
    expect(contractGroups(md)).toEqual(['engagement', 'journey']);
    expect(lostGroups(contractGroups(md), registryGroups(REGISTRY))).toEqual([]);
  });

  it('CATCHES an input whose evidence group has been deleted from the registry', () => {
    const shrunk = REGISTRY.replace("  engagement: 'visitor_sessions',\n", '');
    expect(registryGroups(shrunk)).toEqual(['journey']);
    const md = [ROW('journey', 'SAFE'), ROW('engagement', 'EXCLUDED')].join('\n');
    expect(lostGroups(contractGroups(md), registryGroups(shrunk))).toEqual(['engagement']);
  });

  it('CATCHES an input whose evidence group has been RENAMED', () => {
    const renamed = REGISTRY.replace('  engagement:', '  siteEngagement:');
    const md = [ROW('engagement', 'EXCLUDED')].join('\n');
    expect(lostGroups(contractGroups(md), registryGroups(renamed))).toEqual(['engagement']);
  });

  it('does NOT harvest groups from a three-column table', () => {
    // 6.6 lists tickets in a narrower table; a row there must never read as an input.
    const md = '| `M22` | open | population |';
    expect(contractGroups(md)).toEqual([]);
  });

  it('does NOT treat a prose cell as a group', () => {
    const md = '| Passive | the `journey` panel and others | f | M | absent | **SAFE** |';
    expect(contractGroups(md)).toEqual([]);
  });

  it('reads the verdict column, and only from input rows', () => {
    const md = [ROW('journey', 'SAFE'), ROW('engagement', 'EXCLUDED')].join('\n');
    expect(contractVerdicts(md)).toEqual(['EXCLUDED', 'SAFE']);
  });
});

describe('M24 - the real contract is bound to the real registry', () => {
  const registrySrc = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const contractMd = fs.readFileSync(CONTRACT_PATH, 'utf8');

  it('parsed both files at all - the no-op guard', () => {
    // A parser that silently returns nothing would make every assertion below vacuous.
    expect(registryGroups(registrySrc).length).toBeGreaterThan(15);
    expect(contractGroups(contractMd).length).toBeGreaterThan(5);
  });

  it('every input the contract names is still a registered evidence group', () => {
    const lost = lostGroups(contractGroups(contractMd), registryGroups(registrySrc));
    expect(lost).toEqual([]);
  });

  it('still states the rule it exists to enforce', () => {
    expect(contractMd).toContain(THE_RULE);
  });

  it('gives every input a reviewed verdict, and no third state', () => {
    const seen = contractVerdicts(contractMd);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((v) => !VERDICTS.includes(v))).toEqual([]);
  });

  it('records the registry size the contract was written against', () => {
    // The contract cites 22. If the registry grows, the new group is an input nobody has
    // classified yet, and Part 6.3 needs a row rather than a silent pass.
    expect(registryGroups(registrySrc)).toHaveLength(22);
    expect(contractMd).toContain('There are **22 registered evidence groups**');
  });
});
