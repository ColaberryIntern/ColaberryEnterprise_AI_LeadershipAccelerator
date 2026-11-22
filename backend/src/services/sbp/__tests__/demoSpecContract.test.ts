/**
 * demo-spec v2: shape and content.
 *
 * Both directions are asserted throughout. A validator that only ever rejects is as useless as
 * one that only ever accepts, and "one-way tests" is the failure this repo keeps rediscovering.
 */
import {
  ACTION_LIFECYCLE,
  DEMO_ENVIRONMENTS,
  validateDemoSpecShape,
  isDemoSpecShapeValid,
} from '../demoSpec/contract';
import {
  ALLOWED_SPEC_KEYS,
  RESTRICTED_PROJECT_FIELDS,
  checkDemoSpecContent,
  isDemoSpecContentClean,
} from '../demoSpec/contentPolicy';

/** A minimal VALID v2 event, so each test mutates exactly one thing away from valid. */
function validEvent(over: Record<string, unknown> = {}) {
  return {
    event_id: 'evt_1',
    occurred_at: '2026-11-20T16:10:00Z',
    work_id: 'work_1',
    trace_id: 'trace_1',
    parent_event_id: null,
    actor: { type: 'agent', id: 'agent_compliance', label: 'Compliance Checker', verified: false },
    human_owner_id: 'human_1',
    action: 'Check overtime eligibility',
    status: 'awaiting' in over ? 'proposed' : 'succeeded',
    risk_level: 'high',
    autonomy_tier: 'A2',
    reason_summary: 'The shift would exceed the configured overtime threshold',
    evidence_refs: ['evidence_1'],
    policy_refs: ['policy_ot'],
    approval: { required: true, status: 'pending', assigned_to: 'human_1' },
    side_effects: [],
    reversible: true,
    recovery_ref: null,
    environment: 'demo',
    ...over,
  };
}

function validSpec(over: Record<string, unknown> = {}) {
  return {
    schema_version: 2,
    environment: 'demo',
    app: { name: 'ShiftFill', descriptor: 'shift coverage', persona: { name: 'Dana', role: 'Office manager' } },
    events: [validEvent()],
    ...over,
  };
}

describe('demo-spec v2 shape: the happy path really is valid', () => {
  it('accepts a well-formed spec', () => {
    expect(validateDemoSpecShape(validSpec())).toEqual([]);
    expect(isDemoSpecShapeValid(validSpec())).toBe(true);
  });

  it.each(ACTION_LIFECYCLE)('accepts lifecycle state %s', (status) => {
    expect(validateDemoSpecShape(validSpec({ events: [validEvent({ status })] }))).toEqual([]);
  });

  it.each(DEMO_ENVIRONMENTS)('accepts environment %s', (environment) => {
    const spec = validSpec({ environment, events: [validEvent({ environment })] });
    expect(validateDemoSpecShape(spec)).toEqual([]);
  });
});

describe('demo-spec v2 shape: what it refuses', () => {
  it('REFUSES the v1 flat who field and names the missing actor', () => {
    const v1Event: Record<string, unknown> = validEvent();
    delete v1Event.actor;
    delete v1Event.human_owner_id;
    v1Event.who = 'agent';

    const problems = validateDemoSpecShape(validSpec({ events: [v1Event] }));
    expect(problems.length).toBeGreaterThan(0);
    const paths = problems.map((p) => p.path).join(' ');
    expect(paths).toContain('actor');
    expect(paths).toContain('human_owner_id');
  });

  it('REFUSES status "done", which is not a lifecycle member', () => {
    const problems = validateDemoSpecShape(validSpec({ events: [validEvent({ status: 'done' })] }));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.map((p) => p.path).join(' ')).toContain('status');
  });

  it('REFUSES environment "production": a demo may never describe itself as live', () => {
    const problems = validateDemoSpecShape(validSpec({ environment: 'production' }));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.map((p) => p.path).join(' ')).toContain('environment');
  });

  it('REFUSES an event missing its causal fields, so a handoff cannot be untraceable', () => {
    const e: Record<string, unknown> = validEvent();
    delete e.work_id;
    delete e.trace_id;
    const paths = validateDemoSpecShape(validSpec({ events: [e] })).map((p) => p.path).join(' ');
    expect(paths).toContain('work_id');
    expect(paths).toContain('trace_id');
  });

  it('REFUSES an agent action with no accountable human', () => {
    const e: Record<string, unknown> = validEvent();
    delete e.human_owner_id;
    expect(validateDemoSpecShape(validSpec({ events: [e] })).length).toBeGreaterThan(0);
  });

  it('REFUSES schema_version 1, so a v1 spec cannot be served by a v2 engine', () => {
    expect(validateDemoSpecShape(validSpec({ schema_version: 1 })).length).toBeGreaterThan(0);
  });
});

