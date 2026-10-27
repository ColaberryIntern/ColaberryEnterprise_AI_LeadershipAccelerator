/**
 * govPipeline — the cross-opportunity "vet → build → assign" funnel projection.
 *
 * The gov admin has two surfaces today: a flat discovery table (/opportunities) and a per-opportunity linear
 * workspace (/qualification). Neither shows every in-flight pursuit grouped by WHERE IT IS in the process. This
 * module is the read-only projection that drives a single funnel board, derived entirely from state that already
 * exists — there is NO new "stage" column and no migration. A pursuit's stage is a pure function of its decision,
 * whether it has a delivery project, and whether that project's build has been materialized:
 *
 *   Round 1  · VET            — the discovery feed (/opportunities). NOT here (candidates aren't qualifications yet).
 *   Round 2  · QUALIFYING     — decision pending_review | needs_evidence: the ZIP is being worked, requirements
 *                               established. Advances to Round 3 (approve) or is hidden (no_bid).      → 'qualifying'
 *   Round 3  · READY TO ASSIGN — decision approved_bid_pursuit | rfi_response, no build yet: review, then one button
 *                               to complete the bid + assign an intern (materialize).              → 'ready_to_assign'
 *            · IN BUILD        — approved AND the monitored student build project exists: tracked via the cockpit.
 *                                                                                                        → 'in_build'
 *            · PASSED ON       — decision no_bid: eliminated at Round 2. Shown in a collapsed drawer.       → 'passed'
 *
 * "Eliminated at Round 1" is NOT a qualification at all — it lives in gov_opportunity_dismissals (keyed on the
 * discovery uuid) and is already filtered out of the discovery feed, so it never reaches this projection.
 *
 * Read-only by construction: it reads the thread HEAD of each pursuit (status='active' AND superseded_by_id IS
 * NULL — fork-on-edit sets both on the superseded row) and, only for approved pursuits, a side-effect-free build
 * rollup. It never writes, never forks a version, and a build-read failure degrades to "no build" rather than
 * breaking the list.
 */
import { evaluateRequirements } from './govQualification';

export type GovPipelineStage = 'qualifying' | 'ready_to_assign' | 'in_build' | 'passed';

/** The materialized build's progress, present only once a pursuit has become a monitored student project. */
export interface GovPipelineBuildProgress {
  studentProjectId: string;
  /** Percent of build stories verified from commits (the honest "done"), 0–100. */
  pct: number;
  verified: number;
  total: number;
}

/** One pursuit card on the funnel board. Display fields are best-effort (null when the source never carried them). */
export interface GovPipelineCard {
  /** canonical_opportunity_id — either an op:gov:<hex> canonical id OR a gws:<uuid> decoupled workspace key. */
  key: string;
  isDecoupled: boolean;
  biddingEntity: string;
  title: string | null;
  agency: string | null;
  decision: string;
  version: number;
  stage: GovPipelineStage;
  deliveryProjectId: string | null;
  /** Count of reviewer-established, cited requirements (what pursuit approval evaluates). */
  establishedCount: number;
  /** True when the pursuit looks ready to advance Round 2 → Round 3 (requirements established + no disqualifier).
   *  The /approve route still re-gates fully server-side; this is a board hint, not the gate. */
  readyToAdvance: boolean;
  /** True once the solicitation ZIP has been attested (the Round-2 evidence of record). */
  zipAttested: boolean;
  pursuitKind: 'software' | 'services';
  /** Non-null once the build is materialized (drives the 'in_build' stage + the progress bar). */
  build: GovPipelineBuildProgress | null;
  updatedAt: string | null;
  createdAt: string | null;
}

/** PURE. A pursuit's funnel stage from its decision + whether its build has been materialized. no_bid is always
 *  'passed' regardless of any stale project; approval decisions split on materialization; everything else is the
 *  Round-2 'qualifying' lane. */
export function deriveGovPipelineStage(decision: string, materialized: boolean): GovPipelineStage {
  if (decision === 'no_bid') return 'passed';
  if (decision === 'approved_bid_pursuit' || decision === 'rfi_response') {
    return materialized ? 'in_build' : 'ready_to_assign';
  }
  return 'qualifying';
}

/** Coerce a DB timestamp (Date | string | null) to an ISO string, or null if absent/unparseable. */
function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** PURE. Project a qualification thread-head row (plain object, e.g. `row.get()`) + its build progress into a
 *  funnel card. Field extraction mirrors getDecoupledWorkspace: title/agency prefer the decoupled provenance, then
 *  fall back to the canonical source snapshot. */
