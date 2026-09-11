import {
  ENRICHMENT_SCHEMA_VERSION,
  MAX_ENRICHMENT_BYTES,
  enrichmentIdempotencyKey,
  enrichmentPathFor,
  parseEnrichment,
} from '../storyEnrichmentContract';

/**
 * What a story is allowed to say it learned. The tests that matter are the
 * refusals: a file that could smuggle a conclusion in is a file the platform
 * must not read.
 */

const PROJECT = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

const good = (over: Record<string, unknown> = {}) => JSON.stringify({
  schemaVersion: ENRICHMENT_SCHEMA_VERSION,
  projectId: PROJECT,
  storyId: 'STORY-003',
  projectTruthBaseRevision: 2,
  observedAt: '2026-09-11T12:00:00.000Z',
  sourceCommitSha: 'abc1234',
  factProposals: [
    { dimension: 'integrations', value: 'Reads tickets from the Zendesk API.', evidence: 'src/zendesk/client.ts' },
  ],
  decisions: [{ statement: 'Poll every 5 minutes rather than subscribe.', rationale: 'no webhook access', evidence: 'src/poll.ts' }],
  limitations: [{ statement: 'Attachments over 10MB are skipped.', evidence: 'src/zendesk/client.ts#L40' }],
  demonstrationEvidence: [{ kind: 'test', ref: 'zendesk.client.test.ts' }],
  measurementEvents: [{ name: 'tickets_per_run', value: 12, evidence: 'logs/run-1.json' }],
  ...over,
});

describe('parseEnrichment', () => {
  it('accepts a well-formed file and fills the optional arrays', () => {
    const r = parseEnrichment(good({ demonstrationEvidence: undefined, measurementEvents: undefined }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.storyId).toBe('STORY-003');
      expect(r.event.factProposals[0].classification).toBe('FACT');
      expect(r.event.demonstrationEvidence).toEqual([]);
      expect(r.event.measurementEvents).toEqual([]);
    }
  });

  it('refuses a file that is not JSON, and says so by class', () => {
    const r = parseEnrichment('{ not json');
    expect(r).toMatchObject({ ok: false, error_class: 'NotJson' });
  });

  it('refuses a proposal with no evidence: unevidenced is unfiled', () => {
    const r = parseEnrichment(good({ factProposals: [{ dimension: 'integrations', value: 'Reads Zendesk.' }] }));
    expect(r).toMatchObject({ ok: false, error_class: 'ContractViolation' });
    if (!r.ok) expect(r.reason).toMatch(/factProposals\.0\.evidence/);
  });

  it('refuses a classification stronger than FACT, and any unknown dimension', () => {
    expect(parseEnrichment(good({ factProposals: [{ dimension: 'integrations', value: 'x', evidence: 'y', classification: 'DECISION' }] })).ok).toBe(false);
    expect(parseEnrichment(good({ factProposals: [{ dimension: 'business_impact', value: 'x', evidence: 'y' }] })).ok).toBe(false);
  });

  it('refuses a wrong schema version, a bad story id, and a bad project id', () => {
    expect(parseEnrichment(good({ schemaVersion: '2' })).ok).toBe(false);
    expect(parseEnrichment(good({ storyId: 'story-3' })).ok).toBe(false);
    expect(parseEnrichment(good({ projectId: 'not-a-uuid' })).ok).toBe(false);
  });

  it('refuses an oversized file before parsing it', () => {
    const r = parseEnrichment('x'.repeat(MAX_ENRICHMENT_BYTES + 1));
    expect(r).toMatchObject({ ok: false, error_class: 'TooLarge' });
  });

  it('has no field for results, testimonials, usage or impact', () => {
    // Extra keys are dropped by the schema rather than carried along, so a
    // file cannot ride a conclusion in on an unknown field.
    const r = parseEnrichment(good({ businessImpact: 'saved $40k', results: ['x'] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event).not.toHaveProperty('businessImpact');
      expect(r.event).not.toHaveProperty('results');
    }
  });
});

describe('enrichmentIdempotencyKey', () => {
  const parse = (s: string) => { const r = parseEnrichment(s); if (!r.ok) throw new Error(r.reason); return r.event; };

  it('is stable across key order and a changed timestamp', () => {
    const a = parse(good());
    const b = parse(good({ observedAt: '2026-09-12T00:00:00.000Z' }));
    expect(enrichmentIdempotencyKey(a)).toBe(enrichmentIdempotencyKey(b));
    expect(enrichmentIdempotencyKey(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when a proposal changes, or when the commit does', () => {
    const a = parse(good());
    const b = parse(good({ factProposals: [{ dimension: 'integrations', value: 'Reads tickets from the Zendesk API, hourly.', evidence: 'src/zendesk/client.ts' }] }));
    const c = parse(good({ sourceCommitSha: 'def5678' }));
    expect(enrichmentIdempotencyKey(a)).not.toBe(enrichmentIdempotencyKey(b));
    expect(enrichmentIdempotencyKey(a)).not.toBe(enrichmentIdempotencyKey(c));
  });
});

describe('the path', () => {
  it('lives under .colaberry/enrichment, one file per story', () => {
    expect(enrichmentPathFor('STORY-007')).toBe('.colaberry/enrichment/STORY-007.json');
  });
});