describe('content policy: restricted project text cannot be published', () => {
  const RESTRICTED = { organization_name: 'Herriman Dental Group' };

  it('passes a clean spec', () => {
    expect(checkDemoSpecContent(validSpec(), RESTRICTED)).toEqual([]);
    expect(isDemoSpecContentClean(validSpec(), RESTRICTED)).toBe(true);
  });

  it('catches a restricted value at the TOP level', () => {
    const spec = validSpec({ app: { name: 'Herriman Dental Group', descriptor: 'x', persona: { name: 'a', role: 'b' } } });
    const problems = checkDemoSpecContent(spec, RESTRICTED);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].message).toContain('organization_name');
  });

  it('catches a restricted value NESTED DEEP inside an event', () => {
    const spec = validSpec({
      events: [validEvent({ reason_summary: 'Escalated to Herriman Dental Group for review' })],
    });
    const problems = checkDemoSpecContent(spec, RESTRICTED);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0].path).toContain('events[0].reason_summary');
  });

  it('catches a restricted value inside an ARRAY of strings', () => {
    const spec = validSpec({ events: [validEvent({ side_effects: ['notified Herriman Dental Group'] })] });
    expect(checkDemoSpecContent(spec, RESTRICTED).length).toBeGreaterThan(0);
  });

  it('matches case-insensitively, so lower-casing is not a bypass', () => {
    const spec = validSpec({ events: [validEvent({ action: 'ping herriman dental group' })] });
    expect(checkDemoSpecContent(spec, RESTRICTED).length).toBeGreaterThan(0);
  });

  it.each(RESTRICTED_PROJECT_FIELDS)('refuses a value copied from %s', (field) => {
    const secret = `SENTINEL-${field}-VALUE`;
    const spec = validSpec({ events: [validEvent({ action: `did ${secret}` })] });
    expect(checkDemoSpecContent(spec, { [field]: secret }).length).toBeGreaterThan(0);
  });

  it('FAILS CLOSED on an unknown top-level key', () => {
    const spec = validSpec({ sneaky_passthrough: { raw: 'anything' } } as Record<string, unknown>);
    const problems = checkDemoSpecContent(spec, {});
    expect(problems.some((p) => p.path === 'sneaky_passthrough')).toBe(true);
  });

  it('allows every key on ALLOWED_SPEC_KEYS, so the policy is not simply "refuse everything"', () => {
    const spec: Record<string, unknown> = validSpec();
    for (const k of ALLOWED_SPEC_KEYS) if (!(k in spec)) spec[k] = [];
    expect(checkDemoSpecContent(spec, {}).filter((p) => p.message.includes('ALLOWED_SPEC_KEYS'))).toEqual([]);
  });

  it('ignores a restricted value shorter than 4 chars, which would refuse every spec', () => {
    const spec = validSpec({ events: [validEvent({ action: 'AI triage' })] });
    expect(checkDemoSpecContent(spec, { organization_name: 'AI' })).toEqual([]);
  });

  it('is NOT fooled by a null or absent restricted value', () => {
    expect(checkDemoSpecContent(validSpec(), { organization_name: null })).toEqual([]);
    expect(checkDemoSpecContent(validSpec(), {})).toEqual([]);
  });
});
