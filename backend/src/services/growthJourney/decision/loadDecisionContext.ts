import { Brand, ExplorerJourneyProfile, GrowthJourneyProfile, JourneyProgram, Lead } from '../../../models';
import { classifyError } from '../../../utils/errorClassifier';
import { redactForLogs } from '../../../utils/piiRedaction';
import { latestClassification } from '../classificationService';
import { subjectRefOf } from '../classification/inputs';
import { resolveContactEvidence } from '../governor/contactEvidence';
import type { ContactEvidence, JourneyClassificationRef, JourneyProgramKind, JourneyStrategy, JourneySubjectContext, LearnerFacts, ScoreVector } from '../governor/types';
import { classifyBusinessState } from '../lifecycle/businessLifecycle';
import { classifyFlotationState } from '../lifecycle/aiFlotationLifecycle';
import { scoreSubject } from '../scoring/scoreVector';
import { flotationStrategy } from '../strategies/aiFlotationCandidates';
import { businessStrategy } from '../strategies/businessCandidates';
import { loadLearnerFacts } from '../strategies/learnerFacts';
import { learnerStrategy } from '../strategies/learnerStrategy';
import { resolveSubject, type SubjectAnchor, type SubjectView, type UnresolvedReason } from '../subjectResolver';
import { loadLifecycleSourceCounts, type LeadSignalColumns } from './lifecycleInputs';

/**
 * Load everything one shadow decision needs, for one subject in one brand
 * (§7.3; Phase 3 T311). READ-ONLY BY CONTRACT.
 *
 * ─── WHY THE LOADER IS SEPARATE FROM THE WRITER ─────────────────────────────
 *
 * The dry-run script must print a decision for a real subject and write
 * nothing — not a profile projection, not a decision row. So the loader reads,
 * classifies the lifecycle in memory, scores, and builds the context, and the
 * ONE mutable write this run owns (T307's profile projection) happens in the
 * writer, after the loader, only on the persisting path. A source-scan test
 * pins that this file contains no `create`, `update`, `upsert` or `destroy`.
 *
 * ─── EVERY LOOKUP IS GUARDED, AND ITS ABSENCE IS RECORDED ───────────────────
 *
 * Phase 2's input loader established the shape: a lookup that fails is named
 * in `unavailable` and logged with its error class, never swallowed, and the
 * context carries the honest absence. Contact evidence has its own fail-closed
 * posture (every channel closed); the others fall back to "nothing known".
 *
 * ─── STATE COMES FROM THE LIFECYCLE THAT OWNS THE PROGRAMME ─────────────────
 *
 * A business subject is classified by T307's machine, a Flotation subject by
 * T308's, over the previous projection plus the counted sources — the first
 * production caller of either. A learner subject with an Explorer profile
 * carries Explorer's own `primary_state` and overlays through T309's facts
 * loader; a learner subject WITHOUT one (a CPN scholarship lead) is recorded
 * as `NO_LEARNER_PROFILE` — a declared absence, not a state any machine
 * assigned — and T309's strategy answers it as such.
 *
 * ─── FRESHNESS, PER SUBJECT KIND (the pair T309 carried here) ───────────────
 *
 * The gate needs `created_at` and `scores_computed_at`. For a learner with an
 * Explorer profile both come from that row — read directly, two columns, the
 * one place this loader reaches an Explorer table, because T206's facade does
 * not expose `created_at` and adding it is that facade's surface. For every
 * other subject the scores were computed by THIS run, so `scores_computed_at`
 * is `asOf`, and `created_at` is when the subject was first seen: the
 * projection's own `created_at` if one exists, else the lead's. A subject with
 * neither is `missing_timestamps`, which the pipeline refuses by name.
 */

export interface LoadDecisionContextArgs {
  anchor: SubjectAnchor;
  brandId: string;
  asOf: Date;
}

export interface LifecycleProjection {
  state: string;
  stateEnteredAt: Date;
  overlays: string[];
  evidence: string[];
  /** False for a learner subject: no growth-journey lifecycle ran, so nothing is projected. */
  projected: boolean;
}

export interface LoadedDecisionContext {
  status: 'loaded';
  ctx: JourneySubjectContext;
  strategy: JourneyStrategy;
  subject: SubjectView;
  program: { id: string; slug: string; kind: JourneyProgramKind; status: string };
  brand: { id: string; slug: string; tenant_id: string };
  lifecycle: LifecycleProjection;
  previousProfile: { state: string | null; state_entered_at: Date | null; created_at: Date | null };
  unavailable: string[];
}

export type DecisionContextResult =
  | LoadedDecisionContext
  | { status: 'unresolved'; reason: UnresolvedReason }
  | { status: 'no_brand'; brandId: string }
  | { status: 'no_program'; brandId: string };

export const NO_LEARNER_PROFILE_STATE = 'NO_LEARNER_PROFILE';

const STRATEGY_BY_KIND: Record<JourneyProgramKind, JourneyStrategy> = {
  learner: learnerStrategy,
  business: businessStrategy,
  consulting: flotationStrategy,
};

