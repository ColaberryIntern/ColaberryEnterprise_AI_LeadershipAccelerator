import fs from 'fs';
import os from 'os';
import path from 'path';
import { stripComments, readNormalised, readCode, codeIndexOf } from './sourceSweep';

/**
 * A CONTROL ON THE CONTROL.
 *
 * Every sweep in this subsystem rests on `stripComments` and `readNormalised`. If either is
 * wrong, every suite built on it reports a green it has not earned — and that is not
 * hypothetical here twice over:
 *
 *   - Phase 5 lost a grading to a sweep satisfiable by a comment, and then to the FIX for it,
 *     which was anchored on LF while the file on disk was CRLF. It stripped nothing and reported
 *     a misleading green.
 *   - This session shipped three controls that turned out to be decorative, each caught only by
 *     deliberately testing the control itself: a type-level exhaustiveness check that passed with
 *     an unaccounted field added, a whole-prompt length proxy, and an absence test defeated by a
 *     default parameter.
 *
 * So the apparatus gets its own tests, including a NEGATIVE one: text that SHOULD survive
 * stripping has to survive, or a stripper that blanked everything would satisfy every
 * "no match found" assertion in the repo.
 */

const tmp = (name: string, body: string) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-')), name);
  fs.writeFileSync(f, body);
  return f;
};

describe('stripComments removes prose and keeps code', () => {
  it('blanks a line comment, and the CODE on the same line survives', () => {
    const out = stripComments('const a = 1; // Project.create( in a comment\nconst b = 2;');
    expect(out).toContain('const a = 1;');
    expect(out).toContain('const b = 2;');
    expect(out).not.toContain('Project.create(');
  });

  it('blanks a block comment spanning lines', () => {
    const out = stripComments('before\n/**\n * Project.create( in a docblock\n */\nafter');
    expect(out).not.toContain('Project.create(');
    expect(out).toContain('before');
    expect(out).toContain('after');
  });

  it('PRESERVES length and line count, so reported line numbers stay true', () => {
    // The reason comments are blanked rather than deleted. A sweep that reports `file:line` is
    // useless if stripping shifted the lines.
    const src = 'a\n// Project.create( here\nb\n/* and\n   here */\nc';
    const out = stripComments(src);
    expect(out).toHaveLength(src.length);
    expect(out.split('\n')).toHaveLength(src.split('\n').length);
  });

  it('THE NEGATIVE CONTROL: code that should survive, survives', () => {
    // Without this, a stripper that blanked the whole file would pass every assertion above and
    // every "no match found" assertion in every suite that uses it.
    const src = 'await Project.create({ id });\nhooks: { afterCreate: x },';
    expect(stripComments(src)).toBe(src);
  });

  it('PINS THE MEASURED LIMITATION: a colon-less // is a comment, wherever it appears', () => {
    // The SCHEME of a URL survives, because `(^|[^:])` stops `://` being read as a comment.
    const survives = [
      "const u = 'https://example.com/p';",
      "const o = { u: 'http://x.com' };",
    ];
    for (const src of survives) expect(stripComments(src)).toBe(src);

    // But a LATER colon-less `//` in the same string is blanked. This is the case that
    // distinguishes the precise claim from the loose one, and it is the case I got wrong by
    // probing only a URL with no second `//` and concluding the whole limitation was false.
    // `lifecycleRegistrationCoverage` had pinned it correctly all along.
    const partial = stripComments("const u = 'https://example.com/a//b';");
    expect(partial).toContain("'https://example.com/a");
    expect(partial).not.toContain("//b");

    // Fully mangled: no colon in front of the slashes at all, in a string or a regex.
    const mangled = [
      "const s = 'a // b';",
      "const p = '//shared/path';",
      'const r = /a//b/;',
    ];
    for (const src of mangled) {
      const out = stripComments(src);
      expect(out).not.toBe(src);
      // Length is preserved even when content is lost, so reported line numbers stay true.
      expect(out).toHaveLength(src.length);
    }
  });
});

describe('readNormalised makes line-oriented regexes safe', () => {
  it('converts CRLF to LF, which is the failure that cost a grading', () => {
    const f = tmp('crlf.ts', 'const a = 1;\r\n// Project.create(\r\nconst b = 2;\r\n');
    const text = readNormalised(f);
    expect(text).not.toContain('\r');
    expect(text.split('\n')).toHaveLength(4);
  });

  it('readCode strips comments from a CRLF file, which the LF-anchored version did not', () => {
    // The exact compound failure: a stripper anchored on LF, run over a CRLF file, no-ops.
    const f = tmp('crlf2.ts', 'const a = 1;\r\n/* Project.create( */\r\nconst b = 2;\r\n');
    const code = readCode(f);
    expect(code).not.toContain('Project.create(');
    expect(code).toContain('const a = 1;');
    expect(code).toContain('const b = 2;');
  });
});

describe('codeIndexOf supports ORDER claims, not just presence', () => {
  it('reports positions so a caller can assert one thing precedes another', () => {
    // "The guard is called" and "the guard is called before the row is returned" are different
    // claims, and only the second rules out a guard that runs too late to matter.
    const code = 'const row = find();\nawait guard(row);\nreturn row;';
    expect(codeIndexOf(code, 'guard(')).toBeGreaterThan(codeIndexOf(code, 'find()'));
    expect(codeIndexOf(code, 'guard(')).toBeLessThan(codeIndexOf(code, 'return row;'));
  });

  it('returns -1 for an absent symbol rather than throwing', () => {
    // A sweep that threw on an absent symbol could not distinguish "not there" from "broken".
    expect(codeIndexOf('const a = 1;', 'guard(')).toBe(-1);
  });
});
