import { Op } from 'sequelize';
import CertEvidenceMapping, { CertEvidenceSourceType, CertMappingState } from '../../models/CertEvidenceMapping';
import PortfolioArtifact from '../../models/PortfolioArtifact';
import EvidenceRecord from '../../models/EvidenceRecord';
import { getCurrentBlueprint } from './certBlueprintService';

/**
 * certEvidenceService — connects work a student has actually built to the exam
 * objectives it demonstrates.
 *
 * THIS SERVICE STORES NO ARTIFACT. The artifact stays in its canonical home —
 * `portfolio_artifacts`, `evidence_records`, a project, a timeline card — and a
 * `cert_evidence_mappings` row records only which objective it satisfies, why,
 * and who confirmed it. Copying artifacts here would create a second source of
 * truth that rots silently the moment the original changes.
 *
 * AUTO-MATCHING PROPOSES; A HUMAN DISPOSES. Every candidate this service finds is
 * written as `pending`. Only an instructor path moves a row to `verified`, and
 * readiness counts verified rows only — so a student cannot self-award their way
 * to a score. That is not defensive paranoia: readiness gates a credential, and a
 * credential a student can issue to themselves is worth nothing.
 *
 * THE RULES ARE HEURISTICS AND ARE LABELLED AS SUCH. An architecture document is
 * *probably* evidence of agentic design; it is not proof. Each rule therefore
 * carries a plain-English `rationale` that is stored on the mapping, so the
 * instructor reviewing it sees the reasoning rather than an opaque match. Where we
 * have no confident signal we propose NOTHING — an unmatched objective correctly
 * reads as missing evidence, which is actionable, whereas a wrong match is worse
 * than no match because it looks like progress.
 */

/** One declarative auto-match rule. Data, not branching logic. */
export interface EvidenceMatchRule {
  /** Where the signal comes from. */
  source_type: CertEvidenceSourceType;
  /** The value that triggers it — a PortfolioArtifact.kind or EvidenceRecord.source_type. */
  signal: string;
  /** Objectives this signal is candidate evidence for. */
  objective_ids: string[];
  /** Shown to the reviewing instructor, and stored on the mapping. */
  rationale: string;
}

/**
 * The rule table for CCAR-F 1.0.
 *
 * Deliberately sparse. Only signals with a defensible connection to a specific
 * objective appear here; a generic "deliverable" or "peer_review" proves someone
 * did work, not which exam objective that work demonstrates, so those produce no
 * candidates at all rather than being sprayed across every domain.
 */
export const CCAR_F_MATCH_RULES: EvidenceMatchRule[] = [
  {
    source_type: 'portfolio_artifact',
    signal: 'architecture_doc',
    objective_ids: ['D1.1', 'D1.2', 'D1.6'],
    rationale: 'An architecture document typically states the agent loop, the coordinator/subagent split, and how work was decomposed.',
  },
  {
    source_type: 'portfolio_artifact',
    signal: 'prompt_library',
    objective_ids: ['D4.1', 'D4.2'],
    rationale: 'A prompt library is direct evidence of prompt design and few-shot patterning.',
  },
  {
    source_type: 'portfolio_artifact',
    signal: 'implementation_notes',
    objective_ids: ['D2.1', 'D2.4'],
    rationale: 'Implementation notes usually record the tool interfaces and MCP wiring the build needed.',
  },
  {
    source_type: 'portfolio_artifact',
    signal: 'case_study',
    objective_ids: ['D5.5'],
    rationale: 'A case study generally covers where human review sat and how confidence was judged.',
  },
  {
    source_type: 'evidence_record',
    signal: 'github_pr',
    objective_ids: ['D3.6'],
    rationale: 'A pull request produced through Claude Code is candidate evidence of the CI/review workflow.',
  },
  {
    source_type: 'evidence_record',
    signal: 'prompt_lab',
    objective_ids: ['D4.3'],
    rationale: 'Prompt Lab work exercises structured output and schema enforcement.',
  },
];

export interface ObjectiveEvidenceState {
  domain_id: string;
  objective_id: string;
  label: string;
  state: 'verified' | 'pending' | 'missing';
  sources: { source_type: string; source_id: string; mapping_state: CertMappingState; rationale: string | null }[];
  /** What the student should do when this objective has no verified evidence. */
  recommended_action: { kind: 'build'; label: string; detail: string } | null;
}

/**
 * What to do about a missing objective.
 *
 * Routes to a BUILD, never a reading list — the exam is scenario-based and
 * assumes six months of hands-on work, so "go read about MCP" is not preparation
 * for it. Where no lab exists yet the action says so honestly rather than
 * inventing one; those gaps are the argument for commissioning the two labs the
 * exam scenarios need and we do not have.
 */
export function recommendedActionFor(
  domainId: string,
  objectiveLabel: string,
): { kind: 'build'; label: string; detail: string } {
  return {
    kind: 'build',
    label: `Build something that demonstrates: ${objectiveLabel}`,
    detail: `No verified artifact yet covers this ${domainId} objective. Closing it means shipping something, not reading about it — the exam is scenario-based and assumes hands-on experience.`,
  };
}

/**
 * Scan a student's canonical artifacts and propose candidate mappings.
 *
 * Idempotent by construction: the unique
 * (enrollment_id, domain_id, source_type, source_id) index means re-running
 * proposes nothing new for an artifact already considered, and — importantly —
 * never resets a mapping an instructor has already verified or rejected. A
 * rejected candidate stays rejected rather than reappearing every night.
 */
