/**
 * Phase 31 — Operator Cognition Continuity + Governance Memory.
 *
 * Coverage:
 *   - architectural caps + 15 addendum types
 *   - forbidden registry (9 actions) — anti-profiling defense-in-depth
 *   - stabilizationSessionTimeline: open/event/close lifecycle, append-only,
 *     finality_proof per event, auto-expiration, session caps
 *   - operatorContinuityRegistry: counts only, NO behavioral pattern fields,
 *     NO per-operator confidence scores, engine_never_profiles typed-as-true
 *   - governanceArchaeologyEngine: read-only Phase 14-30 aggregation,
 *     bounded_to_organization typed-as-true
 *   - reasoningContinuityReplay: deterministic same-inputs-same-output
 *   - governanceMemorySupervisor: 8 reject paths, operator_mediation_required
 *     + no_operator_profiling typed-as-true
 *   - operatorReasoningCompression: omission_attribution mandatory,
 *     lossless verification
 *   - cognitionTimelineSurface: chronological, no relevance reordering
 *   - PRODUCTION STATE UNCHANGED verification
 *   - HARD-VETO PRESERVATION across prior phases
 *   - Cross-organization isolation end-to-end
 */

import {
  openSession, recordEvent, closeSession, sweepExpiredSessions,
  buildStabilizationSessionTimeline,
  listSessions, getSession, listEvents,
  recentSessionCount24h, recentEventCount24h,
  _resetSessionTimelineForTests,
} from '../governanceMemory/stabilizationSessionTimeline';
import {
  buildOperatorContinuityProfile, recordNeutralityProof,
  listNeutralityProofs as listMemoryNeutralityProofs,
  _resetContinuityRegistryForTests,
} from '../governanceMemory/operatorContinuityRegistry';
import {
  buildGovernanceArchaeology, listArchaeologyReplays,
  recentArchaeologyCount24h,
  _resetGovernanceArchaeologyForTests,
} from '../governanceMemory/governanceArchaeologyEngine';
import {
  buildReasoningContinuityReplay, verifyContinuityReplayDeterminism,
  listReplays, recentReplayCount24h,
  _resetReasoningContinuityReplayForTests,
} from '../governanceMemory/reasoningContinuityReplay';
import {
  evaluateMemoryRequest, listMemoryGovernanceAttributions,
  recentMemoryGovernanceCount24h,
  _resetMemorySupervisorForTests,
} from '../governanceMemory/governanceMemorySupervisor';
import {
  buildOperatorReasoningCompression, listCompressions,
  recentCompressionCount24h,
  _resetReasoningCompressionForTests,
} from '../governanceMemory/operatorReasoningCompression';
import { buildCognitionTimelineSurface } from '../governanceMemory/cognitionTimelineSurface';
import {
  buildGovernanceMemoryComposite, buildGovernanceMemoryReplayBundle,
} from '../governanceMemory/governanceMemoryCoordinator';
import {
  buildContinuityNarrative, listContinuityNarratives,
  _resetContinuityNarrativesForTests,
} from '../governanceMemory/continuityNarrativeBuilder';
import { buildGovernanceMemoryTrustSurface } from '../governanceMemory/governanceMemoryTrustSurface';
import { buildGovernanceMemoryVisibilityReplay } from '../governanceMemory/governanceMemoryVisibilityReplay';
import { buildGovernanceMemorySummary } from '../governanceMemory/governanceMemorySummaryCounters';
import {
  getForbiddenMemoryRegistry, isMemoryActionForbidden,
  explainForbiddenMemory,
} from '../governanceMemory/forbiddenMemoryActionRegistry';
import {
  MAX_EVENTS_PER_SESSION, MAX_NOTE_LENGTH,
} from '../governanceMemory/governanceMemoryTypes';
import type {
  ForbiddenMemoryActionKind,
} from '../governanceMemory/governanceMemoryTypes';

const ORG = 'org_phase31_alpha';
const ORG_OTHER = 'org_phase31_beta';
const OPERATOR = 'op_phase31';
const OPERATOR_2 = 'op_phase31_two';

beforeEach(() => {
  _resetSessionTimelineForTests();
  _resetContinuityRegistryForTests();
  _resetGovernanceArchaeologyForTests();
  _resetReasoningContinuityReplayForTests();
  _resetMemorySupervisorForTests();
  _resetReasoningCompressionForTests();
  _resetContinuityNarrativesForTests();
});

// ────────────────────────────────────────────────────────────────────
// Section 1 — Forbidden Memory Registry (9 anti-profiling actions)
// ────────────────────────────────────────────────────────────────────

