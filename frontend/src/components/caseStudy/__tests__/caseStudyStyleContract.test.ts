import fs from 'fs';
import path from 'path';

/**
 * How the case-study module is allowed to be styled.
 *
 * The surrounding V2 pages use exactly one mechanism: a plain side-effect
 * `import './x.css'` and a `cbv2-` BEM-ish namespace. Three other mechanisms are
 * present elsewhere in this repository - Bootstrap classes in the admin, CSS
 * Modules, inline style objects - and each one that leaks in here costs the
 * module its ability to be restyled from one stylesheet. This file makes the
 * choice enforceable instead of conventional.
 *
 * The namespace check is the load-bearing one: `cbv2-` prefixes are what stop a
 * public-site class from colliding with the portal or the admin shell, which
 * share a document with nothing but their prefixes to separate them.
 */

const DIR = path.join(__dirname, '..');
const CSS = path.join(DIR, 'caseStudy.css');

const sources = fs
  .readdirSync(DIR)
  .filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'))
  .sort();

const read = (file: string): string => fs.readFileSync(path.join(DIR, file), 'utf8');

/**
 * Comments first. Prose in this module is full of apostrophes and backticks, and
 * a literal-extractor run over raw source treats "the gate's fairness" as the
 * start of a string - which turns a passing rule into a random one.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * String literals in a source file, with `${...}` interpolations removed.
 *
 * The closing brace is optional in that pattern on purpose. A literal matcher
 * cuts `` `cbv2-cs-card${className ? ` `` at the second backtick, so the
 * interpolation it captures is unterminated; requiring a `}` leaves the variable
 * NAME behind and the class check then trips over `className` itself.
 */
function classStrings(source: string): string[] {
  const literals = stripComments(source).match(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g) ?? [];
  return literals
    .filter((literal) => literal.includes('cbv2-'))
    .map((literal) => literal.replace(/\$\{[^}]*\}?/g, ' '));
}

describe('the case-study module ships ten components and one stylesheet', () => {
  it('has a component file for every part the pages compose', () => {
    expect(sources).toEqual([
      'CaseStudyArchitecture.tsx',
      'CaseStudyArtifacts.tsx',
      'CaseStudyCTA.tsx',
      'CaseStudyCard.tsx',
      'CaseStudyFilters.tsx',
      'CaseStudyLedger.tsx',
      'CaseStudyMeasurement.tsx',
      'CaseStudyRoadmap.tsx',
      'CaseStudyTimeline.tsx',
      'CaseStudyVerificationBadge.tsx',
    ]);
  });

  it('keeps every component inside the size budget a reader can hold', () => {
    const oversize = sources
      .map((file) => ({ file, lines: read(file).split('\n').length }))
      .filter((entry) => entry.lines >= 300);
    expect(oversize).toEqual([]);
  });
});

describe('one styling mechanism, and it is the one the V2 pages use', () => {
  it('imports the stylesheet as a plain side-effect import', () => {
    for (const file of sources) {
      expect(read(file)).toContain("import './caseStudy.css';");
    }
  });

  it('uses no CSS Modules', () => {
    for (const file of sources) {
      expect(read(file)).not.toMatch(/\.module\.css/);
      expect(read(file)).not.toMatch(/import\s+\w+\s+from\s+['"][^'"]*\.css['"]/);
    }
  });

  it('uses no Bootstrap', () => {
    for (const file of sources) {
      const source = read(file);
      expect(source).not.toMatch(/from\s+['"]bootstrap/);
      expect(source).not.toMatch(/from\s+['"]react-bootstrap/);
      expect(source).not.toMatch(/bootstrap-icons/);
    }
  });

  it('uses no CSS-in-JS and no inline style objects', () => {
    for (const file of sources) {
      const source = read(file);
      expect(source).not.toMatch(/from\s+['"]styled-components['"]/);
      expect(source).not.toMatch(/from\s+['"]@emotion/);
      expect(source).not.toMatch(/style=\{\{/);
    }
  });
});

describe('the cbv2- namespace holds', () => {
  it('names every class in a component with the prefix', () => {
    for (const file of sources) {
      for (const literal of classStrings(read(file))) {
        const tokens = literal.match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? [];
        for (const token of tokens) {
          expect({ file, token }).toEqual({ file, token: expect.stringMatching(/^cbv2-/) });
        }
      }
    }
  });

  it('assigns no className that is outside the namespace', () => {
    for (const file of sources) {
      // A double-quoted className whose value never mentions the prefix.
      expect(read(file)).not.toMatch(/className="(?![^"]*cbv2-)[^"]*"/);
    }
  });

  it('names every selector in the stylesheet with the module prefix', () => {
    const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
    const classes = (css.match(/\.[A-Za-z][A-Za-z0-9_-]*/g) ?? []).map((c) => c.slice(1));
    expect(classes.length).toBeGreaterThan(20);
    for (const name of classes) expect(name).toMatch(/^cbv2-cs-/);
  });
});

describe('nothing here can overflow a 320px viewport', () => {
  const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const declarations = css
    .split(/[;{}]/)
    .map((line) => line.trim())
    .filter((line) => line.includes(':'));

  it('sets no fixed pixel width on anything a reader sees', () => {
    // The one exception is the 1px visually-hidden helper, which is 1px BECAUSE
    // it is not seen.
    const widths = declarations.filter((line) => /^(?:min-|max-)?width\s*:/.test(line));
    const fixed = widths.filter((line) => /\d+px/.test(line) && !/:\s*1px/.test(line));
    expect(fixed).toEqual([]);
  });

  it('gives every grid track a zero floor so a long word cannot widen a column', () => {
    const tracks = declarations.filter((line) => /^grid-template-columns\s*:/.test(line));
    expect(tracks.length).toBeGreaterThan(0);
    for (const track of tracks) {
      const safe = /minmax\(\s*(?:0|min\(100%,)/.test(track) || /minmax\(0,\s*1fr\)/.test(track);
      expect({ track, safe }).toEqual({ track, safe: true });
    }
  });

  it('lets long words break rather than push the page sideways', () => {
    expect(css).toContain('overflow-wrap: anywhere');
  });

  it('leaves reduced-motion users with no animation to endure', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
