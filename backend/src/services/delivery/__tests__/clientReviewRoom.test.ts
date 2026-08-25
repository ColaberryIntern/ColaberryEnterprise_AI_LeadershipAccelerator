/**
 * Gate 10 — Client Review Room.
 *
 * The gate's safety property is negative: certain things must never reach a client. Tests
 * for a negative property are only worth anything if they would fail when the property
 * breaks, so most of what follows asserts on payload SHAPE rather than on a boolean the
 * implementation could hand back for free.
 */

import {
  CLIENT_FIELD_ALLOWLIST,
  CLIENT_NAV_PURPOSE,
  CLIENT_NAV_SECTIONS,
  FORBIDDEN_CATEGORIES,
  findForbiddenFields,
  toClientShape,
  toClientShapes,
} from '../../../modules/delivery/clientVisibility';
import {
  ClientPayloadLeakError,
  audienceFor,
  guardClientPayload,
  projectForAudience,
  stripForbidden,
} from '../clientProjection';
import {
  allowedTransitions as acceptanceTransitions,
  canTransition as canAcceptanceTransition,
  decideAcceptance,
  isAccepted,
  assertAcceptanceTransition,
  InvalidAcceptanceTransitionError,
} from '../clientAcceptanceService';
import {
  assessChangeImpact,
  canTransition as canChangeTransition,
  gateChangeRequest,
} from '../clientChangeRequest';
import { DELIVERY_ROLES } from '../../../modules/delivery/deliveryRoles';
import type { DeliveryGraph, GraphNodeRef } from '../deliveryProjectGraph';

// ---------------------------------------------------------------------------
// Visibility vocabulary
// ---------------------------------------------------------------------------

describe('client visibility vocabulary', () => {
  it('declares the master plan’s eight nav sections', () => {
    expect(CLIENT_NAV_SECTIONS).toEqual([
      'overview',
      'decisions',
      'design',
      'preview',
      'changes',
      'releases',
      'results',
      'documents',
    ]);
  });

  it('explains every section in the client’s language', () => {
    for (const section of CLIENT_NAV_SECTIONS) {
      expect(CLIENT_NAV_PURPOSE[section]?.length ?? 0).toBeGreaterThan(10);
    }
  });

  it('declares the five forbidden categories', () => {
    expect([...FORBIDDEN_CATEGORIES].sort()).toEqual([
      'agent_scratchpad',
      'builder_assessment',
      'engineering_logs',
      'mentor_notes',
      'secrets',
    ]);
  });

  it('no allowlist contains a field that would trip the tripwire', () => {
    // The two layers must agree. If an allowlist ever names a forbidden-looking field,
    // that is a contradiction in the contract itself and should fail here, loudly.
    for (const [kind, fields] of Object.entries(CLIENT_FIELD_ALLOWLIST)) {
      const asObject = Object.fromEntries(fields.map((f) => [f, 'x']));
      expect({ kind, hits: findForbiddenFields(asObject) }).toEqual({ kind, hits: [] });
    }
  });
});

// ---------------------------------------------------------------------------
// The allowlist projection
// ---------------------------------------------------------------------------