const UNAVAILABLE = Symbol('unavailable');

async function guarded<T>(name: string, unavailable: string[], fn: () => Promise<T>): Promise<T | typeof UNAVAILABLE> {
  try {
    return await fn();
  } catch (err: unknown) {
    unavailable.push(name);
    console.error(
      redactForLogs(
        JSON.stringify({ service: 'growth-journey', level: 'error', outcome: 'failure', event: 'growth_journey.decision.input_unavailable', input: name, error_class: classifyError(err) }),
      ),
    );
    return UNAVAILABLE;
  }
}

const orNull = <T>(v: T | typeof UNAVAILABLE): T | null => (v === UNAVAILABLE ? null : v);

function classificationRef(row: Awaited<ReturnType<typeof latestClassification>>): JourneyClassificationRef | null {
  if (!row) return null;
  return {
    classification_id: String(row.id),
    brand_relationship: row.brand_relationship ?? null,
    primary_path: row.primary_path ?? null,
    secondary_paths: row.secondary_paths ?? [],
    intent: row.intent ?? null,
    requires_human_review: row.requires_human_review === true,
    source_step: row.source_step ?? null,
  };
}

/** T306's vector for the programme, over the lead columns as signals. `asked` is left undefined: nothing records the asking. */
function scoresFor(lead: LeadSignalColumns | null, kind: JourneyProgramKind, asOf: Date): ScoreVector {
  return scoreSubject(
    {
      lead: lead
        ? {
            industry: lead.industry,
            annual_revenue: lead.annual_revenue,
            employee_count: lead.employee_count,
            company_size: lead.company_size,
            technology_stack: lead.technology_stack,
            evaluating_90_days: lead.evaluating_90_days,
            maturity_score: lead.maturity_score,
            estimated_roi: lead.estimated_roi,
            departments_impacted: lead.departments_impacted,
            selected_systems: lead.selected_systems,
          }
        : null,
      observed: null,
      labels: { lead_temperature: lead?.lead_temperature ?? null },
      computed_at: asOf,
    },
    kind,
  );
}

/** Run the programme's lifecycle in memory. Learner programmes have no growth-journey lifecycle. */
function projectLifecycle(
  kind: JourneyProgramKind,
  previous: { state: string | null; state_entered_at: Date | null },
  lead: LeadSignalColumns | null,
  classification: JourneyClassificationRef | null,
  counts: Awaited<ReturnType<typeof loadLifecycleSourceCounts>>,
  isCustomer: boolean,
  learner: LearnerFacts | null,
  asOf: Date,
): LifecycleProjection {
  const cls = classification
    ? { primary_path: classification.primary_path, secondary_paths: classification.secondary_paths, intent: classification.intent, requires_human_review: classification.requires_human_review }
    : null;
  const leadSignals = lead
    ? { pipeline_stage: lead.pipeline_stage, idea_input: lead.idea_input, selected_systems: lead.selected_systems, maturity_score: lead.maturity_score, estimated_roi: lead.estimated_roi }
    : null;
  if (kind === 'business') {
    const r = classifyBusinessState({ previous, lead: leadSignals, classification: cls, inbound: counts.inbound, appointments: counts.appointments, isCustomer, asOf });
    return { state: r.state, stateEnteredAt: r.state_entered_at, overlays: [...r.overlays], evidence: r.evidence, projected: true };
  }
  if (kind === 'consulting') {
    const r = classifyFlotationState({ previous, lead: leadSignals, classification: cls, inbound: counts.inbound, appointments: counts.appointments, hasDeliveryEngagement: counts.hasDeliveryEngagement, isCustomer, asOf });
    return { state: r.state, stateEnteredAt: r.state_entered_at, overlays: [...r.overlays], evidence: r.evidence, projected: true };
  }
  // A learner: Explorer's state is Explorer's, read not re-derived; absent, a declared absence.
  if (learner) {
    return { state: learner.primary_state, stateEnteredAt: learner.state_entered_at ?? asOf, overlays: [...learner.overlays], evidence: ['Explorer primary_state, read through the facade'], projected: false };
  }
  return { state: NO_LEARNER_PROFILE_STATE, stateEnteredAt: asOf, overlays: [], evidence: ['no explorer_journey_profiles row for this subject'], projected: false };
}

