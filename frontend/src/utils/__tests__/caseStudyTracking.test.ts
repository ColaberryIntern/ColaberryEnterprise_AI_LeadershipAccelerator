import {
  ALLOWED_EVENT_DATA_KEYS,
  CASE_STUDY_EVENT_TYPES,
  FORBIDDEN_EVENT_DATA_KEYS,
  sanitizeEventData,
  trackCaseStudyArtifactClick,
  trackCaseStudyCardClick,
  trackCaseStudyCtaClick,
  trackCaseStudyFilter,
  trackCaseStudyRepoClick,
  trackCaseStudyShare,
  trackCaseStudyView,
} from '../caseStudyTracking';
import { trackEvent } from '../tracker';

jest.mock('../tracker', () => ({ trackEvent: jest.fn() }));

const trackEventMock = trackEvent as jest.MockedFunction<typeof trackEvent>;

/**
 * `event_data` carries slugs, categories and counts only (T019 AC5).
 *
 * WHY THE GUARD IS HERE AND NOT ON THE SERVER. `utils/piiRedaction.ts` runs on
 * log lines, not on rows - `recordPageEvent` writes `event_data` to JSONB
 * verbatim, and there is no redaction step anywhere between the request body
 * and the INSERT. Nothing downstream will clean this payload, nothing prunes
 * the table, and `page_events` is the highest-row-count table in the database.
 * Whatever a component passes is what a future analyst reads. That makes the
 * browser the only place the rule can be enforced, so it is enforced with a
 * denylist, a scalar-only filter, and a shape check that does not trust the key
 * name.
 */

beforeEach(() => {
  trackEventMock.mockClear();
  sessionStorage.clear();
});

function payloadOf(call = 0): Record<string, unknown> {
  return trackEventMock.mock.calls[call][1] as Record<string, unknown>;
}

describe('sanitizeEventData - the forbidden-key list (AC5)', () => {
  it('drops every forbidden key', () => {
    const dirty: Record<string, unknown> = { slug: 'a' };
    for (const key of FORBIDDEN_EVENT_DATA_KEYS) dirty[key] = 'value';

    const clean = sanitizeEventData(dirty);

    expect(clean).toEqual({ slug: 'a' });
    for (const key of FORBIDDEN_EVENT_DATA_KEYS) expect(clean).not.toHaveProperty(key);
  });

  it('drops personal data by name', () => {
    expect(sanitizeEventData({ slug: 'a', name: 'Jane Doe', phone: '555-0100' })).toEqual({ slug: 'a' });
  });

  it('drops private repository identity by name', () => {
    expect(
      sanitizeEventData({ slug: 'a', repo_url: 'https://github.com/acme/private', repo_owner: 'acme' }),
    ).toEqual({ slug: 'a' });
  });

  it('is case-insensitive about key names', () => {
    expect(sanitizeEventData({ slug: 'a', Email: 'x@y.com', REPO_URL: 'z' })).toEqual({ slug: 'a' });
  });
});

describe('sanitizeEventData - shape rules the denylist cannot cover (AC5)', () => {
  it('drops anything email-shaped regardless of the key it arrived under', () => {
    // A field called `built_by` holding an address is still an address, and a
    // name-based denylist is blind to it.
    expect(sanitizeEventData({ slug: 'a', built_by: 'jane@example.com' })).toEqual({ slug: 'a' });
  });

  it('drops nested objects and arrays instead of flattening them', () => {
    // Consumers read `event_data->>'key'`, and a nested blob is exactly how
    // unreviewed fields get smuggled into a column nobody sanitises.
    expect(
      sanitizeEventData({ slug: 'a', author: { email: 'x@y.com' }, tags: ['x'], fn: () => 1 }),
    ).toEqual({ slug: 'a' });
  });

  it('keeps slugs, categories, counts and flags', () => {
    expect(
      sanitizeEventData({ slug: 'a', industry: 'Insurance', result_count: 12, featured: true }),
    ).toEqual({ slug: 'a', industry: 'Insurance', result_count: 12, featured: true });
  });

  it('caps string length so body copy cannot be stored as a payload', () => {
    // Uses an ALLOWLISTED key, because the cap only ever applies to keys that
    // survive the allowlist. The original version used `note`, which is exactly
    // the free-text field `event_data` should never carry — under the allowlist
    // it is dropped outright, which is a better outcome than a truncated one.
    const clean = sanitizeEventData({ filter_value: 'x'.repeat(500) });
    expect((clean.filter_value as string).length).toBe(120);
    expect(sanitizeEventData({ note: 'x'.repeat(500) })).toEqual({});
  });

  it('drops null, undefined, empty strings and non-finite numbers', () => {
    expect(
      sanitizeEventData({ slug: 'a', b: null, c: undefined, d: '   ', e: NaN, f: Infinity }),
    ).toEqual({ slug: 'a' });
  });

  it('handles a missing payload', () => {
    expect(sanitizeEventData(undefined)).toEqual({});
  });
});

