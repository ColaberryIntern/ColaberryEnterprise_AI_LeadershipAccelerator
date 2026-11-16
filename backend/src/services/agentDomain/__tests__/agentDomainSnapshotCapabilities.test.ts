import { buildAgentDomainSnapshot } from '../agentDomainSnapshot';
import { PROJECTED_CAPABILITY_FIELDS } from '../capabilityProjection';
import type { DomainCapabilityMatrix } from '../capabilityRecord';

/**
 * AF12.5 — the capability records reach the PUBLIC page, which is the only one Mihret has.
 *
 * ## Why the endpoints alone were not the fix
 *
 * The owner decision of 2 Nov 2026, recorded in `agentDomainSnapshot.ts`, is that the Command
 * Center stays a public page in the builder's own repository reading a committed snapshot, and
 * that "a new unauthenticated endpoint would publish agent autonomy levels and tool grants with no
 * session" was rejected deliberately. A public page cannot authenticate. So fixing the two HTTP
 * handlers serves a page that can hold a session, and leaves the page the builders were actually
 * told to build with no source at all.
 *
 * `agentDomainCommandCenterStory.ts` tells every builder this file "carries the data for all six
 * panels". It carried neither panel 2 (the capability inventory) nor panel 4 (per-rung behaviour).
 * `input.matrix` was already an input — `authority[]` is derived from it — so the records were in
 * hand and simply never published.
 */

function matrix(caps: Array<Record<string, unknown>>): DomainCapabilityMatrix {
  return {
    domain_key: 'marketing',
    accountable_human: 'Sohail Syed',
    manager_identity_id: 'om-1',
    researched_at: '2026-10-21',
    capabilities: caps.map((c) => ({
      capability_id: 'marketing.a',
      name: 'A capability',
      business_outcome: 'x',
      intended_users: [],
      classification: 'agent_task',
      source: 'research',
      supporting_evidence: [],
      implementation_state: 'absent',
      requirement_validation_state: 'draft',
      validation_dependency: '',
      inputs: [],
      outputs: [],
      workflow: [],
      exceptions: [],
      dependencies: [],
      application_pages: [],
      apis: [],
      source_modules: [],
      required_tools: [],
      human_decision: false,
      starting_autonomy: 'autonomy:R0',
      max_permitted_autonomy: 'autonomy:R4',
      blocked_by: [],
      release_behaviour: [],
      ...c,
    })),
    legacy_dispositions: [],
  } as unknown as DomainCapabilityMatrix;
}

interface Built {
  capabilities: Array<Record<string, unknown> & {
    capability_id: string;
    release_behaviour: Array<Record<string, unknown>>;
  }>;
  authority: Array<{ capability_id: string }>;
  sources: Record<string, string>;
}

const build = (caps: Array<Record<string, unknown>>) => buildAgentDomainSnapshot({
  domain_key: 'marketing',
  agent: null,
  matrix: matrix(caps),
  governance: [],
}) as unknown as Built;

const cap = (id: string, over: Record<string, unknown> = {}) => ({ capability_id: id, ...over });

describe('the snapshot publishes the records it was already given', () => {
  it('carries a capabilities array', () => {
    const s = build([cap('marketing.a'), cap('marketing.b')]);
    expect(Array.isArray(s.capabilities)).toBe(true);
    expect(s.capabilities).toHaveLength(2);
  });

  it('carries every field panel 2 names, and only those', () => {
    const s = build([cap('marketing.a')]);
    expect(Object.keys(s.capabilities[0]).sort()).toEqual([...PROJECTED_CAPABILITY_FIELDS].sort());
  });

  it('carries per-rung behaviour, the one panel with no other source in the platform', () => {
    const s = build([cap('marketing.a', {
      release_behaviour: [
        { autonomy: 'autonomy:R1', behaviour: 'draft it', acceptance_criteria: 'a human signs' },
      ],
    })]);
    expect(s.capabilities[0].release_behaviour).toEqual([
      { autonomy: 'autonomy:R1', behaviour: 'draft it', acceptance_criteria: 'a human signs' },
    ]);
  });

  it('publishes ALL records with no cap, because a public page has no query string', () => {
    const many = Array.from({ length: 64 }, (_, i) => cap(`marketing.c${i}`));
    expect(build(many).capabilities).toHaveLength(64);
  });

  it('leaks no index-signature extra into a file committed to the builder repository', () => {
    const s = build([cap('marketing.a', {
      pii_exposure: 'high', current_approved_autonomy: 'autonomy:R0', public_facing: true,
    })]);
    expect(s.capabilities[0]).not.toHaveProperty('pii_exposure');
    expect(s.capabilities[0]).not.toHaveProperty('current_approved_autonomy');
    expect(s.capabilities[0]).not.toHaveProperty('public_facing');
  });
});

