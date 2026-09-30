/**
 * capeLearnerStateService — assembles the CAPE Phase 4 learner-state snapshot
 * (design doc §4, §9 Stage 1) the learning-value ranker scores candidates
 * against. Read-only; never writes.
 *
 * Composes Phase 0-1/2/3 outputs that already exist rather than recomputing
 * anything: `capeProficiencyService.getLearnerSkillProfile` remains the single
 * source of truth for per-skill placement/proficiency/evidence-band state.
 * This file layers two more read-only signals on top:
 *   - goal/role/industry, reused from the Phase 2 resume extraction already
 *     stored on `onboarding_profiles.extracted` (execution-contract.md
 *     Assumption 1 — Phase 4 does not introduce a new
 *     `learner_recommendation_profile` table; a learner with no resume gets
 *     neutral nulls, never a block or an error, per design doc §15 "resume
 *     absence never lowers status or access");
 *   - a recent-diagnostic-failure flag (Stage 4's stretch-item cap input,
 *     execution-contract.md Assumption 5 — no diagnostic history defaults to
 *     `false`, i.e. no suppression, never a block).
 */
import OnboardingProfile from '../../models/OnboardingProfile';
import DiagnosticAttempt from '../../models/DiagnosticAttempt';
import { getLearnerSkillProfile, type LearnerSkillProfile, type SkillProfileEntry } from './capeProficiencyService';

/** The one signal in this module that is NOT allowed to fail soft: if the
 * skill-ledger read itself fails, the learner state is unusable and every
 * downstream ranking decision would be built on a false "zero evidence"
 * floor — so this surfaces as a typed, logged error instead of a silent 0. */
export class CapeLearnerStateError extends Error {
  error_class = 'UpstreamUnavailable';
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'CapeLearnerStateError';
  }
}

function logWarn(event: string, enrollmentId: string, err: any) {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'warn',
    service: 'backend',
    event,
    error_class: err?.name || 'Error',
    outcome: 'failure',
    context: { enrollment_id: enrollmentId, message: err?.message },
  }));
}

/** Ceiling so a skill with zero Application/Judgment evidence doesn't produce
 * an unbounded (Infinity) ratio — capped, not uncapped, per CLAUDE.md's
 * "ambiguous outputs are not allowed" contract rule. */
const EVIDENCE_BALANCE_CAP = 5;

export interface LearnerSkillState extends SkillProfileEntry {
  /** knowledge / (application + judgment), capped at EVIDENCE_BALANCE_CAP.
   * >1 means "consumed a lot of passive content, built little" — the Stage 3
   * evidence-balance-need signal (design doc §9 Stage 3). 0 means no
   * knowledge evidence at all (nothing to rebalance toward application). */
  evidence_balance_ratio: number;
}

export interface LearnerState {
  enrollment_id: string;
  skills: LearnerSkillState[];
  overall_placement: number;
  overall_proficiency: number;
  goal: string | null;
  role: string | null;
  industry: string | null;
  has_resume: boolean;
  recent_failure: boolean;
  /** ISO timestamp this snapshot was assembled — stamped onto every
   * `today_feed_impressions` row scored against it (design doc §13 Stage 5). */
  learner_state_version: string;
}

function evidenceBalanceRatio(entry: SkillProfileEntry): number {
  const built = entry.application + entry.judgment;
  if (built <= 0) return entry.knowledge > 0 ? EVIDENCE_BALANCE_CAP : 0;
  return Math.min(EVIDENCE_BALANCE_CAP, entry.knowledge / built);
}

/** Look up a skill's derived state by id — the ranker's most common lookup
 * shape. Returns undefined for an unknown/inactive skill_id rather than
 * throwing (a candidate may reference a skill id that predates a definition
 * change; the caller decides how to treat "unknown"). */
export function findSkillState(state: LearnerState, skillId: string): LearnerSkillState | undefined {
  return state.skills.find((s) => s.skill_id === skillId);
}

async function loadGoalRoleIndustry(enrollmentId: string): Promise<{
  goal: string | null; role: string | null; industry: string | null; has_resume: boolean;
}> {
  try {
    const profile = await OnboardingProfile.findOne({ where: { enrollment_id: enrollmentId } });
    const extracted = (profile?.extracted ?? null) as { role?: string; industry?: string; goals?: string } | null;
    return {
      goal: extracted?.goals ?? null,
      role: extracted?.role ?? null,
      industry: extracted?.industry ?? null,
      has_resume: !!profile && Number(profile.resume_version ?? 0) > 0,
    };
  } catch (err: any) {
    logWarn('cape_learner_state_goal_lookup_failed', enrollmentId, err);
    return { goal: null, role: null, industry: null, has_resume: false };
  }
}

async function loadRecentFailure(enrollmentId: string): Promise<boolean> {
  try {
    const last = await DiagnosticAttempt.findOne({
      where: { enrollment_id: enrollmentId },
      order: [['created_at', 'DESC']],
    });
    return last?.outcome === 'not_confirmed';
  } catch (err: any) {
    logWarn('cape_learner_state_diagnostic_lookup_failed', enrollmentId, err);
    return false; // Assumption 5: unknown -> no suppression, never blocks ranking
  }
}

/**
 * Assemble the full learner-state snapshot for one enrollment. Never mutates
 * anything; safe to call as often as needed (e.g. once per Today page load).
 */
export async function getLearnerState(enrollmentId: string): Promise<LearnerState> {
  let profile: LearnerSkillProfile;
  try {
    profile = await getLearnerSkillProfile(enrollmentId);
  } catch (err: any) {
    throw new CapeLearnerStateError(`getLearnerSkillProfile failed for enrollment ${enrollmentId}`, err);
  }

  const [{ goal, role, industry, has_resume }, recent_failure] = await Promise.all([
    loadGoalRoleIndustry(enrollmentId),
    loadRecentFailure(enrollmentId),
  ]);

  const skills: LearnerSkillState[] = profile.skills.map((s) => ({ ...s, evidence_balance_ratio: evidenceBalanceRatio(s) }));

  return {
    enrollment_id: enrollmentId,
    skills,
    overall_placement: profile.overall_placement,
    overall_proficiency: profile.overall_proficiency,
    goal,
    role,
    industry,
    has_resume,
    recent_failure,
    learner_state_version: new Date().toISOString(),
  };
}
