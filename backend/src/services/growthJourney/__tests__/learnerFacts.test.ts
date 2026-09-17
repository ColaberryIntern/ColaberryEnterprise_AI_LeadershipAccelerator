// The loader's three collaborators are injected, so these mocks exist only to
// keep the module-level imports from reaching a database at load time.
jest.mock('../ledger', () => ({ recordJourneyEvent: jest.fn(async () => ({ recorded: true })) }));  // T410: the ledger adapter, at its boundary
jest.mock('../explorerFacade', () => ({ getLearnerJourney: jest.fn() }));
jest.mock('../../explorerGrowth/explorerSignalReader', () => ({ readLearnerSignals: jest.fn() }));
jest.mock('../../explorerGrowth/explorerScoringService', () => ({ scoreLearner: jest.fn() }));

import { loadLearnerFacts, type LearnerFactsDeps } from '../strategies/learnerFacts';
import type { LearnerJourneyView } from '../explorerFacade';

/**
 * T309 — the facts loader: through the facade, then Explorer's reader and scorer.
 *
 * What these pin: every non-learner answer the facade can give becomes a
 * `no_learner_profile` carrying the facade's own word; a profile Explorer has
 * never put a state on is treated the same way rather than run through
 * generators on a null; and the facts a learner does get are Explorer's readout
 * and Explorer's scores over it — fresh, not the profile's stored E/I/F.
 */

const AS_OF = new Date('2026-09-14T12:00:00Z');
const ANCHOR = { enrollmentId: 'enr-1' } as const;

const READOUT = { enrollment_id: 'enr-1', lead_id: 77, asOf: AS_OF, lastEngagementAt: new Date('2026-09-02T12:00:00Z'), recentIntentTier: 1 };

const profile = (over: Record<string, unknown> = {}) => ({
  enrollment_id: 'enr-1',
  lead_id: 77,
  email_normalized: 'x@example.com',
  primary_state: 'ACTIVATING',
  overlays: ['DORMANT'],
  // Stored scores, which the loader must NOT use.
  e_score: 99,
  i_score: 99,
  f_score: 99,
  contactability: null,
  affinities: [
    { tag: 'python', confidence: 0.5, sources: ['card:12'] },
    { tag: 'sql', confidence: 0.2 },
    { tag: 42, confidence: 0.9 }, // malformed: dropped
    { tag: 'r', confidence: 'high' }, // malformed: dropped
    null,
  ],
  signal_summary: null,
  days_since_last_activity: 12,
  state_entered_at: '2026-08-20T00:00:00.000Z',
  last_decision_at: null,
  last_contacted_at: null,
  scores_computed_at: '2026-09-14T06:00:00.000Z',
  ...over,
});

const learnerView = (over: Record<string, unknown> = {}): LearnerJourneyView =>
  ({ status: 'learner', enrollment_id: 'enr-1', profile: profile(over), eligibility: null, participations: [] }) as unknown as LearnerJourneyView;

function deps(view: LearnerJourneyView, over: Partial<LearnerFactsDeps> = {}): LearnerFactsDeps & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    getLearnerJourney: async () => {
      calls.push('facade');
      return view;
    },
    readLearnerSignals: (async (id: string, opts: { asOf?: Date }) => {
      calls.push(`readout:${id}:${opts.asOf?.toISOString()}`);
      return READOUT;
    }) as unknown as LearnerFactsDeps['readLearnerSignals'],
    scoreLearner: ((r: unknown) => {
      calls.push(`score:${(r as { enrollment_id: string }).enrollment_id}`);
      return { e: 18, i: 4, f: 0, bands: {} };
    }) as unknown as LearnerFactsDeps['scoreLearner'],
    ...over,
  };
}

describe('a learner Explorer knows', () => {
  it('builds the facts from the facade profile, a FRESH readout and Explorer\'s scorer over it', async () => {
    const d = deps(learnerView());
    const r = await loadLearnerFacts(ANCHOR, AS_OF, d);
    expect(r.status).toBe('learner');
    if (r.status !== 'learner') return;
    expect(r.facts).toEqual({
      enrollment_id: 'enr-1',
      primary_state: 'ACTIVATING',
      overlays: ['DORMANT'],
      scores: { e: 18, i: 4, f: 0 },
      affinities: [
        { tag: 'python', confidence: 0.5, sources: ['card:12'] },
        { tag: 'sql', confidence: 0.2 },
      ],
      readout: READOUT,
      state_entered_at: new Date('2026-08-20T00:00:00.000Z'),
    });
    // The order runGovernor uses: facade, then the readout as of the decision
    // time, then the scorer over that readout.
    expect(d.calls).toEqual(['facade', 'readout:enr-1:2026-09-14T12:00:00.000Z', 'score:enr-1']);
  });

  it('never uses the profile\'s STORED scores', async () => {
    const r = await loadLearnerFacts(ANCHOR, AS_OF, deps(learnerView({ e_score: 99, i_score: 99, f_score: 99 })));
    if (r.status !== 'learner') throw new Error(r.status);
    expect(r.facts.scores).toEqual({ e: 18, i: 4, f: 0 });
  });

  it('tolerates the JSONB columns being absent or malformed', async () => {
    const r = await loadLearnerFacts(ANCHOR, AS_OF, deps(learnerView({ overlays: null, affinities: 'nope', state_entered_at: 'not a date' })));
    if (r.status !== 'learner') throw new Error(r.status);
    expect(r.facts.overlays).toEqual([]);
    expect(r.facts.affinities).toEqual([]);
    expect(r.facts.state_entered_at).toBeNull();
  });

  it('does not carry freshness — the facade has no created_at, and the writer owns the pair', async () => {
    const r = await loadLearnerFacts(ANCHOR, AS_OF, deps(learnerView()));
    if (r.status !== 'learner') throw new Error(r.status);
    expect(r.facts).not.toHaveProperty('scores_computed_at');
    expect(r.facts).not.toHaveProperty('created_at');
  });
});

describe('a subject Explorer does not know', () => {
  it.each([
    [{ status: 'not_a_learner', participations: [] }, 'not_a_learner'],
    [{ status: 'learner_without_profile', enrollment_id: 'enr-2', participations: [] }, 'learner_without_profile'],
    [{ status: 'unresolved', reason: 'no_such_lead' }, 'unresolved:no_such_lead'],
  ])('%p becomes no_learner_profile with the facade\'s own word', async (view, reason) => {
    const d = deps(view as unknown as LearnerJourneyView);
    const r = await loadLearnerFacts({ leadId: 901 }, AS_OF, d);
    expect(r).toEqual({ status: 'no_learner_profile', reason });
    // And nothing else is read: no readout, no scoring for a person with no profile.
    expect(d.calls).toEqual(['facade']);
  });

  it('a profile with no primary_state is the same answer, not a run on a null', async () => {
    const d = deps(learnerView({ primary_state: null }));
    const r = await loadLearnerFacts(ANCHOR, AS_OF, d);
    expect(r).toEqual({ status: 'no_learner_profile', reason: 'profile_has_no_state' });
    expect(d.calls).toEqual(['facade']);
  });
});