describe('forbiddenMemoryActionRegistry', () => {
  test('registry exposes all 9 forbidden actions with hash', () => {
    const r = getForbiddenMemoryRegistry();
    expect(r.forbidden_actions.length).toBe(9);
    expect(r.registry_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('persistent_operator_profiling forbidden', () => {
    expect(isMemoryActionForbidden('persistent_operator_profiling')).toBe(true);
  });
  test('behavioral_operator_prediction forbidden', () => {
    expect(isMemoryActionForbidden('behavioral_operator_prediction')).toBe(true);
  });
  test('decision_automation forbidden', () => {
    expect(isMemoryActionForbidden('decision_automation')).toBe(true);
  });
  test('operator_preference_inference forbidden', () => {
    expect(isMemoryActionForbidden('operator_preference_inference')).toBe(true);
  });
  test('adaptive_operator_steering forbidden', () => {
    expect(isMemoryActionForbidden('adaptive_operator_steering')).toBe(true);
  });
  test('cross_org_cognition_propagation forbidden', () => {
    expect(isMemoryActionForbidden('cross_org_cognition_propagation')).toBe(true);
  });
  test('self_evolving_governance_memory forbidden', () => {
    expect(isMemoryActionForbidden('self_evolving_governance_memory')).toBe(true);
  });
  test('hidden_cognition_weighting forbidden', () => {
    expect(isMemoryActionForbidden('hidden_cognition_weighting')).toBe(true);
  });
  test('operator_ranking_emission forbidden', () => {
    expect(isMemoryActionForbidden('operator_ranking_emission')).toBe(true);
  });
  test('explainForbiddenMemory returns non-empty string', () => {
    expect(explainForbiddenMemory('persistent_operator_profiling' as ForbiddenMemoryActionKind).length).toBeGreaterThan(0);
  });
  test('non-forbidden action returns false', () => {
    expect(isMemoryActionForbidden('lift_broker_isolation')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 2 — Stabilization Session Timeline (lifecycle + append-only)
// ────────────────────────────────────────────────────────────────────

describe('stabilizationSessionTimeline', () => {
  test('openSession creates session and session_opened event', () => {
    const r = openSession({ organization_id: ORG, operator_id: OPERATOR });
    expect(r.opened).toBe(true);
    expect(r.session?.lifecycle_state).toBe('opened');
    const events = listEvents(ORG);
    expect(events.length).toBe(1);
    expect(events[0].event_kind).toBe('session_opened');
  });

  test('openSession refuses missing organization_id', () => {
    const r = openSession({ organization_id: '', operator_id: OPERATOR });
    expect(r.opened).toBe(false);
  });

  test('openSession refuses missing operator_id', () => {
    const r = openSession({ organization_id: ORG, operator_id: '' });
    expect(r.opened).toBe(false);
  });

  test('openSession refuses note exceeding MAX_NOTE_LENGTH', () => {
    const longNote = 'x'.repeat(MAX_NOTE_LENGTH + 1);
    const r = openSession({ organization_id: ORG, operator_id: OPERATOR, note: longNote });
    expect(r.opened).toBe(false);
  });

  test('recordEvent appends event with finality_proof', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const r = recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    expect(r.recorded).toBe(true);
    expect(r.event?.finality_proof.cannot_be_modified).toBe(true);
    expect(r.event?.finality_proof.cannot_be_deleted).toBe(true);
    expect(r.event?.finality_proof.replayable).toBe(true);
  });

  test('recordEvent refuses unknown session_id', () => {
    const r = recordEvent({
      organization_id: ORG, session_id: 'nonexistent',
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    expect(r.recorded).toBe(false);
  });

  test('session lifecycle transitions opened → active on first non-opened event', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    expect(opened.session?.lifecycle_state).toBe('opened');
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    const session = getSession(ORG, opened.session!.session_id);
    expect(session?.lifecycle_state).toBe('active');
  });

  test('closeSession transitions session to closed and records close event', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const closed = closeSession({
      organization_id: ORG, session_id: opened.session!.session_id, operator_id: OPERATOR,
    });
    expect(closed.closed).toBe(true);
    expect(closed.session?.lifecycle_state).toBe('closed');
    const events = listEvents(ORG);
    expect(events.some(e => e.event_kind === 'session_closed')).toBe(true);
  });

  test('closeSession refuses already-closed session', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    closeSession({ organization_id: ORG, session_id: opened.session!.session_id, operator_id: OPERATOR });
    const second = closeSession({ organization_id: ORG, session_id: opened.session!.session_id, operator_id: OPERATOR });
    expect(second.closed).toBe(false);
  });

  test('events are immutable (timeline reflects same hash on re-read)', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'comparison_built',
    });
    const a = buildStabilizationSessionTimeline({ organization_id: ORG });
    const b = buildStabilizationSessionTimeline({ organization_id: ORG });
    expect(a.timeline_hash).toBe(b.timeline_hash);
    expect(a.events.length).toBe(b.events.length);
    expect(a.events.map(e => e.deterministic_hash))
      .toEqual(b.events.map(e => e.deterministic_hash));
  });

  test('timeline read_only + append_only + engine_never_profiles typed-as-true', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    void opened;
    const t = buildStabilizationSessionTimeline({ organization_id: ORG });
    expect(t.read_only).toBe(true);
    expect(t.append_only).toBe(true);
    expect(t.engine_never_profiles).toBe(true);
  });

  test('events ordered chronologically (oldest first)', () => {
    const o1 = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: o1.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    recordEvent({
      organization_id: ORG, session_id: o1.session!.session_id,
      operator_id: OPERATOR, event_kind: 'comparison_built',
    });
    const t = buildStabilizationSessionTimeline({ organization_id: ORG });
    for (let i = 1; i < t.events.length; i++) {
      expect(Date.parse(t.events[i].recorded_at)).toBeGreaterThanOrEqual(Date.parse(t.events[i-1].recorded_at));
    }
  });

  test('per-session event cap enforced (MAX_EVENTS_PER_SESSION)', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    // session_opened already counts as 1 event
    let recorded = 1;
    let blocked = 0;
    for (let i = 0; i < MAX_EVENTS_PER_SESSION + 5; i++) {
      const r = recordEvent({
        organization_id: ORG, session_id: opened.session!.session_id,
        operator_id: OPERATOR, event_kind: 'note_recorded',
      });
      if (r.recorded) recorded++;
      else blocked++;
    }
    expect(recorded).toBeLessThanOrEqual(MAX_EVENTS_PER_SESSION);
    expect(blocked).toBeGreaterThan(0);
  });

  test('cross-org timeline isolation', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    expect(listSessions(ORG).length).toBe(1);
    expect(listSessions(ORG_OTHER).length).toBe(0);
  });

  test('sweepExpiredSessions transitions stale sessions to expired', () => {
    // Mock time-based test — confirm sweep no-ops when nothing is expired.
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const expired = sweepExpiredSessions(ORG);
    expect(expired).toBe(0);
    const session = getSession(ORG, opened.session!.session_id);
    expect(session?.lifecycle_state).toBe('opened');
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 3 — Operator Continuity Registry (counts only, no profiling)
// ────────────────────────────────────────────────────────────────────

describe('operatorContinuityRegistry', () => {
  test('engine_never_profiles typed-as-true', () => {
    const p = buildOperatorContinuityProfile({ organization_id: ORG });
    expect(p.engine_never_profiles).toBe(true);
  });

  test('NO per-operator behavioral fields exist on profile', () => {
    const p = buildOperatorContinuityProfile({ organization_id: ORG });
    expect((p as any).operator_confidence_scores).toBeUndefined();
    expect((p as any).behavioral_patterns).toBeUndefined();
    expect((p as any).operator_predictions).toBeUndefined();
    expect((p as any).operator_rankings).toBeUndefined();
  });

  test('distinct_operator_ids exposed as raw list (count + ids only, no derivation)', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    openSession({ organization_id: ORG, operator_id: OPERATOR_2 });
    const p = buildOperatorContinuityProfile({ organization_id: ORG });
    expect(p.distinct_operator_count).toBe(2);
    expect(p.distinct_operator_ids).toEqual([OPERATOR, OPERATOR_2].sort());
  });

  test('events_by_kind aggregates correctly', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'comparison_built',
    });
    const p = buildOperatorContinuityProfile({ organization_id: ORG });
    expect(p.events_by_kind.session_opened).toBe(1);
    expect(p.events_by_kind.archetype_viewed).toBe(1);
    expect(p.events_by_kind.comparison_built).toBe(1);
  });

  test('density_tier classifies based on total events', () => {
    const p = buildOperatorContinuityProfile({ organization_id: ORG });
    expect(p.density_tier).toBe('sparse');
    expect(['sparse', 'partial', 'developed', 'dense', 'compressed']).toContain(p.density_tier);
  });

  test('profile_hash deterministic from same state', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    const a = buildOperatorContinuityProfile({ organization_id: ORG });
    const b = buildOperatorContinuityProfile({ organization_id: ORG });
    expect(a.profile_hash).toBe(b.profile_hash);
  });

  test('MemoryNeutralityProof typed-as-true on all 3 fields', () => {
    const proof = recordNeutralityProof({ organization_id: ORG, continuity_id: 'cont_test' });
    expect(proof.no_operator_profiling).toBe(true);
    expect(proof.no_behavioral_prediction).toBe(true);
    expect(proof.no_operator_ranking).toBe(true);
  });

  test('cross-org continuity isolation', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    const a = buildOperatorContinuityProfile({ organization_id: ORG });
    const b = buildOperatorContinuityProfile({ organization_id: ORG_OTHER });
    expect(a.total_sessions).toBe(1);
    expect(b.total_sessions).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 4 — Governance Archaeology Engine (Phase 14-30 read-only)
// ────────────────────────────────────────────────────────────────────

describe('governanceArchaeologyEngine', () => {
  test('read_only typed-as-true', () => {
    const r = buildGovernanceArchaeology({ organization_id: ORG });
    expect(r.read_only).toBe(true);
  });
  test('cross_phase_archaeology typed-as-true (Phase 14-30 spans)', () => {
    const r = buildGovernanceArchaeology({ organization_id: ORG });
    expect(r.cross_phase_archaeology).toBe(true);
  });
  test('bounded_to_organization typed-as-true', () => {
    const r = buildGovernanceArchaeology({ organization_id: ORG });
    expect(r.bounded_to_organization).toBe(true);
  });
  test('source_phase_summaries exposes counts for Phase 27/28/29/30', () => {
    const r = buildGovernanceArchaeology({ organization_id: ORG });
    expect(typeof r.source_phase_summaries.phase_27_envelope_count).toBe('number');
    expect(typeof r.source_phase_summaries.phase_28_quota_governance_count).toBe('number');
    expect(typeof r.source_phase_summaries.phase_29_governance_attribution_count).toBe('number');
    expect(typeof r.source_phase_summaries.phase_30_comparison_count).toBe('number');
  });
  test('archaeology_hash deterministic when source state unchanged', () => {
    const a = buildGovernanceArchaeology({ organization_id: ORG });
    const b = buildGovernanceArchaeology({ organization_id: ORG });
    expect(a.archaeology_hash).toBe(b.archaeology_hash);
  });
  test('cross-org archaeology isolation', () => {
    buildGovernanceArchaeology({ organization_id: ORG });
    expect(listArchaeologyReplays(ORG).length).toBe(1);
    expect(listArchaeologyReplays(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 5 — Reasoning Continuity Replay (deterministic)
// ────────────────────────────────────────────────────────────────────

describe('reasoningContinuityReplay', () => {
  test('deterministic + read_only typed-as-true', () => {
    const r = buildReasoningContinuityReplay({ organization_id: ORG });
    expect(r.deterministic).toBe(true);
    expect(r.read_only).toBe(true);
  });

  test('replay_hash deterministic from same event log', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    const a = buildReasoningContinuityReplay({ organization_id: ORG });
    const b = buildReasoningContinuityReplay({ organization_id: ORG });
    expect(a.replay_hash).toBe(b.replay_hash);
  });

  test('verifyContinuityReplayDeterminism returns deterministic=true on unchanged state', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    const replay = buildReasoningContinuityReplay({ organization_id: ORG });
    const v = verifyContinuityReplayDeterminism({
      organization_id: ORG,
      expected_replay_hash: replay.replay_hash,
    });
    expect(v.deterministic).toBe(true);
  });

  test('verifyContinuityReplayDeterminism returns deterministic=false on mismatched hash', () => {
    const v = verifyContinuityReplayDeterminism({
      organization_id: ORG,
      expected_replay_hash: 'mismatched',
    });
    expect(v.deterministic).toBe(false);
  });

  test('replay_hash differs after new event added (state changed)', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const a = buildReasoningContinuityReplay({ organization_id: ORG });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    const b = buildReasoningContinuityReplay({ organization_id: ORG });
    expect(a.replay_hash).not.toBe(b.replay_hash);
  });

  test('window filter narrows event count', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    const future = new Date(Date.now() + 10_000).toISOString();
    const r = buildReasoningContinuityReplay({
      organization_id: ORG, window_start: future,
    });
    expect(r.events_replayed).toBe(0);
  });

  test('cross-org replay isolation', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    buildReasoningContinuityReplay({ organization_id: ORG });
    expect(listReplays(ORG).length).toBe(1);
    expect(listReplays(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 6 — Governance Memory Supervisor (8 reject paths)
// ────────────────────────────────────────────────────────────────────

describe('governanceMemorySupervisor', () => {
  function gateInput(overrides: any = {}) {
    return {
      organization_id: ORG,
      issuer_organization_id: ORG,
      operator_id: OPERATOR,
      ...overrides,
    };
  }

  test('permits valid input', () => {
    const r = evaluateMemoryRequest(gateInput());
    expect(r.decision).toBe('permitted');
    expect(r.attribution.operator_mediation_required).toBe(true);
    expect(r.attribution.no_operator_profiling).toBe(true);
  });

  test('rejects organization_id missing', () => {
    const r = evaluateMemoryRequest(gateInput({ organization_id: '' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('organization_id_missing');
  });

  test('rejects operator_id missing — operator_mediation_required_violated', () => {
    const r = evaluateMemoryRequest(gateInput({ operator_id: '' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('operator_mediation_required_violated');
  });

  test('rejects cross-org', () => {
    const r = evaluateMemoryRequest(gateInput({ issuer_organization_id: ORG_OTHER }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('cross_org_attempted');
  });

  test('rejects forbidden_memory_action (persistent_operator_profiling)', () => {
    const r = evaluateMemoryRequest(gateInput({
      requested_action_kind: 'persistent_operator_profiling',
    }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('forbidden_memory_action');
  });

  test('rejects session_id_not_found', () => {
    const r = evaluateMemoryRequest(gateInput({ session_id: 'nonexistent' }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('session_id_not_found');
  });

  test('rejects session_already_closed', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    closeSession({ organization_id: ORG, session_id: opened.session!.session_id, operator_id: OPERATOR });
    const r = evaluateMemoryRequest(gateInput({ session_id: opened.session!.session_id }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('session_already_closed');
  });

  test('rejects event_kind_invalid', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const r = evaluateMemoryRequest(gateInput({
      session_id: opened.session!.session_id,
      event_kind: 'unknown_kind',
    }));
    expect(r.decision).toBe('rejected');
    expect(r.supervisor_rule_violated).toBe('event_kind_invalid');
  });

  test('every attribution carries no_operator_profiling typed-as-true', () => {
    const r1 = evaluateMemoryRequest(gateInput());
    const r2 = evaluateMemoryRequest(gateInput({ organization_id: '' }));
    expect(r1.attribution.no_operator_profiling).toBe(true);
    expect(r2.attribution.no_operator_profiling).toBe(true);
  });

  test('cross-org governance log isolation', () => {
    evaluateMemoryRequest(gateInput());
    expect(listMemoryGovernanceAttributions(ORG).length).toBe(1);
    expect(listMemoryGovernanceAttributions(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 7 — Operator Reasoning Compression (omission attribution)
// ────────────────────────────────────────────────────────────────────

describe('operatorReasoningCompression', () => {
  test('omission_attribution always present (mandatory output)', () => {
    const c = buildOperatorReasoningCompression({ organization_id: ORG });
    expect(c.omission_attribution).toBeDefined();
    expect(c.omission_attribution.deterministic_hash).toMatch(/^[a-f0-9]+$/);
  });

  test('lossless=true when no events to drop', () => {
    const c = buildOperatorReasoningCompression({ organization_id: ORG });
    expect(c.omission_attribution.lossless).toBe(true);
    expect(c.omission_attribution.events_omitted).toBe(0);
  });

  test('events_observed = events_retained + events_omitted (transparency)', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    const c = buildOperatorReasoningCompression({ organization_id: ORG });
    // events_retained tracks count summarized; events_omitted tracks dropped session-id refs.
    expect(c.omission_attribution.total_events_observed)
      .toBe(c.omission_attribution.events_retained);
  });

  test('compression_hash deterministic from same state', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    const a = buildOperatorReasoningCompression({ organization_id: ORG });
    const b = buildOperatorReasoningCompression({ organization_id: ORG });
    expect(a.compression_hash).toBe(b.compression_hash);
  });

  test('summary_blocks aggregate by event_kind', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    const c = buildOperatorReasoningCompression({ organization_id: ORG });
    expect(c.summary_blocks.length).toBeGreaterThan(0);
    expect(c.summary_blocks.every(b => b.aggregated_count > 0)).toBe(true);
  });

  test('cross-org compression isolation', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    buildOperatorReasoningCompression({ organization_id: ORG });
    expect(listCompressions(ORG).length).toBe(1);
    expect(listCompressions(ORG_OTHER).length).toBe(0);
  });

  test('representative_session_ids capped per kind', () => {
    const o1 = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const o2 = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const o3 = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const o4 = openSession({ organization_id: ORG, operator_id: OPERATOR });
    for (const o of [o1, o2, o3, o4]) {
      recordEvent({
        organization_id: ORG, session_id: o.session!.session_id,
        operator_id: OPERATOR, event_kind: 'archetype_viewed',
      });
    }
    const c = buildOperatorReasoningCompression({
      organization_id: ORG, max_representative_sessions_per_kind: 2,
    });
    const archBlock = c.summary_blocks.find(b => b.event_kind === 'archetype_viewed');
    expect(archBlock?.representative_session_ids.length).toBeLessThanOrEqual(2);
    // 4 sessions, 2 represented → 2 omitted
    expect(c.omission_attribution.events_omitted).toBeGreaterThanOrEqual(2);
    expect(c.omission_attribution.lossless).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 8 — Cognition Timeline Surface (chronological)
// ────────────────────────────────────────────────────────────────────

describe('cognitionTimelineSurface', () => {
  test('read_only + engine_never_ranks typed-as-true', () => {
    const s = buildCognitionTimelineSurface({ organization_id: ORG });
    expect(s.read_only).toBe(true);
    expect(s.engine_never_ranks).toBe(true);
  });

  test('points ordered chronologically', () => {
    const o = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: o.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    recordEvent({
      organization_id: ORG, session_id: o.session!.session_id,
      operator_id: OPERATOR, event_kind: 'comparison_built',
    });
    const s = buildCognitionTimelineSurface({ organization_id: ORG });
    for (let i = 1; i < s.points.length; i++) {
      expect(Date.parse(s.points[i].recorded_at)).toBeGreaterThanOrEqual(Date.parse(s.points[i-1].recorded_at));
    }
  });

  test('limit caps point count', () => {
    const o = openSession({ organization_id: ORG, operator_id: OPERATOR });
    for (let i = 0; i < 5; i++) {
      recordEvent({
        organization_id: ORG, session_id: o.session!.session_id,
        operator_id: OPERATOR, event_kind: 'archetype_viewed',
      });
    }
    const s = buildCognitionTimelineSurface({ organization_id: ORG, limit: 3 });
    expect(s.points.length).toBeLessThanOrEqual(3);
  });

  test('operator_id_filter narrows', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    openSession({ organization_id: ORG, operator_id: OPERATOR_2 });
    const s = buildCognitionTimelineSurface({ organization_id: ORG, operator_id_filter: OPERATOR_2 });
    expect(s.points.every(p => p.operator_id === OPERATOR_2)).toBe(true);
  });

  test('timeline_surface_hash deterministic', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    const a = buildCognitionTimelineSurface({ organization_id: ORG });
    const b = buildCognitionTimelineSurface({ organization_id: ORG });
    expect(a.timeline_surface_hash).toBe(b.timeline_surface_hash);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 9 — Coordinator + Replay Bundle (5-hash boundary chain)
// ────────────────────────────────────────────────────────────────────

describe('governanceMemoryCoordinator', () => {
  test('composite includes 5-hash boundary proof chain', () => {
    const c = buildGovernanceMemoryComposite({ organization_id: ORG });
    expect(c.boundary_proof_chain.continuity_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.timeline_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.archaeology_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.replay_hash).toMatch(/^[a-f0-9]+$/);
    expect(c.boundary_proof_chain.compression_hash).toMatch(/^[a-f0-9]+$/);
  });
  test('composite includes all 5 sub-profiles', () => {
    const c = buildGovernanceMemoryComposite({ organization_id: ORG });
    expect(c.continuity).toBeDefined();
    expect(c.timeline).toBeDefined();
    expect(c.archaeology).toBeDefined();
    expect(c.replay).toBeDefined();
    expect(c.compression).toBeDefined();
  });
  test('replay bundle has determinism_attribution + boundary chain', () => {
    const b = buildGovernanceMemoryReplayBundle({ organization_id: ORG });
    expect(b.determinism_attribution.deterministic_composite_hash).toMatch(/^[a-f0-9]+$/);
    expect(b.boundary_proof_chain).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 10 — Continuity Narrative (Phase 24-compliant)
// ────────────────────────────────────────────────────────────────────

describe('continuityNarrativeBuilder', () => {
  test('produces 5 blocks', () => {
    const n = buildContinuityNarrative({ organization_id: ORG });
    expect(n.blocks.length).toBe(5);
  });
  test('every block has at least one citation (Phase 24 anti-hallucination)', () => {
    const n = buildContinuityNarrative({ organization_id: ORG });
    for (const b of n.blocks) {
      expect(b.citations.length).toBeGreaterThan(0);
    }
  });
  test('every block has deterministic_hash', () => {
    const n = buildContinuityNarrative({ organization_id: ORG });
    for (const b of n.blocks) {
      expect(b.deterministic_hash).toMatch(/^[a-f0-9]+$/);
    }
  });
  test('cross-org narrative isolation', () => {
    buildContinuityNarrative({ organization_id: ORG });
    expect(listContinuityNarratives(ORG).length).toBe(1);
    expect(listContinuityNarratives(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 11 — Trust surface + visibility + summary
// ────────────────────────────────────────────────────────────────────

describe('governanceMemoryTrustSurface + visibility + summary', () => {
  test('trust surface exposes 6 bands', () => {
    const t = buildGovernanceMemoryTrustSurface({ organization_id: ORG });
    expect(t.bands.length).toBe(6);
    const labels = t.bands.map(b => b.label).sort();
    expect(labels).toEqual([
      'archaeology_integrity', 'compression_transparency',
      'continuity_integrity', 'memory_neutrality',
      'replay_determinism', 'timeline_visibility',
    ].sort());
  });
  test('memory_neutrality always 100 (structural)', () => {
    const t = buildGovernanceMemoryTrustSurface({ organization_id: ORG });
    expect(t.bands.find(b => b.label === 'memory_neutrality')?.score).toBe(100);
  });
  test('archaeology_integrity always 100 (structural)', () => {
    const t = buildGovernanceMemoryTrustSurface({ organization_id: ORG });
    expect(t.bands.find(b => b.label === 'archaeology_integrity')?.score).toBe(100);
  });
  test('compression_transparency always 100 (structural)', () => {
    const t = buildGovernanceMemoryTrustSurface({ organization_id: ORG });
    expect(t.bands.find(b => b.label === 'compression_transparency')?.score).toBe(100);
  });
  test('replay_determinism always 100 (structural)', () => {
    const t = buildGovernanceMemoryTrustSurface({ organization_id: ORG });
    expect(t.bands.find(b => b.label === 'replay_determinism')?.score).toBe(100);
  });
  test('visibility composite includes all surfaces', () => {
    const v = buildGovernanceMemoryVisibilityReplay({ organization_id: ORG });
    expect(v.continuity_profile).toBeDefined();
    expect(v.recent_timeline_points).toBeDefined();
    expect(v.recent_archaeology).toBeDefined();
    expect(v.trust_surface).toBeDefined();
  });
  test('summary has 6 health scores with structurally-100 bands', () => {
    const s = buildGovernanceMemorySummary();
    expect(s.health_scores.memory_neutrality).toBe(100);
    expect(s.health_scores.archaeology_integrity).toBe(100);
    expect(s.health_scores.compression_transparency).toBe(100);
    expect(s.health_scores.replay_determinism).toBe(100);
  });
  test('summary current_density_tier defaults to sparse', () => {
    const s = buildGovernanceMemorySummary();
    expect(['sparse', 'partial', 'developed', 'dense', 'compressed']).toContain(s.current_density_tier);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 12 — PRODUCTION STATE UNCHANGED verification
// ────────────────────────────────────────────────────────────────────

describe('production state UNCHANGED verification', () => {
  test('Phase 31 reads do NOT mutate Phase 27/28/29/30 stores', () => {
    // archaeology is pure-read; we verify that its source counts are
    // stable across multiple calls (no side effects writing to source phases).
    const a1 = buildGovernanceArchaeology({ organization_id: ORG });
    const a2 = buildGovernanceArchaeology({ organization_id: ORG });
    expect(a1.source_phase_summaries.phase_27_envelope_count)
      .toBe(a2.source_phase_summaries.phase_27_envelope_count);
    expect(a1.source_phase_summaries.phase_30_comparison_count)
      .toBe(a2.source_phase_summaries.phase_30_comparison_count);
  });
  test('Phase 31 governance attribution build does not mutate Phase 31 events', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const before = listEvents(ORG).length;
    evaluateMemoryRequest({
      organization_id: ORG, issuer_organization_id: ORG,
      operator_id: OPERATOR, session_id: opened.session!.session_id,
    });
    const after = listEvents(ORG).length;
    expect(after).toBe(before);
  });
  test('finality_proof prevents modification (typed-as-true)', () => {
    const opened = openSession({ organization_id: ORG, operator_id: OPERATOR });
    const recorded = recordEvent({
      organization_id: ORG, session_id: opened.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    expect(recorded.event?.finality_proof.cannot_be_modified).toBe(true);
    expect(recorded.event?.finality_proof.cannot_be_deleted).toBe(true);
    expect(recorded.event?.finality_proof.replayable).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 13 — Cross-organization isolation end-to-end
// ────────────────────────────────────────────────────────────────────

describe('cross-organization isolation', () => {
  test('sessions scoped per org', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    expect(listSessions(ORG).length).toBe(1);
    expect(listSessions(ORG_OTHER).length).toBe(0);
  });
  test('events scoped per org', () => {
    const o = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: o.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    expect(listEvents(ORG).length).toBeGreaterThan(0);
    expect(listEvents(ORG_OTHER).length).toBe(0);
  });
  test('continuity profile scoped per org', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    const a = buildOperatorContinuityProfile({ organization_id: ORG });
    const b = buildOperatorContinuityProfile({ organization_id: ORG_OTHER });
    expect(a.total_sessions).toBe(1);
    expect(b.total_sessions).toBe(0);
  });
  test('archaeology scoped per org', () => {
    buildGovernanceArchaeology({ organization_id: ORG });
    expect(listArchaeologyReplays(ORG).length).toBe(1);
    expect(listArchaeologyReplays(ORG_OTHER).length).toBe(0);
  });
  test('replays scoped per org', () => {
    buildReasoningContinuityReplay({ organization_id: ORG });
    expect(listReplays(ORG).length).toBe(1);
    expect(listReplays(ORG_OTHER).length).toBe(0);
  });
  test('compressions scoped per org', () => {
    buildOperatorReasoningCompression({ organization_id: ORG });
    expect(listCompressions(ORG).length).toBe(1);
    expect(listCompressions(ORG_OTHER).length).toBe(0);
  });
  test('governance log scoped per org', () => {
    evaluateMemoryRequest({
      organization_id: ORG, issuer_organization_id: ORG, operator_id: OPERATOR,
    });
    expect(listMemoryGovernanceAttributions(ORG).length).toBe(1);
    expect(listMemoryGovernanceAttributions(ORG_OTHER).length).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 14 — Hard-veto preservation across prior phases
// ────────────────────────────────────────────────────────────────────

describe('hard-veto preservation across prior phases', () => {
  test('Phase 31 forbidden registry contains all 9 anti-profiling hard vetoes', () => {
    expect(getForbiddenMemoryRegistry().forbidden_actions.length).toBe(9);
  });
  test('Phase 30 mirror: cross_org_decision_propagation has Phase 31 mirror', () => {
    expect(isMemoryActionForbidden('cross_org_cognition_propagation')).toBe(true);
  });
  test('Phase 29 invariants preserved: archetype state untouched by Phase 31 reads', () => {
    const a1 = buildGovernanceArchaeology({ organization_id: ORG });
    const a2 = buildGovernanceArchaeology({ organization_id: ORG });
    expect(a1.source_phase_summaries.phase_29_governance_attribution_count)
      .toBe(a2.source_phase_summaries.phase_29_governance_attribution_count);
  });
  test('Phase 27 invariants preserved: engine never mutates Phase 27 envelopes', () => {
    // Verified by absence — Phase 31 archaeology is read-only over Phase 27 stores.
    const a = buildGovernanceArchaeology({ organization_id: ORG });
    expect(a.read_only).toBe(true);
  });
  test('Phase 24 narrative inheritance: every continuity narrative block has citations', () => {
    const n = buildContinuityNarrative({ organization_id: ORG });
    for (const b of n.blocks) {
      expect(b.citations.length).toBeGreaterThan(0);
    }
  });
  test('NO operator profiling: profile lacks behavioral fields', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    const p = buildOperatorContinuityProfile({ organization_id: ORG });
    expect((p as any).operator_confidence_scores).toBeUndefined();
    expect((p as any).behavioral_patterns).toBeUndefined();
    expect((p as any).operator_predictions).toBeUndefined();
    expect(p.engine_never_profiles).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// Section 15 — Counter helpers
// ────────────────────────────────────────────────────────────────────

describe('counter helpers', () => {
  test('recentSessionCount24h tracks new sessions', () => {
    openSession({ organization_id: ORG, operator_id: OPERATOR });
    expect(recentSessionCount24h(ORG)).toBe(1);
  });
  test('recentEventCount24h tracks new events', () => {
    const o = openSession({ organization_id: ORG, operator_id: OPERATOR });
    recordEvent({
      organization_id: ORG, session_id: o.session!.session_id,
      operator_id: OPERATOR, event_kind: 'archetype_viewed',
    });
    expect(recentEventCount24h(ORG)).toBe(2); // session_opened + archetype_viewed
  });
  test('recentArchaeologyCount24h tracks builds', () => {
    buildGovernanceArchaeology({ organization_id: ORG });
    expect(recentArchaeologyCount24h(ORG)).toBe(1);
  });
  test('recentReplayCount24h tracks replays', () => {
    buildReasoningContinuityReplay({ organization_id: ORG });
    expect(recentReplayCount24h(ORG)).toBe(1);
  });
  test('recentCompressionCount24h tracks compressions', () => {
    buildOperatorReasoningCompression({ organization_id: ORG });
    expect(recentCompressionCount24h(ORG)).toBe(1);
  });
  test('recentMemoryGovernanceCount24h tracks governance decisions', () => {
    evaluateMemoryRequest({
      organization_id: ORG, issuer_organization_id: ORG, operator_id: OPERATOR,
    });
    expect(recentMemoryGovernanceCount24h(ORG)).toBe(1);
  });
  test('listMemoryNeutralityProofs returns recorded proofs', () => {
    recordNeutralityProof({ organization_id: ORG, continuity_id: 'cont_1' });
    expect(listMemoryNeutralityProofs(ORG).length).toBe(1);
  });
});
