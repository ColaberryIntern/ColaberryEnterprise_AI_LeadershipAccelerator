import { readLearnerSignals } from '../../explorerGrowth/explorerSignalReader';
import { scoreLearner } from '../../explorerGrowth/explorerScoringService';
import { getLearnerJourney, type LearnerJourneyView } from '../explorerFacade';
import type { SubjectAnchor } from '../subjectResolver';
import type { LearnerFacts } from '../governor/types';
import type { ExplorerAffinity } from '../../../types/explorerGrowth';

/**
 * Load what Explorer knows about a learner subject, for `ctx.learner` (T309).
 *
 * ─── THROUGH THE FACADE, THEN EXPLORER'S OWN READER AND SCORER ─────────────
 *
 * The profile comes from T206's facade — `getLearnerJourney` — which is the
 * sanctioned way for generic code to reach Explorer, and which answers
 * `not_a_learner`, `learner_without_profile` and `unresolved` as first-class
 * results rather than nulls to be guessed at. Each of those becomes a
 * `no_learner_profile` here with the facade's own word as the reason.
 *
 * The readout and the scores are then produced the way Explorer's own runner
 * produces them (`runGovernor.runOne`): `readLearnerSignals` for the readout
 * and `scoreLearner` over it, fresh, never the profile's stored E/I/F. The
 * facade does not expose the readout — it wraps the four Command Center read
 * services and `readLearnerSignals` is not one of them — so it is called
 * directly. That is an Explorer READ function used unchanged, the same one
 * `runGovernor` calls, not a reach past the facade into Explorer's tables.
 *
 * ─── WHAT IS NOT DONE HERE ─────────────────────────────────────────────────
 *
 * No write. No profile is created for a subject who lacks one — the answer is
 * `no_learner_profile`, and the strategy turns that into a refusal that says
 * so. A profile with no `primary_state` is reported the same way: Explorer's
 * generators all read the state, and running them on a null would be a
 * fabrication with extra steps.
 *
 * `freshness` is NOT loaded here. The facade's `LearnerProfile` carries
 * `scores_computed_at` but not `created_at`, and the freshness gate needs
 * both; the decision writer (T311) reads the pair. Carried, not hidden.
 */

export type LearnerFactsResult =
  | { status: 'learner'; facts: LearnerFacts }
  | { status: 'no_learner_profile'; reason: string };

/** Injected so the loader is testable with no database, and so a test states what Explorer answered. */
export interface LearnerFactsDeps {
  getLearnerJourney?: (anchor: SubjectAnchor) => Promise<LearnerJourneyView>;
  readLearnerSignals?: typeof readLearnerSignals;
  scoreLearner?: typeof scoreLearner;
}

/** Keep only the entries Explorer's own affinity writer produces; the column is untyped JSONB. */
function affinitiesOf(raw: Record<string, unknown>[] | null | undefined): ExplorerAffinity[] {
  if (!Array.isArray(raw)) return [];
  const out: ExplorerAffinity[] = [];
  for (const a of raw) {
    if (a && typeof a.tag === 'string' && typeof a.confidence === 'number' && Number.isFinite(a.confidence)) {
      out.push({ tag: a.tag, confidence: a.confidence, ...(Array.isArray(a.sources) ? { sources: a.sources as string[] } : {}) });
    }
  }
  return out;
}

function dateOrNull(raw: string | Date | null | undefined): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function loadLearnerFacts(
  anchor: SubjectAnchor,
  asOf: Date,
  deps: LearnerFactsDeps = {},
): Promise<LearnerFactsResult> {
  const journey = await (deps.getLearnerJourney ?? getLearnerJourney)(anchor);
  if (journey.status !== 'learner') {
    // The facade's own vocabulary, verbatim: `not_a_learner`,
    // `learner_without_profile`, or `unresolved:<why>`.
    const reason = journey.status === 'unresolved' ? `unresolved:${journey.reason}` : journey.status;
    return { status: 'no_learner_profile', reason };
  }

  const { profile } = journey;
  if (!profile.primary_state) {
    return { status: 'no_learner_profile', reason: 'profile_has_no_state' };
  }

  const readout = await (deps.readLearnerSignals ?? readLearnerSignals)(journey.enrollment_id, { asOf });
  const scores = (deps.scoreLearner ?? scoreLearner)(readout);

  return {
    status: 'learner',
    facts: {
      enrollment_id: journey.enrollment_id,
      primary_state: profile.primary_state,
      overlays: profile.overlays ?? [],
      scores: { e: scores.e, i: scores.i, f: scores.f },
      affinities: affinitiesOf(profile.affinities),
      readout,
      state_entered_at: dateOrNull(profile.state_entered_at),
    },
  };
}