export function projectGovPipelineCard(rec: any, build: GovPipelineBuildProgress | null): GovPipelineCard {
  const rj = (rec && rec.requirements_json) || {};
  const established: any[] = Array.isArray(rj.established) ? rj.established : [];
  const provenance = rj.provenance || null;
  const snapshot = (rec && rec.source_snapshot) || null;
  const reviewedDocuments: any[] = Array.isArray(rj.reviewedDocuments) ? rj.reviewedDocuments : [];
  const zipAttested = reviewedDocuments.some((d) => d && d.method === 'solicitation_zip');
  const pursuitKind: 'software' | 'services' = rj.pursuitKind === 'services' ? 'services' : 'software';
  const key = String((rec && rec.canonical_opportunity_id) ?? '');
  const decision = String((rec && rec.decision) ?? 'pending_review');
  const evaluation = evaluateRequirements(established);
  const establishedCount = established.length;

  const title = (provenance && provenance.title)
    || (snapshot && (snapshot.title || (snapshot.opportunity && snapshot.opportunity.title)))
    || null;
  const agency = (provenance && provenance.agency)
    || (snapshot && (snapshot.agency || snapshot.buyer || (snapshot.opportunity && snapshot.opportunity.agency)))
    || null;

  return {
    key,
    isDecoupled: key.startsWith('gws:'),
    biddingEntity: String((rec && rec.bidding_entity) ?? ''),
    title: title || null,
    agency: agency || null,
    decision,
    version: Number((rec && rec.version) ?? 1),
    stage: deriveGovPipelineStage(decision, !!build),
    deliveryProjectId: rec && rec.delivery_project_id ? String(rec.delivery_project_id) : null,
    establishedCount,
    readyToAdvance: establishedCount > 0 && evaluation.canApprovePursuit,
    zipAttested,
    pursuitKind,
    build,
    updatedAt: toIso(rec && rec.updated_at),
    createdAt: toIso(rec && rec.created_at),
  };
}

/** Side-effect-free build rollup for a delivery project, or null when no build is materialized. Mirrors the first
 *  reads of getGovBuildSummary WITHOUT its best-effort plan-publish write, so the funnel list never mutates state.
 *  A story task is one whose story_id matches /^STORY-/; "verified" is verified_at being set (confirmed from a
 *  commit). */
export async function getGovBuildProgressLite(deliveryProjectId: string | null): Promise<GovPipelineBuildProgress | null> {
  if (!deliveryProjectId) return null;
  const { default: ContractTrack } = await import('../../models/ContractTrack');
  const { default: StudentTask } = await import('../../models/StudentTask');
  const track: any = await ContractTrack.findOne({ where: { delivery_project_id: deliveryProjectId, track_type: 'solution_build' } });
  const studentProjectId = track && track.solution_student_project_id ? String(track.solution_student_project_id) : null;
  if (!studentProjectId) return null;
  const tasks: any[] = await StudentTask.findAll({ where: { project_id: studentProjectId } });
  const storyTasks = tasks.filter((t) => typeof t.story_id === 'string' && /^STORY-/.test(t.story_id));
  const total = storyTasks.length;
  const verified = storyTasks.filter((t) => !!t.verified_at).length;
  const pct = total ? Math.round((verified / total) * 100) : 0;
  return { studentProjectId, pct, verified, total };
}

/** List every in-flight pursuit (thread head) for a tenant, projected into funnel cards, newest-updated first.
 *  Only approved pursuits incur the extra build-progress read (the rest can't be in_build). Read-only; a per-row
 *  build-read failure degrades that card to "no build" rather than failing the whole list. */
export async function listGovPipeline(tenantId: string): Promise<GovPipelineCard[]> {
  const { default: GovQualification } = await import('../../models/GovQualification');
  const rows: any[] = await GovQualification.findAll({
    where: { tenant_id: tenantId, status: 'active', superseded_by_id: null },
    order: [['updated_at', 'DESC']],
  });
  const cards: GovPipelineCard[] = [];
  for (const row of rows) {
    const rec = row && row.get ? row.get() : row;
    const decision = String((rec && rec.decision) ?? 'pending_review');
    const deliveryProjectId = rec && rec.delivery_project_id ? String(rec.delivery_project_id) : null;
    const approved = decision === 'approved_bid_pursuit' || decision === 'rfi_response';
    let build: GovPipelineBuildProgress | null = null;
    if (approved && deliveryProjectId) {
      try { build = await getGovBuildProgressLite(deliveryProjectId); } catch { build = null; }
    }
    cards.push(projectGovPipelineCard(rec, build));
  }
  return cards;
}
