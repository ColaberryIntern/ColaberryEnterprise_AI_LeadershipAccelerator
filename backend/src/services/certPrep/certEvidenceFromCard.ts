import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import CertEvidenceMapping from '../../models/CertEvidenceMapping';
import { getCurrentBlueprint } from './certBlueprintService';

/**
 * Write-back: a completed card proposes the evidence its type says it produces.
 *
 * This is the last joint in the classroom loop. Phase 1 grouped the week into
 * its buckets, Phase 2 made each section resolve its own next action, Phase 3
 * decided which card types evidence which objectives — and none of it moved a
 * student's readiness, because nothing wrote anything back. Finishing a Prompt
 * Lab left no trace on the certification side at all.
 *
 * WHAT IT DOES NOT DO, which is most of it:
 *
 *   - It does NOT verify. Every row lands `pending`, exactly like the artifact
 *     matcher. Auto-matching proposes and a named human disposes; readiness
 *     counts verified rows only, and a student cannot verify their own work.
 *   - It does NOT invent a mapping. A card whose type has no
 *     `certification_mapping` produces nothing, silently and correctly. Most
 *     types are unmapped ON PURPOSE — see typeCertificationMap.ts — because
 *     what they evidence belongs to the week rather than the kind.
 *   - It does NOT fail a completion. A student who finished their work has
 *     finished it; an evidence write that throws must never take that away.
 *     The caller wraps this, and this swallows its own errors too.
 *
 * IDEMPOTENT BY CONSTRUCTION. `findOrCreate` against the unique index on
 * (enrollment, objective, source_type, source_id) means completing the same
 * card twice proposes nothing the second time. The index was corrected in this
 * phase: it used to key on domain rather than objective, so a card evidencing
 * three objectives in one domain quietly recorded one.
 */

export interface CardEvidenceResult {
  proposed: number;
  /** Objectives the card's type claims, whether or not a row was new. */
  claimed: string[];
  /** Set when nothing was proposed and it is worth knowing why. */
  reason?: 'no_mapping' | 'no_blueprint' | 'unknown_type' | 'error';
}

interface TypeMappingRow {
  certification_mapping: { objective_ids?: string[]; rationale?: string } | null;
}

const EMPTY = (reason: CardEvidenceResult['reason']): CardEvidenceResult =>
  ({ proposed: 0, claimed: [], reason });

/**
 * Read the type's mapping from the curriculum table rather than the code
 * registry: the mapping is data an instructor can change without a deploy, and
 * reading it from a constant would mean the product and the database disagreed
 * the moment anybody edited it.
 */
async function mappingForType(typeSlug: string): Promise<TypeMappingRow['certification_mapping']> {
  const rows = await sequelize.query<TypeMappingRow>(
    'SELECT certification_mapping FROM curriculum_type_definitions WHERE slug = :slug AND is_active LIMIT 1',
    { replacements: { slug: typeSlug }, type: QueryTypes.SELECT },
  );
  if (rows.length === 0) return null;
  const raw = rows[0].certification_mapping;
  if (!raw || typeof raw !== 'object') return null;
  return raw;
}

export async function proposeEvidenceFromCard(
  enrollmentId: string,
  card: { id: string; type: string },
): Promise<CardEvidenceResult> {
  try {
    const mapping = await mappingForType(card.type);
    const objectiveIds = Array.isArray(mapping?.objective_ids) ? mapping!.objective_ids : [];
    if (objectiveIds.length === 0) return EMPTY('no_mapping');

    const blueprint = await getCurrentBlueprint();
    if (!blueprint) return EMPTY('no_blueprint');

    const domainOf = new Map<string, string>();
    for (const domain of blueprint.domains) {
      for (const objective of domain.objectives ?? []) {
        domainOf.set(objective.objective_id, domain.domain_id);
      }
    }

    const rationale = typeof mapping?.rationale === 'string' && mapping.rationale.trim()
      ? mapping.rationale
      : `Completed a ${card.type} card.`;

    let proposed = 0;
    const claimed: string[] = [];

    for (const objectiveId of objectiveIds) {
      const domainId = domainOf.get(objectiveId);
      // An objective this blueprint version does not have is a stale mapping,
      // not a licence to invent a domain for it. The seeder validates against
      // the blueprint; this is the runtime backstop.
      if (!domainId) continue;
      claimed.push(objectiveId);

      const [, created] = await CertEvidenceMapping.findOrCreate({
        where: {
          enrollment_id: enrollmentId,
          objective_id: objectiveId,
          source_type: 'timeline_card',
          source_id: card.id,
        },
        defaults: {
          enrollment_id: enrollmentId,
          track_id: blueprint.track.track_id,
          blueprint_version: blueprint.track.blueprint_version,
          domain_id: domainId,
          objective_id: objectiveId,
          source_type: 'timeline_card',
          source_id: card.id,
          mapping_state: 'pending',   // never 'verified' — a human decides
          mapping_rationale: rationale,
          auto_matched: true,
        },
      });
      if (created) proposed += 1;
    }

    return { proposed, claimed };
  } catch (err: any) {
    // A student who finished their work has finished it. Evidence is an
    // enrichment of that fact, never a precondition for it.
    console.error('[certPrep] evidence write-back failed', { card: card.id, message: err?.message });
    return EMPTY('error');
  }
}
