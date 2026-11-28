/**
 * The directive and the constants say the same numbers.
 *
 * `directives/demo-visual-rules.md` is what a person reads to learn what the demo draws and why.
 * The engine reads `visualRules.ts`. Typed twice, they drift, and within a release the directive
 * becomes a description of what the engine used to do, which is worse than having no directive
 * because it is quoted in reviews.
 *
 * So the table in that document is parsed here and compared, in BOTH directions: every constant
 * must appear in the document, and every number the document states must match the constant. A
 * one-way check would pass a directive that quietly dropped a rule.
 */
import fs from 'fs';
import path from 'path';
import * as rules from '../demoVisual/visualRules';

const DIRECTIVE = path.join(__dirname, '..', '..', '..', '..', '..', 'directives', 'demo-visual-rules.md');

/** The numeric constants the directive is required to quote. Derived, not retyped. */
const NUMERIC_CONSTANTS = Object.entries(rules)
  .filter(([, v]) => typeof v === 'number')
  .sort(([a], [b]) => a.localeCompare(b)) as Array<[string, number]>;

function directiveText(): string {
  return fs.readFileSync(DIRECTIVE, 'utf8');
}

/** Rows look like: | `MIN_BAR_ROWS` | 3 | what it governs | */
function statedValues(text: string): Map<string, number> {
  const out = new Map<string, number>();
  const row = /^\|\s*`([A-Z_]+)`\s*\|\s*(-?\d+)\s*\|/gm;
  let m: RegExpExecArray | null = row.exec(text);
  while (m) {
    out.set(m[1], Number(m[2]));
    m = row.exec(text);
  }
  return out;
}

describe('the visual rules directive matches the code', () => {
  it('the directive exists and there are constants to check, so the sweep cannot pass on nothing', () => {
    expect(fs.existsSync(DIRECTIVE)).toBe(true);
    expect(NUMERIC_CONSTANTS.length).toBeGreaterThanOrEqual(10);
    expect(statedValues(directiveText()).size).toBeGreaterThanOrEqual(10);
  });

  it('states every numeric constant the engine obeys', () => {
    const stated = statedValues(directiveText());
    const missing = NUMERIC_CONSTANTS.map(([name]) => name).filter((name) => !stated.has(name));
    expect(missing).toEqual([]);
  });

  it('states the SAME value for each one', () => {
    const stated = statedValues(directiveText());
    const wrong = NUMERIC_CONSTANTS
      .filter(([name, value]) => stated.get(name) !== value)
      .map(([name, value]) => ({ name, code: value, directive: stated.get(name) }));
    expect(wrong).toEqual([]);
  });

  it('quotes no constant the code does not define', () => {
    // The other direction. A renamed constant would otherwise leave a stale row behind that reads
    // like a rule the engine follows.
    const known = new Set(NUMERIC_CONSTANTS.map(([name]) => name));
    const unknown = [...statedValues(directiveText()).keys()].filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
  });

  it('names every visual the plan can ask for, so the document lists them all', () => {
    const text = directiveText();
    // Asserted on the TOKEN, in the directive's vocabulary table. An earlier version accepted the
    // prose form too ("path of steps" for `step_path`), which meant the document could describe a
    // picture without ever naming the thing the code asks for, and a renamed kind would still
    // pass on an unrelated sentence.
    const missing = rules.VISUAL_KINDS.filter((kind) => !text.includes(`\`${kind}\``));
    expect(missing).toEqual([]);
  });
});
