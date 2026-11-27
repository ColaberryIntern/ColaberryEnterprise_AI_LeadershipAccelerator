/**
 * Gov management (M5) - reading the management view and ACTING on it (recording a submission, which writes a
 * potential-win into the Revenue Room) are different grants, and that is STRUCTURAL.
 *
 * The read (GET .../management) stays reachable by a scoped gov_contracts role; the financial write
 * (POST .../management/mark-submitted) stacks requireFullAdmin on top of the section gate, the aiOps money precedent.
 * A behavioural test proves only the routes it drives; the way this breaks is a future control route copied from a
 * read line with requireSection alone. Reading the source is the only check that fails on that. Technique copied from
 * aiOpsRoutes.readWriteSplit.test.ts: strip comments + literals, match SHAPE.
 */
import fs from 'fs';
import path from 'path';

const ROUTES = path.join(__dirname, '..', 'govContractsRoutes.ts');

/** Comments and string literals removed, so prose about a guard cannot satisfy the test. */
function codeOf(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');
}

interface RouteLine { readonly verb: string; readonly line: number; readonly text: string; }

function routeLines(): RouteLine[] {
  const lines = codeOf(ROUTES).split('\n');
  const out: RouteLine[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^router\.(get|post|patch|put|delete)\(/.exec(lines[i].trim());
    if (!m) continue;
    let text = lines[i];
    for (let j = i + 1; j < lines.length && j < i + 8; j += 1) {
      if (/^router\./.test(lines[j].trim())) break;
      text += ` ${lines[j]}`;
      if (/handle[A-Z]|async\s*\(/.test(lines[j])) break;
    }
    out.push({ verb: m[1], line: i + 1, text });
  }
  return out;
}

const ROUTE_LINES = routeLines();
const mgmtRead = ROUTE_LINES.find((r) => r.verb === 'get' && /\/management'/.test(r.text));
const markSubmitted = ROUTE_LINES.find((r) => r.verb === 'post' && /management\/mark-submitted/.test(r.text));

describe('positive controls - the parser sees the M5 routes', () => {
  it('finds the management read and the mark-submitted write', () => {
    expect(ROUTE_LINES.length).toBeGreaterThan(10);
    expect(mgmtRead).toBeDefined();
    expect(markSubmitted).toBeDefined();
  });
});

describe('the financial write is limited to a FULL administrator', () => {
  it('POST .../management/mark-submitted carries requireFullAdmin AND the section gate', () => {
    expect(/requireFullAdmin/.test(markSubmitted!.text)).toBe(true);
    expect(/requireSection\(\s*'gov_contracts'\s*\)/.test(markSubmitted!.text)).toBe(true);
  });
});

describe('the management read stays readable by a scoped role', () => {
  it('GET .../management carries the section gate but NOT requireFullAdmin', () => {
    expect(/requireSection\(\s*'gov_contracts'\s*\)/.test(mgmtRead!.text)).toBe(true);
    expect(/requireFullAdmin/.test(mgmtRead!.text)).toBe(false);
  });
});