describe('the allowlist closes the five probes a denylist could not (AC5)', () => {
  /**
   * These are verbatim the payloads independent verification used to defeat the
   * previous denylist. All five were persisted. Each is pinned here so the
   * structure cannot quietly revert to "refuse the names we thought of".
   */
  it('drops a phone number hiding under an innocent key', () => {
    expect(sanitizeEventData({ slug: 'a', contact_ref: '+1-555-867-5309' }))
      .toEqual({ slug: 'a' });
  });

  it('drops a private repository URL hiding under an innocent key', () => {
    // The sharpest of the five: the repo-click emitter is exactly the one a
    // component holding a repository object will call.
    expect(sanitizeEventData({
      slug: 'a', link: 'https://github.com/acme-holdings/project-nightingale',
    })).toEqual({ slug: 'a' });
  });

  it('drops a person name under a key the denylist did not name', () => {
    expect(sanitizeEventData({ slug: 'a', author_name: 'Jane Doe', builder: 'Jane Doe' }))
      .toEqual({ slug: 'a' });
  });

  it('drops an obfuscated address that dodges an @-only check', () => {
    expect(sanitizeEventData({ slug: 'a', source: 'jane(at)example.com' })).toEqual({ slug: 'a' });
    expect(sanitizeEventData({ slug: 'a', source: 'jane%40example.com' })).toEqual({ slug: 'a' });
  });

  it('drops a denylisted key wearing whitespace', () => {
    // `.toLowerCase()` alone let `'email '` through; the normaliser now trims.
    expect(sanitizeEventData({ slug: 'a', 'email ': 'jane', ' phone': '5558675309' }))
      .toEqual({ slug: 'a' });
  });

  it('still keeps everything a Case Study event is actually FOR', () => {
    // Non-vacuity: an allowlist that dropped everything would pass all five
    // tests above and be useless.
    expect(sanitizeEventData({
      slug: 'claims-triage', surface: 'enterprise', industry: 'insurance',
      capability: 'rag', verification: 'verified', verification_method: 'repo',
      filter_key: 'capability', filter_value: 'rag', result_count: 4,
      position: 2, repo_role: 'primary', repo_visibility: 'public',
    })).toEqual({
      slug: 'claims-triage', surface: 'enterprise', industry: 'insurance',
      capability: 'rag', verification: 'verified', verification_method: 'repo',
      filter_key: 'capability', filter_value: 'rag', result_count: 4,
      position: 2, repo_role: 'primary', repo_visibility: 'public',
    });
  });

  it('the two lists never intersect — an overlap is a mistake, not a precedence rule', () => {
    const overlap = ALLOWED_EVENT_DATA_KEYS.filter((k) => FORBIDDEN_EVENT_DATA_KEYS.includes(k));
    expect(overlap).toEqual([]);
  });
});

describe('the emitters use the allowlisted names and sanitise every payload', () => {
  it('sends only names the ingest accepts', () => {
    trackCaseStudyView({ slug: 'a' });
    trackCaseStudyFilter({ filter_key: 'industry', filter_value: 'insurance', result_count: 3 });
    trackCaseStudyCardClick({ slug: 'a', position: 2 });
    trackCaseStudyRepoClick({ slug: 'a', repo_role: 'primary' });
    trackCaseStudyArtifactClick({ slug: 'a', artifact_kind: 'notebook' });
    trackCaseStudyCtaClick({ slug: 'a', cta: 'enterprise' });
    trackCaseStudyShare({ slug: 'a', channel: 'linkedin' });

    const sent = trackEventMock.mock.calls.map((c) => c[0]);
    expect(sent).toEqual([...CASE_STUDY_EVENT_TYPES]);
  });

  it('strips forbidden keys even when a call site passes them', () => {
    // The repo emitter is the likeliest place for this to happen, because the
    // component rendering the link is holding the repo object.
    trackCaseStudyRepoClick({
      slug: 'a',
      repo_role: 'primary',
      repo_visibility: 'public',
      repo_url: 'https://github.com/acme/private',
      repo_owner: 'acme',
    } as any);

    expect(payloadOf()).toEqual({ slug: 'a', repo_role: 'primary', repo_visibility: 'public' });
  });

  it('keeps the counts that make a filter event worth recording', () => {
    trackCaseStudyFilter({ filter_key: 'industry', filter_value: 'insurance', result_count: 0 });
    expect(payloadOf()).toEqual({ filter_key: 'industry', filter_value: 'insurance', result_count: 0 });
  });
});

describe('trackCaseStudyView is guarded against duplicate rows', () => {
  it('fires once per slug per session', () => {
    // The ingest has NO event-level deduplication: every accepted request is an
    // INSERT. A view fired from a render path would write a row per re-render,
    // and React Strict Mode double-invokes effects in development.
    expect(trackCaseStudyView({ slug: 'a' })).toBe(true);
    expect(trackCaseStudyView({ slug: 'a' })).toBe(false);
    expect(trackEventMock).toHaveBeenCalledTimes(1);
  });

  it('still fires for a different Case Study in the same session', () => {
    trackCaseStudyView({ slug: 'a' });
    expect(trackCaseStudyView({ slug: 'b' })).toBe(true);
    expect(trackEventMock).toHaveBeenCalledTimes(2);
  });

  it('does not guard the gesture-driven events, which are real repeat signals', () => {
    trackCaseStudyCtaClick({ slug: 'a', cta: 'enterprise' });
    trackCaseStudyCtaClick({ slug: 'a', cta: 'enterprise' });
    expect(trackEventMock).toHaveBeenCalledTimes(2);
  });
});
