/**
 * capeTimelineEvidenceBridge — the evidence-writing integration point for CAPE.
 * Turns a completed Timeline card into `student_skill_evidence` rows.
 *
 * CAPE Phase 3 (T011): rewired to read the card's STAMPED `skill_mapping` (design
 * doc §7's resolved `LearningPlacementContract` — card override -> week blueprint ->
 * type default -> AI-suggested draft, stamped at publish time by
 * `capeCardSkillMappingService.stampIfPublished` / the `backfillCurriculumSkillMaps.ts`
 * script) instead of the Phase 0-1 placeholder's hardcoded `COMPETENCY_TO_SKILL`
 * crosswalk. This is the fix for the exact, documented Phase 0-1 gap: several
 * registered types (`knowledge_check` chief among them) had an EMPTY legacy
 * `competencies` array and therefore wrote ZERO CAPE evidence, even though design
 * doc §7 says checks/quizzes should carry real Knowledge/Judgment credit — those
 * types now have a real T005 type-default `curriculum_skill_maps` row, so a
 * `knowledge_check` completion writes real, correctly-banded evidence.
 *
 * Defensive fallback: if a card was never stamped (should be rare post-backfill —
 * e.g. a card published through an exotic path before the model hook was wired, or
 * a race between publish and this read), this module resolves LIVE via
 * `resolveSkillMapping` and logs the fallback (structured,
 * `event:'cape_evidence_bridge_unstamped_card_fallback'`) rather than silently
 * treating the card as zero-credit.
 *
 * Wired into progressionService.onCardCompleted() as a single additive,
 * NON-FATAL call — a CAPE evidence-write failure never blocks card completion,
 * XP, or points (Failure-First Design: this module owns its own try/catch and
 * structured error logging; the caller never needs to guard against it throwing).
 *
 * Because this only runs from onCardCompleted() — which already gates on
 * lock/watch/field-guide/dwell requirements before it's ever called — click,
 * dwell, and streak signals ALONE can never reach this module (design doc §17 AC 7).
 */
import TimelineCard from '../../models/TimelineCard';
import type { EvidenceBand } from '../../models/StudentSkillEvidence';
import type { ArchitectureSkillImpact, LearningPlacementContract } from '../../models/CurriculumSkillMap';
import { recordSkillEvidence, buildIdempotencyKey } from './capeEvidenceLedgerService';
import { recomputeStudentArchitectureSkill } from './capeProficiencyService';
import { resolveSkillMapping } from './capeCurriculumSkillMapService';

export interface SkillImpactWrite {
  skill_id: ArchitectureSkillImpact['skill_id'];
  band: EvidenceBand;
  credit: number;
  idempotency_key: string;
  mapping_version: number | null;
}

/**
 * Expands a resolved `LearningPlacementContract`'s `skill_impacts` into concrete
 * `student_skill_evidence` writes. An impact naming MULTIPLE bands (e.g. a capstone
 * type impacting both `application` and `judgment`) writes ONE row per band, each
 * at the impact's full `max_credit` — this is not "splitting" a fixed budget between
 * two currencies; `student_skill_evidence`'s bands are summed independently per axis
 * (`capeProficiencyService.sumBand`), so evidence strong enough to demonstrate both
 * dimensions legitimately counts toward both (design doc §6: "GitHub-backed
 * implementation... Strong Application growth" and "Instructor-approved architecture
 * work... Strong Application/Judgment growth").
 *
 * Idempotency-key backward compatibility: a single-band impact (the common case, and
 * the ONLY shape the Phase 0-1 placeholder ever produced) keeps the exact original
 * `timeline:<enrollment_id>:<card_id>:<skill_id>` key format, so re-completing a card
 * that was already evidenced under the placeholder-era writer is still correctly
 * deduped. Only a SECOND+ band on a multi-band impact (a shape that literally could
 * not exist before this task) gets a `:<band>`-suffixed key — new information, never
 * previously recorded, so there is nothing for it to collide with.
 */
export function expandContractToWrites(
  contract: LearningPlacementContract,
  enrollmentId: string,
  cardId: string,
  mappingVersion: number | null,
): SkillImpactWrite[] {
  const writes: SkillImpactWrite[] = [];
  for (const impact of contract.skill_impacts) {
    if (impact.max_credit <= 0 || impact.bands.length === 0) continue;
    impact.bands.forEach((band, i) => {
      const baseKey = buildIdempotencyKey.timeline(enrollmentId, cardId, impact.skill_id);
      const idempotency_key = i === 0 ? baseKey : `${baseKey}:${band}`;
      writes.push({
        skill_id: impact.skill_id,
        band: band as EvidenceBand,
        credit: impact.max_credit,
        idempotency_key,
        mapping_version: mappingVersion,
      });
    });
  }
  return writes;
}

/**
 * Writes CAPE evidence for a just-completed card and recomputes the touched
 * skills. Never throws — a failure is logged (structured, with error_class) and
 * swallowed so it can never block the caller's card-completion flow.
 */
export async function recordCapeEvidenceForCompletedCard(
  enrollmentId: string,
  card: { id: string; type: string }
): Promise<void> {
  try {
    const full = await TimelineCard.findByPk(card.id, {
      attributes: ['id', 'type', 'week', 'skill_mapping', 'skill_mapping_version'],
    });
    if (!full) return; // card was deleted between completion and this read — nothing to credit

    let contract: LearningPlacementContract;
    let mappingVersion: number | null;

    if (full.skill_mapping && Array.isArray(full.skill_mapping.skill_impacts)) {
      contract = full.skill_mapping as LearningPlacementContract;
      mappingVersion = full.skill_mapping_version ?? null;
    } else {
      // Defensive fallback — should be rare post-backfill (T010) + live stamp hook (T009).
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
        event: 'cape_evidence_bridge_unstamped_card_fallback', outcome: 'partial',
        context: { enrollment_id: enrollmentId, card_id: card.id, card_type: card.type },
      }));
      const resolved = await resolveSkillMapping({ cardId: full.id, typeSlug: full.type, weekNumber: full.week });
      contract = resolved.contract;
      mappingVersion = resolved.version;
    }

    const writes = expandContractToWrites(contract, enrollmentId, card.id, mappingVersion);
    if (writes.length === 0) return;

    const touchedSkills = new Set<string>();
    for (const write of writes) {
      await recordSkillEvidence({
        enrollment_id: enrollmentId,
        skill_id: write.skill_id,
        band: write.band,
        credit: write.credit,
        source: 'timeline',
        source_ref: card.id,
        idempotency_key: write.idempotency_key,
        mapping_version: write.mapping_version,
      });
      touchedSkills.add(write.skill_id);
    }
    for (const skillId of touchedSkills) {
      await recomputeStudentArchitectureSkill(enrollmentId, skillId);
    }
  } catch (err: any) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'cape_evidence_write_failed',
      error_class: err?.name || 'Error',
      outcome: 'failure',
      context: { enrollment_id: enrollmentId, card_id: card.id, card_type: card.type, message: err?.message },
    }));
  }
}