describe('toClientShape', () => {
  const builderProject = {
    id: 'p1',
    name: 'Client Portal',
    summary: 'A portal',
    status: 'active',
    // Everything below must NOT survive.
    risk_level: 'R4',
    internal_notes: 'the client is difficult',
    mentor_notes: 'intern struggling with async',
    builder_assessment: { competency_score: 2 },
    agent_scratchpad: 'thinking about how to...',
    api_key: 'sk-ant-secret',
    stack_trace: 'Error: at line 1',
  };

  it('keeps only allowlisted fields', () => {
    const out = toClientShape('project', builderProject);
    expect(Object.keys(out).sort()).toEqual(['id', 'name', 'status', 'summary']);
  });

  it('drops every forbidden field', () => {
    const out = toClientShape('project', builderProject);
    // Asserting on the payload, not on a boolean: this is the test that would actually
    // fail if the projection regressed.
    expect(findForbiddenFields(out)).toEqual([]);
    expect(JSON.stringify(out)).not.toContain('sk-ant-secret');
    expect(JSON.stringify(out)).not.toContain('intern struggling');
  });

  it('drops unknown fields by default, including ones nobody anticipated', () => {
    const out = toClientShape('project', {
      ...builderProject,
      some_field_invented_next_year: 'leaky',
    });
    expect(out).not.toHaveProperty('some_field_invented_next_year');
  });

  it('builds a NEW object rather than mutating the source', () => {
    const source = { ...builderProject };
    toClientShape('project', source);
    expect(source.mentor_notes).toBe('intern struggling with async');
  });

  it('omits absent fields rather than emitting undefined', () => {
    const out = toClientShape('project', { id: 'p1', name: 'X' });
    expect(Object.keys(out)).toEqual(['id', 'name']);
    expect('summary' in out).toBe(false);
  });

  it('projects a list', () => {
    const out = toClientShapes('project', [builderProject, builderProject]);
    expect(out).toHaveLength(2);
    expect(out.every((o) => !('mentor_notes' in o))).toBe(true);
  });

  it('evidence is summarised, never handed over as rows', () => {
    // A client is owed the conclusion and the shape of the proof, not our CI output.
    const out = toClientShape('evidence_summary', {
      dimension: 'security',
      outcome: 'pass',
      checked_at: '2026-08-24',
      source_ref: 'https://ci.internal/run/9912',
      payload: { stdout: 'lots of logs' },
    });
    expect(Object.keys(out).sort()).toEqual(['checked_at', 'dimension', 'outcome']);
  });
});

// ---------------------------------------------------------------------------
// The tripwire
// ---------------------------------------------------------------------------