describe('TWO ORDERS IN ONE FILE, and a page must not join them positionally', () => {
  it('capabilities keep FILE order', () => {
    const s = build([cap('marketing.c'), cap('marketing.a'), cap('marketing.b')]);
    expect(s.capabilities.map((c) => c.capability_id))
      .toEqual(['marketing.c', 'marketing.a', 'marketing.b']);
  });

  it('authority keeps SORTED order, so the two arrays genuinely disagree', () => {
    // Pinned as a pair. `authority[]` has always sorted by `capability_id` and panel 2 requires
    // file order, so a page that read `capabilities[i]` against `authority[i]` would attribute
    // every row past the first difference to the wrong capability. Join on `capability_id`.
    const s = build([cap('marketing.c'), cap('marketing.a'), cap('marketing.b')]);
    expect(s.authority.map((a) => a.capability_id))
      .toEqual(['marketing.a', 'marketing.b', 'marketing.c']);
    expect(s.capabilities.map((c) => c.capability_id))
      .not.toEqual(s.authority.map((a) => a.capability_id));
  });

  it('every capability still has exactly one authority row, so the join is total', () => {
    const s = build([cap('marketing.c'), cap('marketing.a')]);
    const authIds = new Set(s.authority.map((a) => a.capability_id));
    for (const c of s.capabilities) expect(authIds.has(c.capability_id)).toBe(true);
    expect(s.authority).toHaveLength(s.capabilities.length);
  });
});

describe('the sources map stops pointing builders at a 403', () => {
  it('names the route a builder can actually reach', () => {
    // It used to name `GET /api/admin/agent-domains/<key>`, which is `requireSection('program')`.
    // Builders hold `dashboard`. So the field claiming to be their capability source named the
    // exact endpoint that refused them — the 403 Kalkidan Bezabeh reported on 5 Nov.
    const s = build([cap('marketing.a')]);
    expect(s.sources.capabilities).toBe('GET /api/admin/agent-domains-mine/marketing');
    expect(s.sources.capabilities).not.toMatch(/agent-domains\/marketing/);
  });

  it('names the coverage route for the ladder panel too', () => {
    expect(build([cap('marketing.a')]).sources.capability_ladder)
      .toBe('GET /api/admin/agent-domains-mine/marketing/coverage');
  });

  it('EVERY source string ends in -mine, so none of them names a program-gated route', () => {
    // The property, stated as the thing that actually matters rather than as a path shape: a
    // builder holds `dashboard`, and every `-mine` route is reachable with it. A source that did
    // not end in `-mine` would be a 403 described as a source, which is the defect this fixes.
    const sources = build([cap('marketing.a')]).sources;
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(4);
    for (const [name, v] of Object.entries(sources)) {
      expect({ name, v }).toEqual({ name, v: expect.stringMatching(/^GET \/api\/admin\/agent-domain/) });
      expect({ name, endsInMine: v.endsWith('-mine') || v.includes('-mine/') })
        .toEqual({ name, endsInMine: true });
    }
  });
});

describe('adding the records did not add a clock', () => {
  it('no clock-derived key appears at the top level or on a capability', () => {
    // `renderDocs` is explicit: a wall-clock stamp in a file that takes part in the sync
    // comparison turns every sync into a commit whose only change is the time it was written,
    // which breaks the "unchanged implies no commit" guarantee (FR-026).
    const s = build([cap('marketing.a')]) as unknown as Record<string, unknown>;
    const banned = ['captured_at', 'generated_at', 'rendered_at', 'synced_at', 'timestamp'];
    for (const b of banned) expect(Object.keys(s)).not.toContain(b);
    for (const c of (s.capabilities as Array<Record<string, unknown>>)) {
      for (const b of banned) expect(Object.keys(c)).not.toContain(b);
    }
  });

  it('is byte-identical across two builds of the same input', () => {
    // The real guarantee behind FR-026: identical input must serialise identically or the sync
    // commits noise. Asserted on the bytes, not on the keys.
    const caps = [cap('marketing.b'), cap('marketing.a', {
      release_behaviour: [{ autonomy: 'autonomy:R2', behaviour: 'b', acceptance_criteria: 'c' }],
    })];
    expect(JSON.stringify(build(caps))).toBe(JSON.stringify(build(caps)));
  });
});
