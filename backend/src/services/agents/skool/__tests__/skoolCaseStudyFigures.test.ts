import fs from 'fs';
import path from 'path';
import { getCaseStudies } from '../skoolPlatformStrategy';

/**
 * The Skool case-study entries must not assert figures nothing backs.
 *
 * WHY THIS EXISTS. These three entries carried seven specific numbers — annual
 * savings, a vehicle count, a deploy time, a throughput, an accuracy
 * percentage, a member count and a call-volume reduction. Nothing backed any of
 * them. They reached prospects as prose inside a generated comment, which is
 * exactly why the publish gate that governs figures on Case Studies never saw
 * them: that gate guards `case_study_metrics`, and none of these had a row.
 *
 * The rule the business now holds itself to is that a published figure traces to
 * something a reader could check. If one of these engagements gets a measured
 * metric, the number can come back — sourced from the record rather than from a
 * hand-edited array, which is the difference this test protects.
 *
 * SECOND REASON, already noted at the call site: quoting branded dollar amounts
 * and unit counts fingerprints the company and gets the comment moderated as
 * self-promotion. One change serves both.
 */

const SOURCE = path.join(__dirname, '..', 'skoolPlatformStrategy.ts');
const source = fs.readFileSync(SOURCE, 'utf8');

/** A currency amount, a percentage, or a bare count of three or more digits. */
const FIGURE = /\$\s?[\d,]+(?:\.\d+)?\s?[KMB]?|\b\d+(?:\.\d+)?\s?%|\b\d{3,}\b/;

describe('Skool case studies carry no unbacked figures', () => {
  const studies = getCaseStudies();

  it('exposes the three entries, so the checks below are not vacuous', () => {
    // Without this, an empty array would satisfy every assertion in the file.
    expect(studies).toHaveLength(3);
    expect(studies.map((s) => s.name)).toEqual([
      'Logistics route planning', 'Invoice processing', 'Storm response',
    ]);
  });

  it.each([
    ['stat' as const],
    ['detail' as const],
  ])('states no figure in any %s', (field) => {
    const offenders = studies
      .filter((s) => FIGURE.test(s[field]))
      .map((s) => `${s.name}: ${s[field]}`);
    expect(offenders).toEqual([]);
  });

  it('does not reintroduce any of the seven figures that were removed', () => {
    // Named individually because these are the specific claims that went out to
    // prospects, and a future edit is most likely to restore them verbatim.
    for (const figure of [
      '$1.2M', '200+ vehicles', '200 vehicles', '11 days',
      '200 invoices', '97%', '42,000', '60% fewer',
    ]) {
      expect(source).not.toContain(figure);
    }
  });

  it('still forbids the model from citing figures, without naming any', () => {
    // The prohibition is load bearing and must survive. But it must not list the
    // values: naming a forbidden number puts it back into the model's context,
    // which is the one route by which a removed figure can still be echoed.
    expect(source).toContain('Do NOT cite company case-study figures');
    const bans = source.split('\n').filter((l) => l.includes('Do NOT cite company case-study figures'));
    expect(bans.length).toBeGreaterThanOrEqual(3);
    for (const ban of bans) expect(ban).not.toMatch(FIGURE);
  });
});