describe('findForbiddenFields', () => {
  it('catches each forbidden category', () => {
    const hits = findForbiddenFields({
      agent_scratchpad: 'x',
      mentor_notes: 'x',
      builder_assessment: 'x',
      api_key: 'x',
      stack_trace: 'x',
    });
    expect([...new Set(hits.map((h) => h.category))].sort()).toEqual([
      'agent_scratchpad',
      'builder_assessment',
      'engineering_logs',
      'mentor_notes',
      'secrets',
    ]);
  });

  it('matches fragments, not just exact names', () => {
    expect(findForbiddenFields({ rawScratchpadText: 'x' })).not.toEqual([]);
    expect(findForbiddenFields({ internalNoteForStaff: 'x' })).not.toEqual([]);
  });

  it('finds fields nested inside objects and arrays, with a path', () => {
    const hits = findForbiddenFields({ a: { b: [{ mentor_note: 'x' }] } });
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe('a.b[0].mentor_note');
  });

  it('reports EVERY hit, not just the first', () => {
    expect(findForbiddenFields({ secret: 1, password: 2, token: 3 }).length).toBeGreaterThanOrEqual(3);
  });

  it('stays silent on an ordinary payload', () => {
    // The negative control. Without it, a tripwire that flagged everything would pass
    // every test above.
    expect(findForbiddenFields({ id: 'p1', name: 'Portal', status: 'active' })).toEqual([]);
  });

  it('reports truncation as a hit rather than returning clean', () => {
    // An incomplete check that answers "clean" is worse than no check.
    let deep: any = { leaf: true };
    for (let i = 0; i < 12; i += 1) deep = { nested: deep };
    const hits = findForbiddenFields(deep, 4);
    expect(hits.some((h) => h.fragment === '(walk truncated)')).toBe(true);
  });

  it('terminates on a cyclic structure', () => {
    const cyclic: any = { name: 'x' };
    cyclic.self = cyclic;
    expect(() => findForbiddenFields(cyclic)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Audience selection
// ---------------------------------------------------------------------------

describe('audienceFor', () => {
  it('serves the client shape to client-only roles', () => {
    expect(audienceFor([DELIVERY_ROLES.CLIENT_OWNER])).toBe('client');
    expect(audienceFor([DELIVERY_ROLES.CLIENT_REVIEWER, DELIVERY_ROLES.CLIENT_OWNER])).toBe('client');
  });

  it('serves the builder shape to staff', () => {
    expect(audienceFor([DELIVERY_ROLES.DELIVERY_OWNER])).toBe('builder');
  });

  it('FAILS SAFE: no roles at all gets the client shape', () => {
    // An unknown caller is not a trusted caller. A role-lookup failure must never be the
    // thing that widens access.
    expect(audienceFor([])).toBe('client');
  });

  it('a mixed staff-and-client role set is staff', () => {
    expect(audienceFor([DELIVERY_ROLES.DELIVERY_OWNER, DELIVERY_ROLES.CLIENT_REVIEWER])).toBe('builder');
  });
});

describe('projectForAudience', () => {
  const source = { id: 'p1', name: 'X', status: 'active', mentor_notes: 'private' };

  it('gives a client the reduced shape and trips no wire', () => {
    const result = projectForAudience('project', source, [DELIVERY_ROLES.CLIENT_OWNER]);
    expect(result.audience).toBe('client');
    expect(result.payload).not.toHaveProperty('mentor_notes');
    expect(result.forbidden).toEqual([]);
  });

  it('gives a builder the full object untouched', () => {
    const result = projectForAudience('project', source, [DELIVERY_ROLES.DELIVERY_OWNER]);
    expect(result.audience).toBe('builder');
    expect(result.payload).toHaveProperty('mentor_notes');
  });
});

// ---------------------------------------------------------------------------
// The route-boundary guard
// ---------------------------------------------------------------------------

describe('guardClientPayload', () => {
  const leaky = { id: 'p1', mentor_notes: 'private' };

  it('passes a clean payload through unchanged', () => {
    const clean = { id: 'p1', name: 'X' };
    expect(guardClientPayload(clean, { isProduction: false })).toBe(clean);
  });

  it('throws in development so the bug gets fixed', () => {
    expect(() => guardClientPayload(leaky, { isProduction: false })).toThrow(ClientPayloadLeakError);
  });

  it('strips and continues in production — never continues unchanged', () => {
    // CLAUDE.md says "log and continue" in production, but continuing unchanged here IS
    // the leak. Stripping preserves the request while removing the harm.
    const out = guardClientPayload(leaky, { isProduction: true });
    expect(out).not.toHaveProperty('mentor_notes');
    expect(out).toHaveProperty('id');
  });

  it('reports the leak to the caller’s logger in both modes', () => {
    const seen: unknown[] = [];
    guardClientPayload(leaky, { isProduction: true, onLeak: (h) => seen.push(h) });
    expect(seen).toHaveLength(1);
  });

  it('stripForbidden removes nested offenders and keeps the rest', () => {
    const out = stripForbidden({ id: 'p1', nested: { keep: 1, api_key: 'sk-x' } });
    expect(out).toEqual({ id: 'p1', nested: { keep: 1 } });
  });
});

// ---------------------------------------------------------------------------
// Client acceptance
// ---------------------------------------------------------------------------

describe('client acceptance state machine', () => {
  it('accepted is NOT terminal — it can be superseded or withdrawn', () => {
    // If acceptance were terminal, the only way to correct it would be an UPDATE on the
    // accepted row, which is the §24 silent-overwrite failure.
    expect(canAcceptanceTransition('accepted', 'superseded')).toBe(true);
    expect(canAcceptanceTransition('accepted', 'withdrawn')).toBe(true);
  });

  it('superseded is terminal', () => {
    expect(acceptanceTransitions('superseded')).toEqual([]);
  });

  it('pending can go to any first-decision outcome', () => {
    for (const to of ['accepted', 'accepted_with_exceptions', 'rejected', 'withdrawn'] as const) {
      expect(canAcceptanceTransition('pending', to)).toBe(true);
    }
  });

  it('rejects an illegal transition loudly', () => {
    expect(() => assertAcceptanceTransition('superseded', 'accepted')).toThrow(
      InvalidAcceptanceTransitionError,
    );
  });

  it('both accepted forms count as accepted', () => {
    expect(isAccepted('accepted')).toBe(true);
    expect(isAccepted('accepted_with_exceptions')).toBe(true);
    expect(isAccepted('rejected')).toBe(false);
    expect(isAccepted('pending')).toBe(false);
  });
});

describe('acceptance validation', () => {
  const good = {
    scopeKind: 'release' as const,
    releaseId: 'r1',
    promisedAcceptance: ['the export works'],
    previewRef: 'https://preview/1',
    evidenceSummary: [{ dimension: 'browser', outcome: 'pass' }],
    acceptedByIdentityId: 'identity-1',
    status: 'accepted' as const,
  };

  it('accepts a complete acceptance', () => {
    expect(decideAcceptance(good).valid).toBe(true);
  });

  it('refuses an acceptance with no named acceptor', () => {
    const d = decideAcceptance({ ...good, acceptedByIdentityId: null });
    expect(d.valid).toBe(false);
    expect(d.blockingIssues.map((i) => i.rule)).toContain('acceptor_missing');
  });

  it('refuses an acceptance that does not snapshot what was promised', () => {
    const d = decideAcceptance({ ...good, promisedAcceptance: [] });
    expect(d.blockingIssues.map((i) => i.rule)).toContain('promise_missing');
  });

  it('refuses an acceptance with no record of what was previewed', () => {
    const d = decideAcceptance({ ...good, previewRef: null });
    expect(d.blockingIssues.map((i) => i.rule)).toContain('preview_missing');
  });

  it('WARNS but does not block when evidence is absent', () => {
    // A client may accept on their own judgement. Refusing to record that would push the
    // sign-off out of the system, and an unrecorded acceptance is what this table exists
    // to prevent.
    const d = decideAcceptance({ ...good, evidenceSummary: [] });
    expect(d.valid).toBe(true);
    expect(d.issues.map((i) => i.rule)).toContain('evidence_missing');
  });

  it('refuses accepted_with_exceptions that lists no exceptions', () => {
    const d = decideAcceptance({ ...good, status: 'accepted_with_exceptions', exceptions: [] });
    expect(d.blockingIssues.map((i) => i.rule)).toContain('exceptions_missing');
  });

  it('refuses a clean acceptance that quietly carries exceptions', () => {
    const d = decideAcceptance({ ...good, exceptions: ['export still wrong'] });
    expect(d.blockingIssues.map((i) => i.rule)).toContain('exceptions_on_clean_acceptance');
  });

  it('refuses an ambiguous scope', () => {
    const d = decideAcceptance({ ...good, storyId: 's1' });
    expect(d.blockingIssues.map((i) => i.rule)).toContain('scope_ambiguous');
  });

  it('refuses a scoped acceptance with no target', () => {
    const d = decideAcceptance({ ...good, releaseId: null });
    expect(d.blockingIssues.map((i) => i.rule)).toContain('scope_missing');
  });
});

// ---------------------------------------------------------------------------
// Change requests: impact before build
// ---------------------------------------------------------------------------

describe('change request: impact before build', () => {
  const ref = (kind: GraphNodeRef['kind'], id: string): GraphNodeRef => ({ kind, id });

  const graph: DeliveryGraph = {
    nodes: [],
    edges: [
      { from: ref('requirement', 'req-1'), to: ref('story', 'story-1'), relation: 'covers' },
      { from: ref('story', 'story-1'), to: ref('release', 'rel-1'), relation: 'ships_in' },
      { from: ref('release', 'rel-1'), to: ref('client_acceptance', 'acc-1'), relation: 'accepted_by' },
      { from: ref('release', 'rel-1'), to: ref('deployment', 'dep-1'), relation: 'deployed_as' },
    ],
  };

  it('there is NO path from submitted straight to build', () => {
    // The gate is a property of the graph, not a rule someone must remember.
    expect(canChangeTransition('submitted', 'approved_for_build')).toBe(false);
    expect(canChangeTransition('submitted', 'impact_assessed')).toBe(true);
    expect(canChangeTransition('impact_assessed', 'approved_for_build')).toBe(true);
  });

  it('tells the client when a change reaches work they already accepted', () => {
    const { summary } = assessChangeImpact(graph, [ref('requirement', 'req-1')]);
    expect(summary.touchesAcceptedWork).toBe(true);
    expect(summary.touchesDeployedWork).toBe(true);
    expect(summary.highlights.join(' ')).toMatch(/already accepted/i);
    expect(summary.highlights.join(' ')).toMatch(/already released/i);
  });

  it('says plainly when a change affects nothing else', () => {
    const { summary } = assessChangeImpact(graph, [ref('requirement', 'orphan')]);
    expect(summary.affectedCount).toBe(0);
    expect(summary.touchesAcceptedWork).toBe(false);
    expect(summary.highlights.join(' ')).toMatch(/does not appear to affect/i);
  });

  it('the client summary carries counts and flags, never node identifiers', () => {
    const { summary } = assessChangeImpact(graph, [ref('requirement', 'req-1')]);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('story-1');
    expect(serialized).not.toContain('acc-1');
    expect(findForbiddenFields(summary)).toEqual([]);
  });

  it('admits when the analysis was truncated instead of implying completeness', () => {
    const { summary } = assessChangeImpact(graph, [ref('requirement', 'req-1')], { maxDepth: 1 });
    expect(summary.truncated).toBe(true);
    expect(summary.highlights.join(' ')).toMatch(/may be incomplete/i);
  });

  it('keeps the full report internally for the builder surface', () => {
    const { internal } = assessChangeImpact(graph, [ref('requirement', 'req-1')]);
    expect(internal.affected.map((n) => n.id)).toContain('story-1');
  });
});

describe('gateChangeRequest', () => {
  it('refuses build approval with no impact recorded', () => {
    const issues = gateChangeRequest({
      status: 'impact_assessed',
      targetStatus: 'approved_for_build',
      hasImpactSummary: false,
      approvedByIdentityId: 'identity-1',
    });
    expect(issues.map((i) => i.rule)).toContain('build_without_impact');
  });

  it('refuses build approval with no named approver', () => {
    const issues = gateChangeRequest({
      status: 'impact_assessed',
      targetStatus: 'approved_for_build',
      hasImpactSummary: true,
    });
    expect(issues.map((i) => i.rule)).toContain('approver_missing');
  });

  it('refuses marking impact-assessed with no summary', () => {
    const issues = gateChangeRequest({
      status: 'submitted',
      targetStatus: 'impact_assessed',
      hasImpactSummary: false,
    });
    expect(issues.map((i) => i.rule)).toContain('impact_not_assessed');
  });

  it('allows a complete, properly-sequenced approval', () => {
    // The negative control for the three refusals above.
    expect(
      gateChangeRequest({
        status: 'impact_assessed',
        targetStatus: 'approved_for_build',
        hasImpactSummary: true,
        approvedByIdentityId: 'identity-1',
      }),
    ).toEqual([]);
  });

  it('refuses an illegal transition even when everything else is present', () => {
    const issues = gateChangeRequest({
      status: 'submitted',
      targetStatus: 'approved_for_build',
      hasImpactSummary: true,
      approvedByIdentityId: 'identity-1',
    });
    expect(issues.map((i) => i.rule)).toContain('illegal_transition');
  });
});