export async function proposeCandidates(
  enrollmentId: string,
  trackId?: string,
): Promise<{ proposed: number; considered: number }> {
  const blueprint = await getCurrentBlueprint(trackId);
  if (!blueprint) return { proposed: 0, considered: 0 };

  const { track } = blueprint;
  const validObjectives = new Map<string, string>(); // objective_id -> domain_id
  for (const domain of blueprint.domains) {
    for (const objective of domain.objectives ?? []) {
      validObjectives.set(objective.objective_id, domain.domain_id);
    }
  }

  const [artifacts, records] = await Promise.all([
    PortfolioArtifact.findAll({ where: { enrollment_id: enrollmentId }, attributes: ['id', 'kind'] }),
    EvidenceRecord.findAll({ where: { enrollment_id: enrollmentId }, attributes: ['id', 'source_type'] }),
  ]);

  const signals: { source_type: CertEvidenceSourceType; source_id: string; signal: string }[] = [
    ...artifacts.map((a) => ({ source_type: 'portfolio_artifact' as const, source_id: String(a.id), signal: String(a.kind) })),
    ...records.map((r) => ({ source_type: 'evidence_record' as const, source_id: String(r.id), signal: String(r.source_type) })),
  ];

  let proposed = 0;
  for (const item of signals) {
    const rules = CCAR_F_MATCH_RULES.filter(
      (rule) => rule.source_type === item.source_type && rule.signal === item.signal,
    );
    for (const rule of rules) {
      for (const objectiveId of rule.objective_ids) {
        const domainId = validObjectives.get(objectiveId);
        // A rule naming an objective this blueprint version does not have is a
        // stale rule, not a reason to invent a mapping. Skip it silently here;
        // the rule-integrity test is what catches it in CI.
        if (!domainId) continue;

        const [, created] = await CertEvidenceMapping.findOrCreate({
          where: {
            enrollment_id: enrollmentId,
            domain_id: domainId,
            source_type: item.source_type,
            source_id: item.source_id,
          },
          defaults: {
            enrollment_id: enrollmentId,
            track_id: track.track_id,
            blueprint_version: track.blueprint_version,
            domain_id: domainId,
            objective_id: objectiveId,
            source_type: item.source_type,
            source_id: item.source_id,
            mapping_state: 'pending',      // never 'verified' — a human decides
            mapping_rationale: rule.rationale,
            auto_matched: true,
          },
        });
        if (created) proposed += 1;
      }
    }
  }

  return { proposed, considered: signals.length };
}

/**
 * The student-facing evidence map: every blueprint objective with its state and,
 * where missing, what to build.
 */
export async function getEvidenceMap(
  enrollmentId: string,
  trackId?: string,
): Promise<{ objectives: ObjectiveEvidenceState[]; verified: number; pending: number; total: number } | null> {
  const blueprint = await getCurrentBlueprint(trackId);
  if (!blueprint) return null;

  const mappings = await CertEvidenceMapping.findAll({
    where: {
      enrollment_id: enrollmentId,
      track_id: blueprint.track.track_id,
      blueprint_version: blueprint.track.blueprint_version,
      mapping_state: { [Op.in]: ['pending', 'verified'] },
    },
  });

  const byObjective = new Map<string, typeof mappings>();
  for (const m of mappings) {
    if (!m.objective_id) continue;
    const list = byObjective.get(m.objective_id) ?? [];
    list.push(m);
    byObjective.set(m.objective_id, list as typeof mappings);
  }

  const objectives: ObjectiveEvidenceState[] = [];
  for (const domain of blueprint.domains) {
    for (const objective of domain.objectives ?? []) {
      const found = byObjective.get(objective.objective_id) ?? [];
      const isVerified = found.some((m) => m.mapping_state === 'verified');
      const state: ObjectiveEvidenceState['state'] = isVerified
        ? 'verified'
        : found.length > 0 ? 'pending' : 'missing';

      objectives.push({
        domain_id: domain.domain_id,
        objective_id: objective.objective_id,
        label: objective.label,
        state,
        sources: found.map((m) => ({
          source_type: m.source_type,
          source_id: m.source_id,
          mapping_state: m.mapping_state,
          rationale: m.mapping_rationale,
        })),
        // Pending evidence is not evidence yet, so an objective awaiting review
        // still shows the student what would close it.
        recommended_action: isVerified ? null : recommendedActionFor(domain.domain_id, objective.label),
      });
    }
  }

  return {
    objectives,
    verified: objectives.filter((o) => o.state === 'verified').length,
    pending: objectives.filter((o) => o.state === 'pending').length,
    total: objectives.length,
  };
}

/**
 * An instructor's decision on a candidate.
 *
 * `verifiedBy` is required and recorded — an unattributed verification is not an
 * audit trail, and this is the step that makes a mapping count toward a
 * credential. Rejection records a reason for the same reason.
 */
export async function setMappingState(
  mappingId: string,
  decision: Exclude<CertMappingState, 'pending'>,
  verifiedBy: string,
  reason?: string,
): Promise<CertEvidenceMapping | null> {
  if (!verifiedBy) {
    const err: any = new Error('verification requires a named reviewer');
    err.status = 400;
    err.code = 'CERT_VERIFY_NEEDS_REVIEWER';
    throw err;
  }
  const row = await CertEvidenceMapping.findByPk(mappingId);
  if (!row) return null;

  row.mapping_state = decision;
  row.verified_by = verifiedBy;
  row.verified_at = new Date();
  row.rejected_reason = decision === 'rejected' ? (reason ?? null) : null;
  await row.save();
  return row;
}

/** Candidates awaiting an instructor decision, for the review queue. */
export async function listPendingForReview(
  enrollmentIds: string[],
  limit = 100,
): Promise<CertEvidenceMapping[]> {
  if (enrollmentIds.length === 0) return [];
  return CertEvidenceMapping.findAll({
    where: { enrollment_id: { [Op.in]: enrollmentIds }, mapping_state: 'pending' },
    order: [['created_at', 'ASC']],
    limit,
  });
}
