/**
 * capeSkillEvidenceHistoryService — CAPE Phase 5 skill-detail drawer backend
 * (design doc §11 "AI Architecture Skills radar" click-through, §16 Phase 5).
 * Read-only; never writes.
 *
 * Extends the Phase 0-1/3 read paths (capeProficiencyService, StudentSkillEvidence)
 * rather than building a parallel history mechanism.
 */
import { StudentSkillEvidence } from '../../models';
import CurriculumSkillMap from '../../models/CurriculumSkillMap';
import { getLearnerSkillProfile } from './capeProficiencyService';
import { resolve as resolveType } from '../timeline/typeRegistry';

export interface SkillEvidenceRow {
  band: string;
  credit: number;
  source: string;
  created_at: string;
}

export interface SkillEvidenceHistory {
  skill_id: string;
  placement: number;
  verified: number;
  evidence: SkillEvidenceRow[];
  next_review_at: string | null;
  next_recommended_proof: string | null;
}

const EVIDENCE_HISTORY_CAP = 50;

function logWarn(event: string, context: Record<string, unknown>, err: any) {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event,
    error_class: err?.name || 'Error', outcome: 'failure', context: { ...context, message: err?.message },
  }));
}

/** Newest-first, capped, learner-facing evidence rows only (band/credit/source/
 * created_at — never `idempotency_key`/`source_ref`/`metadata`, which may carry
 * internal identifiers not meant for direct display). Fail-soft: a query error
 * returns an empty list rather than blocking the whole drawer response. */
async function loadEvidenceRows(enrollmentId: string, skillId: string): Promise<SkillEvidenceRow[]> {
  try {
    const rows = await StudentSkillEvidence.findAll({
      where: { enrollment_id: enrollmentId, skill_id: skillId },
      order: [['created_at', 'DESC']],
      limit: EVIDENCE_HISTORY_CAP,
      attributes: ['band', 'credit', 'source', 'created_at'],
    });
    return rows.map((r) => ({
      band: r.band, credit: Number(r.credit), source: r.source,
      created_at: r.created_at.toISOString(),
    }));
  } catch (err: any) {
    logWarn('cape_skill_evidence_history_load_failed', { enrollment_id: enrollmentId, skill_id: skillId }, err);
    return [];
  }
}

/**
 * The first current+approved type-default mapping whose skill_impacts include
 * this skill with an 'application' band, resolved to a human-readable "go
 * build this" pointer. Filtered in application code (not a JSONB SQL
 * predicate) since the type-scope table is small (~50 rows) and this keeps
 * the query simple and correct. `null` when nothing qualifies — a legitimate
 * state (learner has no application-band proof left mapped), never an error.
 *
 * LOGGED SIMPLIFICATION (flagged at task-verification, accepted rather than
 * expanding scope): this resolves the first matching TYPE-scope mapping only
 * — it does not join against the learner's actual completed cards (would
 * require `resolveMappingForCard` per-card plus a completion-status join
 * across `timeline_card_progress`), and it does not consider card/week-level
 * mapping overrides. In practice this means a returned pointer could name an
 * activity type the learner has already completed, rather than strictly "the
 * first NOT-yet-completed" card as design doc §11's drawer concept implies.
 * Low blast radius (a presentational suggestion, not a gate or an evidence
 * write) and reversible; a real fix is a natural Phase 6 Feed-Control-era
 * follow-up once per-card completion joins are needed elsewhere too.
 */
async function nextRecommendedProof(skillId: string): Promise<string | null> {
  try {
    const typeMaps = await CurriculumSkillMap.findAll({
      where: { scope_type: 'type', is_current: true, approved: true },
    });
    const match = typeMaps.find((m) =>
      m.skill_impacts.some((impact) => impact.skill_id === skillId && impact.bands.includes('application')));
    if (!match || !match.type_slug) return null;
    const def = resolveType(match.type_slug);
    const label = def?.student_label || def?.label || match.type_slug;
    return `Try a ${label} to build verified evidence for this skill`;
  } catch (err: any) {
    logWarn('cape_skill_next_proof_lookup_failed', { skill_id: skillId }, err);
    return null;
  }
}

/**
 * Assemble the skill-detail drawer's full payload for one skill. Never
 * throws for a zero-evidence learner — `evidence: []` and
 * `next_recommended_proof` are still computed independently of whether any
 * evidence exists yet.
 */
export async function getSkillEvidenceHistory(enrollmentId: string, skillId: string): Promise<SkillEvidenceHistory> {
  const profile = await getLearnerSkillProfile(enrollmentId);
  const entry = profile.skills.find((s) => s.skill_id === skillId);

  const [evidence, next_recommended_proof] = await Promise.all([
    loadEvidenceRows(enrollmentId, skillId),
    nextRecommendedProof(skillId),
  ]);

  return {
    skill_id: skillId,
    placement: entry?.placement ?? 0,
    verified: entry?.proficiency ?? 0,
    evidence,
    next_review_at: entry?.next_review_at ?? null,
    next_recommended_proof,
  };
}
