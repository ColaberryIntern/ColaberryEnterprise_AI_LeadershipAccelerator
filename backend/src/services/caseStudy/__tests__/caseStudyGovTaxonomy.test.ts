/**
 * caseStudyGovTaxonomy - the two Government-chapter facets, read off a snapshot.
 *
 * Both fields arrive through `POST /overrides` with `value: z.unknown()`, so the
 * readers are the only validation these values ever get. Every case below is a
 * shape a real override could carry: an array of anything, a string in the wrong
 * case, a value of the wrong type, and the one that matters most - a value that
 * LOOKS like a member but is not one.
 */
import { readDeliveryContext, readGovCapabilities } from '../caseStudyGovTaxonomy';
import { CASE_STUDY_GOV_CAPABILITIES } from '../../../types/caseStudy';

describe('readGovCapabilities', () => {
  it('returns [] for absent, non-array and empty input', () => {
    expect(readGovCapabilities(undefined)).toEqual([]);
    expect(readGovCapabilities(null)).toEqual([]);
    expect(readGovCapabilities('ai-strategy-readiness')).toEqual([]);
    expect(readGovCapabilities({})).toEqual([]);
    expect(readGovCapabilities([])).toEqual([]);
  });

  it('accepts every catalog member and nothing else', () => {
    expect(readGovCapabilities([...CASE_STUDY_GOV_CAPABILITIES])).toEqual([...CASE_STUDY_GOV_CAPABILITIES]);
    expect(readGovCapabilities(['ai-strategy-readiness', 'blockchain', 42, null, 'AI'])).toEqual([
      'ai-strategy-readiness',
    ]);
  });

  it('normalises spelling and returns catalog order, deduped, whatever order was written', () => {
    expect(readGovCapabilities([
      'AI Workforce Enablement', 'ai_strategy_readiness', 'ai-workforce-enablement ',
    ])).toEqual(['ai-strategy-readiness', 'ai-workforce-enablement']);
  });
});

describe('readDeliveryContext', () => {
  it('returns null for absent, non-string and unknown input - unknown keeps a record OFF the chapter', () => {
    expect(readDeliveryContext(undefined)).toBeNull();
    expect(readDeliveryContext(null)).toBeNull();
    expect(readDeliveryContext(['client_delivery'])).toBeNull();
    expect(readDeliveryContext('past_performance')).toBeNull();
    expect(readDeliveryContext('')).toBeNull();
  });

  it('accepts the three members, forgiving case and whitespace only', () => {
    expect(readDeliveryContext('client_delivery')).toBe('client_delivery');
    expect(readDeliveryContext(' Internal_Platform ')).toBe('internal_platform');
    expect(readDeliveryContext('capability_demonstration')).toBe('capability_demonstration');
  });

  it('does NOT slug-normalise: the members use underscores and a hyphenated spelling is a miss', () => {
    // `normalizeFacetSlug` would turn this into `client-delivery`, which is not a
    // member. The reader must not route through it, or every real value misses.
    expect(readDeliveryContext('client-delivery')).toBeNull();
  });
});
