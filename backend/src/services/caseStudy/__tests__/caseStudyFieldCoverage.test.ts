import * as fs from 'fs';
import { publicFields, domainFields, readInterfaceFields } from '../caseStudyFieldContract';
import { build, coveragePath } from '../../../scripts/generateCaseStudyFieldCoverage';

/**
 * THE DRIFT TEST. A field added to the Case Study contract cannot silently
 * remain unmapped.
 *
 * WHY THIS EXISTS. The HTML field map produced for design review stated it was
 * the complete domain map. It listed 59 fields; the contract carries 195. Nobody
 * did anything wrong — a hand-maintained mirror of a type just cannot stay
 * complete, because nothing fails when it falls behind. This test is the thing
 * that fails.
 *
 * THE ASSERTION THAT MATTERS is not "the file parses". It is:
 *   1. every field in the contract has an entry, and
 *   2. no entry is `unreviewed`, and
 *   3. the committed file equals what the generator produces right now.
 *
 * (3) is what stops the file being edited by hand into agreement with itself.
 */

const coverage = () => JSON.parse(fs.readFileSync(coveragePath(), 'utf8'));

describe('Case Study field coverage — drift guard', () => {
  it('reads a NON-TRIVIAL field set from the contract', () => {
    // Non-vacuity first. Every assertion below is satisfied by an empty contract,
    // so a parser that silently returns [] would make this whole file pass while
    // guarding nothing — the exact failure recorded in this repo's memory as
    // "assert the extraction, not just the count".
    const pub = publicFields();
    const dom = domainFields();
    expect(pub.length).toBeGreaterThan(80);
    expect(dom.length).toBeGreaterThan(90);
    // And it found the specific fields the story depends on, by name.
    const names = [...pub, ...dom].map((f) => f.qualified);
    for (const required of [
      'PublicCaseStudyDetail.heroMetrics',
      'PublicCaseStudyDetail.measurement',
      'CaseStudyMeasurementContext.limitations',
      'CaseStudyRepositoryRef.pathScope',
      'CaseStudyVerification.evidenceId',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('gives EVERY contract field an entry', () => {
    const fields = coverage().fields;
    const missing = [...publicFields(), ...domainFields()]
      .map((f) => f.qualified)
      .filter((q) => !(q in fields));
    // The message names the offenders, so the person who added a field is told
    // what to do rather than left to discover this file exists.
    expect(missing).toEqual([]);
  });

  it('leaves NO field unreviewed', () => {
    const unreviewed = Object.entries(coverage().fields as Record<string, { disposition: string }>)
      .filter(([, v]) => v.disposition === 'unreviewed')
      .map(([k]) => k);
    expect(unreviewed).toEqual([]);
  });

  it('matches what the generator produces, so the file cannot be hand-edited', () => {
    // Regenerating and comparing is what makes the other assertions trustworthy:
    // without it, someone could add a field, hand-write an entry saying anything,
    // and the map would agree with itself while disagreeing with the code.
    // Line endings are NORMALISED before comparing. `core.autocrlf` rewrites the
    // committed file to CRLF on checkout on Windows while the generator emits LF,
    // so a raw comparison fails on a difference that is an environment property
    // rather than a content one — and a test that fails for the wrong reason gets
    // disabled rather than fixed.
    const lf = (t: string): string => t.replace(/\r\n/g, '\n');
    const expected = JSON.stringify(build(), null, 2) + '\n';
    expect(lf(fs.readFileSync(coveragePath(), 'utf8'))).toEqual(lf(expected));
  });

  it('never marks an internal-only field as publicly projected', () => {
    // A disposition is a promise about behaviour. This is the one pairing that
    // would be actively dangerous to get wrong.
    for (const [name, e] of Object.entries(coverage().fields as Record<string, {
      disposition: string; publicBehaviour: string; privacy: string;
    }>)) {
      if (e.disposition === 'internal_only') {
        expect(`${name}: ${e.publicBehaviour}`).toMatch(/NEVER projected|not rendered/);
        expect(e.privacy).toBe('internal only');
      }
    }
  });

  it('requires a measurement context wherever a figure is displayed', () => {
    const f = coverage().fields;
    expect(f['CaseStudyMetricEntry.valueDisplay'].emptyBehaviour).toMatch(/never invented/i);
    expect(f['CaseStudyMeasurementContext.limitations'].detailHome).toMatch(/does not show/i);
  });
});

describe('the contract parser refuses shapes it cannot fully see', () => {
  it('reports a nested object literal as ONE field, not as its members', () => {
    // `engagementWindow` is one authoring decision, not four. If the parser
    // flattened it, the coverage file would demand dispositions for members that
    // have no independent authoring story.
    const fields = readInterfaceFields([
      'export interface X {',
      '  readonly a: string;',
      '  readonly nested?: {',
      '    readonly inner: string;',
      '  };',
      '  readonly b: number;',
      '}',
    ].join('\n'), ['X']);
    expect(fields.map((f) => f.field)).toEqual(['a', 'nested', 'b']);
  });

  it('does not leak fields out of an interface it was told to skip', () => {
    const fields = readInterfaceFields([
      'export interface Skipped {',
      '  readonly hidden: string;',
      '}',
      'export interface Wanted {',
      '  readonly shown: string;',
      '}',
    ].join('\n'), ['Wanted']);
    expect(fields.map((f) => f.qualified)).toEqual(['Wanted.shown']);
  });

  it('records optionality, because it decides the empty behaviour', () => {
    const fields = readInterfaceFields([
      'export interface X {',
      '  readonly required: string;',
      '  readonly optional?: string;',
      '}',
    ].join('\n'), ['X']);
    expect(fields.map((f) => f.optional)).toEqual([false, true]);
  });
});
