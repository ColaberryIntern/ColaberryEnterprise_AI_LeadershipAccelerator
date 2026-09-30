import { cloudTerms, tierFor, DEFAULT_CLOUD_FIELDS } from '../StoriesWordCloud';
import { humanizeFacetLabel } from '../storiesV2Model';
import type { CaseStudyFilterGroup } from '../../../components/caseStudy/CaseStudyFilters';

/**
 * The word cloud is a RENDERING of the filter facets, so almost everything worth
 * asserting is about it staying that: same values, same fields, no invented
 * terms, and an order that does not move under the cursor.
 */

const group = (
  field: CaseStudyFilterGroup['field'],
  options: readonly [string, number][],
): CaseStudyFilterGroup => ({
  field,
  legend: field,
  options: options.map(([value, count]) => ({ value, label: value, count })),
}) as CaseStudyFilterGroup;

describe('cloudTerms', () => {
  it('takes only the fields it was asked for, so a control does not become a word', () => {
    const groups = [
      group('stack', [['typescript', 2]]),
      group('verification', [['verified', 2]]),
    ];
    const terms = cloudTerms(groups, DEFAULT_CLOUD_FIELDS);
    expect(terms.map((t) => t.value)).toEqual(['typescript']);
  });

  it('orders by count then alphabetically, so nothing moves between renders', () => {
    const groups = [group('stack', [['react', 1], ['typescript', 5], ['css', 1]])];
    const terms = cloudTerms(groups, ['stack']);
    expect(terms.map((t) => t.value)).toEqual(['typescript', 'css', 'react']);

    // Same input, same output: a cloud that shuffled would move a term under a
    // reader's cursor between renders.
    expect(cloudTerms(groups, ['stack']).map((t) => t.value))
      .toEqual(terms.map((t) => t.value));
  });

  it('drops zero-count terms, which are vocabulary nothing published carries', () => {
    const groups = [group('stack', [['typescript', 2], ['cobol', 0]])];
    expect(cloudTerms(groups, ['stack']).map((t) => t.value)).toEqual(['typescript']);
  });

  it('keeps the facet VALUE untouched, because it is the filter', () => {
    const groups = [group('capability', [['governed-ai-remediation', 1]])];
    expect(cloudTerms(groups, ['capability'])[0].value).toBe('governed-ai-remediation');
  });

  it('returns nothing when a requested field is absent, rather than throwing', () => {
    expect(cloudTerms([], DEFAULT_CLOUD_FIELDS)).toEqual([]);
  });
});

describe('tierFor — weight is legible at every size', () => {
  it('gives the heaviest term the largest tier', () => {
    expect(tierFor(10, 10)).toBe('1.6rem');
  });

  it('keeps a single-record term readable rather than shrinking it away', () => {
    /* THE SMALL-LIBRARY CASE. With two records almost every count is 1. If the
       smallest tier were tiny, a young library would render as a wall of
       near-invisible words - which is most of what there is to show. */
    const smallest = tierFor(1, 40);
    expect(Number.parseFloat(smallest)).toBeGreaterThanOrEqual(0.8);
  });

  it('does not divide by zero when there is nothing to weigh', () => {
    expect(tierFor(0, 0)).toBe('0.86rem');
  });
});

describe('humanizeFacetLabel', () => {
  it('turns a slug into words', () => {
    expect(humanizeFacetLabel('correlated-persisted-audit-trail'))
      .toBe('Correlated persisted audit trail');
  });

  it('capitalises acronyms a reader expects in capitals', () => {
    expect(humanizeFacetLabel('governed-ai-remediation')).toBe('Governed AI remediation');
    expect(humanizeFacetLabel('identity-bound-approvals-with-mfa'))
      .toBe('Identity bound approvals with MFA');
  });

  it('does not sentence-case an acronym that leads', () => {
    expect(humanizeFacetLabel('ai-architecture-training')).toBe('AI architecture training');
  });

  it('uses the casing a brand uses, rather than sentence case', () => {
    expect(humanizeFacetLabel('typescript')).toBe('TypeScript');
    expect(humanizeFacetLabel('javascript')).toBe('JavaScript');
  });

  it('leaves a single ordinary word alone but for its first letter', () => {
    expect(humanizeFacetLabel('python')).toBe('Python');
  });

  it('returns the input unchanged when there is nothing to split', () => {
    expect(humanizeFacetLabel('')).toBe('');
  });
});
