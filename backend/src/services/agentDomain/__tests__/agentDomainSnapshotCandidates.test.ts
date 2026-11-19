/**
 * The snapshot's new `candidates` section, and the four provenance lines it must not disturb.
 *
 * ## Why the existing `sources` keys are asserted BY NAME
 *
 * Every panel on the Command Center names the endpoint it read, and that line is the only thing a
 * reader can check a number against. A fifth key added carelessly — renaming one, or replacing the
 * object rather than extending it — would leave a panel rendering a figure with no provenance, and
 * nothing else in the repository would notice. AF12.5 is the recorded cost of getting one of these
 * strings wrong: `capabilities` named a `program`-gated route, so it pointed every builder at a
 * 403 while claiming to be their source.
 *
 * ## Why an ABSENT list is not an empty one
 *
 * `verificationSection` set this precedent in its own words: *"Say 'not reported' in words; do not
 * render zero outstanding."* A page that renders "0 candidates" when the platform simply did not
 * supply a list is making a claim nobody checked.
 */

import { buildAgentDomainSnapshot } from '../agentDomainSnapshot';
import type { DomainCapabilityMatrix } from '../capabilityRecord';
import type { CandidateListResult } from '../candidateService';

function matrix(): DomainCapabilityMatrix {
  return {
    domain_key: 'marketing',
    capabilities: [{
      capability_id: 'marketing.a',
      human_decision: false,
      starting_autonomy: 'autonomy:R0',
      max_permitted_autonomy: 'autonomy:R4',
      blocked_by: [],
      release_behaviour: [],
    }],
    legacy_dispositions: [],
  } as unknown as DomainCapabilityMatrix;
}

const build = (candidates?: CandidateListResult) => buildAgentDomainSnapshot({
  domain_key: 'marketing',
  agent: null,
  matrix: matrix(),
  governance: [],
  candidates,
}) as Record<string, Record<string, unknown>>;

const EMPTY: CandidateListResult = {
  candidates: [],
  scoped_to_domains: ['marketing'],
  reason: 'No candidates have been put on the list yet for marketing.',
};

describe('the four existing sources keys are unchanged, and there are now five', () => {
  it('names all five BY NAME, so no panel loses its provenance', () => {
    const { sources } = build();
    expect(Object.keys(sources).sort()).toEqual([
      'agent',
      'candidates',
      'capabilities',
      'capability_ladder',
      'governance',
    ]);
  });

  it('the four that existed before still point at the same endpoints', () => {
    const { sources } = build();
    expect(sources.agent).toBe('GET /api/admin/agent-domains-mine');
    expect(sources.capabilities).toBe('GET /api/admin/agent-domains-mine/marketing');
    expect(sources.capability_ladder).toBe('GET /api/admin/agent-domains-mine/marketing/coverage');
    expect(sources.governance).toBe('GET /api/admin/agent-domain-change-requests-mine');
  });

  it('the new one names a route a BUILDER can actually reach', () => {
    // AF12.5's lesson: `capabilities` once named a `program`-gated route, so it pointed every
    // builder at a 403 while claiming to be their source. This one is on `dashboard`, which is
    // asserted for real in `mgmtSectionGate.candidatePaths.test.ts`.
    const { sources } = build();
    expect(sources.candidates).toBe('GET /api/admin/agent-domain-candidates-mine');
    expect(sources.candidates).toMatch(/-mine$/);
  });

  it('every source is a non-empty GET, so none is a placeholder', () => {
    for (const [key, value] of Object.entries(build().sources)) {
      expect(typeof value).toBe('string');
      expect(String(value)).toMatch(/^GET \/api\/admin\//);
      expect(key).toMatch(/^[a-z_]+$/);
    }
  });
});

describe('the candidates key is always present', () => {
  it('exists even when no list was supplied, rather than being absent', () => {
    const snapshot = build();
    expect(Object.keys(snapshot)).toContain('candidates');
    expect(snapshot.candidates).toBeDefined();
  });

  it('an ABSENT list says so in words and does not render zero', () => {
    const section = build().candidates;
    expect(section.known).toBe(false);
    expect(String(section.note)).toMatch(/did not supply/);
    expect(section.summary).toBeUndefined();
    expect(section.candidates).toEqual([]);
  });

  it('an EMPTY list is a different answer: known, zero, and with a reason', () => {
    const section = build(EMPTY).candidates;
    expect(section.known).toBe(true);
    expect((section.summary as Record<string, number>).candidates).toBe(0);
    expect(String(section.reason)).toMatch(/No candidates have been put on the list/);
    expect(section.scoped_to_domains).toEqual(['marketing']);
  });

  it('the two cases are genuinely distinguishable by a reader', () => {
    // If `known` read the same either way, a page could not tell "nobody proposed anything" from
    // "the platform did not tell us", which is the whole point of the section's shape.
    expect(build().candidates.known).not.toBe(build(EMPTY).candidates.known);
  });
});

describe('the snapshot stays deterministic and carries no clock', () => {
  it('serialises byte-identically when built twice with the same input', () => {
    expect(JSON.stringify(build(EMPTY))).toBe(JSON.stringify(build(EMPTY)));
  });

  it('the candidates section adds no timestamp field', () => {
    // The file's own `staleness_note` explains why: a clock here would make every sync commit a
    // file whose only change is the time.
    const section = build(EMPTY).candidates;
    for (const key of Object.keys(section)) {
      expect(key).not.toMatch(/captured_at|generated_at|as_of|timestamp/);
    }
  });
});
