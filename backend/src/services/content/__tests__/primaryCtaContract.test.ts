import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { FREE_WORD_RULE } from '../bannedCopyRule';

/**
 * The primary call to action has ONE declaration, and the approved phrasings on both sides of
 * the stack agree.
 *
 * ## Why this is a test and not a convention
 *
 * C5.12's finding was not that the CTA label was wrong. It was that "change the call to
 * action" meant finding five strings across three files, because `constants/index.ts` and
 * `components/membership/personaContent.ts` each declared a constant named `PRIMARY_CTA`
 * meaning different things, and `config/v2Pricing.ts` carried three more CTA strings. A
 * refactor fixes that once; only a test keeps it fixed. The specific regression this blocks is
 * someone adding a second `const PRIMARY_CTA` rather than importing the one that exists —
 * which is exactly how the first collision arrived.
 *
 * ## Why it lives in the backend suite
 *
 * Two reasons, and the first is the binding one:
 *
 *   - It has to compare a FRONTEND constant against `FREE_WORD_RULE`, which lives in the
 *     backend tree. A frontend test cannot reach across `rootDir` to import it, so the
 *     assertion would have to be written as a hardcoded copy of the list it is meant to be
 *     checking — which checks nothing.
 *   - The precedent already exists: `frontendCopyLint.test.ts` in this same directory reads
 *     `frontend/src` off disk for the same reason, through the same parser.
 *
 * ## Why the parser and not an import
 *
 * `frontend/src/config/primaryCta.ts` is outside `backend/tsconfig.json`'s include, so
 * requiring it here would resolve through ts-jest against the wrong config. Reading the source
 * and parsing it is both cheaper and more honest about what is being asserted: the DECLARATION
 * in the file, not a value that survived a module graph.
 *
 * ## The failure that must not happen
 *
 * Silently reading nothing. A moved or renamed file would make every "no second declaration"
 * assertion trivially true, so the file's existence and its own declaration are asserted FIRST
 * and the rest is only believed afterwards. That failure mode is not hypothetical here: it is
 * the one recorded in `frontendCopyLint.test.ts`, whose first draft scanned 1 value instead of
 * 77 and reported clean.
 */

/** `__tests__` -> content -> services -> src -> backend -> repo root. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const CTA_MODULE = 'frontend/src/config/primaryCta.ts';
const CONSTANTS_MODULE = 'frontend/src/constants/index.ts';

const read = (relative: string): string =>
  fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');

const parse = (relative: string, source: string): ts.SourceFile =>
  ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** Every `const <name> = ...` declared at any depth, as name -> count. */
function constDeclarationCounts(sf: ts.SourceFile): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const n = node.name.text;
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return counts;
}

/** The string literals of an exported `readonly string[]` / array initializer, by name. */
function stringArrayLiteral(sf: ts.SourceFile, name: string): string[] | null {
  let found: string[] | null = null;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      found = node.initializer.elements
        .filter(ts.isStringLiteral)
        .map((e) => e.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** The string-valued properties of an exported object literal, by constant name. */
function objectLiteralStrings(sf: ts.SourceFile, name: string): Record<string, string> | null {
  let found: Record<string, string> | null = null;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      const out: Record<string, string> = {};
      for (const p of node.initializer.properties) {
        if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && ts.isStringLiteral(p.initializer)) {
          out[p.name.text] = p.initializer.text;
        }
      }
      found = out;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** Every `.ts`/`.tsx` file under `frontend/src`, excluding tests and declarations. */
function frontendSources(): string[] {
  const root = path.join(REPO_ROOT, 'frontend', 'src');
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (
        (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
        !entry.name.endsWith('.d.ts') &&
        !/\.(test|spec)\.tsx?$/.test(entry.name)
      ) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

describe('the primary call to action has one declaration', () => {
  // ---- asserted first: nothing below is believable if the file is not there ----
  it('actually reads the CTA module, and it declares PRIMARY_CTA', () => {
    const source = read(CTA_MODULE);
    expect(source.length).toBeGreaterThan(200);
    const counts = constDeclarationCounts(parse(CTA_MODULE, source));
    expect(counts.get('PRIMARY_CTA')).toBe(1);
  });

  it('declares the CTA as a path, a label and supporting text', () => {
    const sf = parse(CTA_MODULE, read(CTA_MODULE));
    const cta = objectLiteralStrings(sf, 'PRIMARY_CTA');
    expect(cta).not.toBeNull();
    expect(Object.keys(cta as Record<string, string>).sort()).toEqual([
      'label',
      'path',
      'supportingText',
    ]);
    expect((cta as Record<string, string>).path).toMatch(/^\//);
    expect((cta as Record<string, string>).label.trim().length).toBeGreaterThan(0);
  });

  it('is the ONLY file under frontend/src that declares a PRIMARY_CTA constant', () => {
    const sources = frontendSources();
    // The floor guards the walk: a path that resolved to nothing would make this pass.
    expect(sources.length).toBeGreaterThan(300);

    const declaringFiles = sources.filter((full) => {
      const counts = constDeclarationCounts(parse(full, fs.readFileSync(full, 'utf8')));
      return (counts.get('PRIMARY_CTA') ?? 0) > 0;
    });

    const relative = declaringFiles
      .map((f) => path.relative(REPO_ROOT, f).split(path.sep).join('/'))
      .sort();
    expect(relative).toEqual([CTA_MODULE]);
  });

  it('re-exports from constants rather than redeclaring, so importers are unchanged', () => {
    const source = read(CONSTANTS_MODULE);
    // A re-export, not a second declaration.
    expect(source).toMatch(/export\s*\{[^}]*\bPRIMARY_CTA\b[^}]*\}\s*from\s*['"]\.\.\/config\/primaryCta['"]/);
    const counts = constDeclarationCounts(parse(CONSTANTS_MODULE, source));
    expect(counts.get('PRIMARY_CTA')).toBeUndefined();
  });
});

describe('the approved phrasings agree across the stack', () => {
  it('matches FREE_WORD_RULE.approvedAlternatives exactly', () => {
    const sf = parse(CTA_MODULE, read(CTA_MODULE));
    const phrasings = stringArrayLiteral(sf, 'APPROVED_OFFER_PHRASINGS');
    expect(phrasings).not.toBeNull();
    expect(phrasings).toEqual([...FREE_WORD_RULE.approvedAlternatives]);
  });

  it('CONTROL: the rule it is compared against is non-empty', () => {
    // Were the rule empty, the assertion above would pass against an empty list and the
    // duplication would be unchecked in the one direction that matters.
    expect(FREE_WORD_RULE.approvedAlternatives.length).toBeGreaterThan(0);
    expect(FREE_WORD_RULE.word).toBe('free');
  });

  it('NEGATIVE CONTROL: the parser helpers return null for a name that is absent', () => {
    const sf = parse(CTA_MODULE, read(CTA_MODULE));
    expect(stringArrayLiteral(sf, 'NO_SUCH_CONSTANT')).toBeNull();
    expect(objectLiteralStrings(sf, 'NO_SUCH_CONSTANT')).toBeNull();
  });
});