export async function loadDecisionContext(args: LoadDecisionContextArgs): Promise<DecisionContextResult> {
  const { anchor, brandId, asOf } = args;
  const unavailable: string[] = [];

  const resolution = await resolveSubject(anchor);
  if (resolution.status === 'unresolved') return { status: 'unresolved', reason: resolution.reason };
  const subject = resolution.subject;
  const subjectRef = subjectRefOf(subject);

  const brandRow = await Brand.findByPk(brandId);
  if (!brandRow) return { status: 'no_brand', brandId };
  const programRow = await JourneyProgram.findOne({ where: { brand_id: brandId } });
  if (!programRow) return { status: 'no_program', brandId };
  const brand = { id: String(brandRow.id), slug: String(brandRow.slug), tenant_id: String(brandRow.tenant_id) };
  const program = { id: String(programRow.id), slug: String(programRow.slug), kind: programRow.kind as JourneyProgramKind, status: String(programRow.status ?? 'draft') };

  const [leadRaw, classificationRaw, profileRaw, countsRaw, learnerRaw] = await Promise.all([
    guarded('lead', unavailable, async () => (subject.lead_id === null ? null : Lead.findByPk(subject.lead_id))),
    guarded('classification', unavailable, () => latestClassification(subjectRef, brandId)),
    guarded('profile', unavailable, () => GrowthJourneyProfile.findOne({ where: { subject_ref: subjectRef, brand_id: brandId } })),
    guarded('lifecycle_sources', unavailable, () => loadLifecycleSourceCounts(subject.lead_id)),
    program.kind === 'learner' ? guarded('learner_facts', unavailable, () => loadLearnerFacts(anchor, asOf)) : Promise.resolve(null),
  ]);

  const lead = orNull(leadRaw) as LeadSignalColumns | null;
  const classification = classificationRef(orNull(classificationRaw));
  const profile = orNull(profileRaw);
  const counts = orNull(countsRaw) ?? { inbound: { replied: 0, booked_meeting: 0, answered: 0, declined: 0 }, appointments: { scheduled: 0, completed: 0, no_show: 0, cancelled: 0 }, hasDeliveryEngagement: false };
  const learnerResult = learnerRaw === null || learnerRaw === UNAVAILABLE ? null : learnerRaw;
  const learner: LearnerFacts | null = learnerResult && learnerResult.status === 'learner' ? learnerResult.facts : null;

  const previousProfile = {
    state: profile ? String(profile.state) : null,
    state_entered_at: profile?.state_entered_at ? new Date(profile.state_entered_at) : null,
    created_at: profile?.created_at ? new Date(profile.created_at) : null,
  };

  // Contact evidence fails closed on its own; it is never "unavailable".
  const contact: ContactEvidence = await resolveContactEvidence({
    subject: { lead_id: subject.lead_id, email: subject.email_normalized ?? lead?.email ?? null, phone: lead?.phone ?? null },
    brandId,
    tenantId: brand.tenant_id,
    asOf,
  });

  const isCustomer = subject.enrollment_id !== null;
  const lifecycle = projectLifecycle(program.kind, previousProfile, lead, classification, counts, isCustomer, learner, asOf);
  const scores = scoresFor(lead, program.kind, asOf);
  const freshness = await freshnessFor(program.kind, learner, previousProfile.created_at, lead?.created_at ?? null, asOf, unavailable);

  const ctx: JourneySubjectContext = {
    tenant_id: brand.tenant_id,
    brand_id: brand.id,
    brand_slug: brand.slug,
    program_id: program.id,
    program_slug: program.slug,
    program_status: program.status,
    program_kind: program.kind,
    subject_ref: subjectRef,
    lead_id: subject.lead_id,
    enrollment_id: subject.enrollment_id,
    classification,
    state: lifecycle.state,
    state_entered_at: lifecycle.stateEnteredAt,
    overlays: lifecycle.overlays,
    scores,
    contact,
    // The builder's tier-0 flags. `killSwitch` is the capability gate, checked
    // before this loader runs; `campaignInactive` is deliberately NOT mapped from
    // `program_status` in shadow mode - every programme is `draft`, and stopping
    // every shadow decision on that would make the record unreadable. The status
    // is on the context and on the row's eligibility for a reviewer to see.
    hardStop: {
      converted: false,
      unsubscribed: false,
      dnc: false,
      consentRevoked: false,
      killSwitch: false,
      campaignInactive: false,
    },
    freshness,
    asOf,
    learner,
  };

  return { status: 'loaded', ctx, strategy: STRATEGY_BY_KIND[program.kind], subject, program, brand, lifecycle, previousProfile, unavailable };
}

/** The freshness pair, per subject kind. See the header. */
async function freshnessFor(
  kind: JourneyProgramKind,
  learner: LearnerFacts | null,
  profileCreatedAt: Date | null,
  leadCreatedAt: Date | null,
  asOf: Date,
  unavailable: string[],
): Promise<JourneySubjectContext['freshness']> {
  if (kind === 'learner' && learner) {
    const row = await guarded('explorer_profile_timestamps', unavailable, () =>
      ExplorerJourneyProfile.findByPk(learner.enrollment_id, { attributes: ['created_at', 'scores_computed_at'] }),
    );
    const r = orNull(row);
    return { created_at: r?.created_at ?? null, scores_computed_at: r?.scores_computed_at ?? null } as JourneySubjectContext['freshness'];
  }
  const firstSeen = profileCreatedAt ?? leadCreatedAt;
  return { created_at: firstSeen ?? null, scores_computed_at: firstSeen ? asOf : null } as JourneySubjectContext['freshness'];
}
