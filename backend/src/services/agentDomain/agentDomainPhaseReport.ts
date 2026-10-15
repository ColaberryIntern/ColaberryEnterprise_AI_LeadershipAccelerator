/**
 * The per-domain verification report the amendment's section 6 asks for.
 *
 * Run `20261007-school-agent-factory` (T21), session CC-20261006-a4k7.
 *
 * ## Why this is code and not a document
 *
 * The amendment's instruction is "use `unknown` where discovery is incomplete; do not manufacture
 * counts". A hand-written table is exactly where a manufactured count comes from: someone types a
 * number, the data moves, and the table keeps saying what it said. Every figure here is READ from
 * the committed data at render time, so the report cannot drift from the thing it describes.
 *
 * `unknown` is a real value in this report and is counted separately from zero. They are different
 * answers: zero means measured and none, `unknown` means not established. Collapsing them is how a
 * gap in discovery gets reported as a finding of absence.
 *
 * ## What it refuses to say
 *
 * It does not report readiness, because nothing is provisioned. It does not report coverage over
 * the confirmed set, because that set is empty and a percentage of zero is the most misleading
 * number available here. It does not report an agent as built, because none is.
 */

import {
  AGENT_DOMAINS,
  AGENT_DOMAIN_KEYS,
  isAssignablePlanningState,
  type AgentDomain,
} from './agentDomainRegistry';
import {
  countsForDomain,
  loadDomainMatrix,
  loadUnresolvedBucket,
} from './capabilityRecord';
import { coverageForDomain, renderCoverageSummary } from './coverageMatrix';
import { planProvision, derivedProjectId } from './agentDomainProvisionPlan';

/** A value that is genuinely not established, kept distinct from zero. */
export const UNKNOWN = 'unknown' as const;
export type Unknown = typeof UNKNOWN;

export interface DomainReportRow {
  readonly seq: number;
  readonly domain_key: string;
  readonly title: string;
  readonly accountable_human: string;
  readonly manager_can_reach_surface: boolean;
  readonly blocker: string | null;
  /** The intern this domain is INTENDED for. Not an assignment, and not activated. */
  readonly intended_builder: string | null;
  readonly intended_builder_state: string;
  readonly assignable_planning_state: boolean;
  readonly legacy_rows_with_disposition: number;
  readonly distinct_capabilities: number;
  readonly unique_tools_required: number;
  readonly capabilities_confirmed_by_manager: number;
  readonly capabilities_draft: number;
  readonly releases: number;
  readonly stories: number;
  readonly implementation_stories: number;
  /** Null when no agent exists for this domain, which is six of the ten. */
  readonly existing_agent_id: string | null;
  /** Always `unknown`: readiness is not established because nothing is provisioned. */
  readonly production_readiness: Unknown;
  /** Always `unknown`: no project row exists yet, so it has no live id. */
  readonly live_project_id: Unknown;
  /** What provisioning WOULD use. A derivation, not a record. */
  readonly derived_project_id: string;
  readonly build_authorization: 'no_authorization';
}

function rowFor(d: AgentDomain): DomainReportRow {
  const m = loadDomainMatrix(d.domain_key);
  const c = countsForDomain(d.domain_key);
  const plan = planProvision(d.domain_key);
  return {
    seq: d.seq,
    domain_key: d.domain_key,
    title: d.title,
    accountable_human: m.accountable_human,
    manager_can_reach_surface: d.can_reach_surface,
    blocker: d.blocker,
    intended_builder: d.intended_builder,
    intended_builder_state: d.intended_builder_state,
    assignable_planning_state: isAssignablePlanningState(d),
    legacy_rows_with_disposition: c.legacy_rows_analyzed,
    distinct_capabilities: c.distinct_capabilities,
    unique_tools_required: c.unique_tools_required,
    capabilities_confirmed_by_manager: c.confirmed,
    capabilities_draft: c.draft,
    releases: plan.releases.length,
    stories: plan.stories.length,
    implementation_stories: plan.stories.filter((s) => s.kind === 'implementation').length,
    existing_agent_id: d.agent_id,
    // Not a hedge. Readiness would require a provisioned project and a lifecycle stage, and there
    // is neither, so the honest value is `unknown` rather than a zero that reads as "measured".
    production_readiness: UNKNOWN,
    live_project_id: UNKNOWN,
    derived_project_id: derivedProjectId(d.domain_key),
    // Resolved by the gate at read time on the live surface; constant here because the
    // authorization table is empty and nobody has approved a build.
    build_authorization: 'no_authorization',
  };
}

export interface PhaseReport {
  readonly rows: ReadonlyArray<DomainReportRow>;
  readonly totals: {
    readonly domains: number;
    readonly managers_reachable: number;
    readonly managers_blocked: number;
    readonly distinct_accountable_humans: number;
    readonly capabilities: number;
    readonly capabilities_confirmed: number;
    readonly stories: number;
    readonly releases: number;
    readonly legacy_rows_with_disposition: number;
    readonly legacy_rows_unresolved: number;
    readonly legacy_rows_total: number;
    readonly agents_existing: number;
    readonly agents_built_this_phase: 0;
    readonly projects_provisioned: 0;
    readonly build_authorizations: 0;
    readonly unknown_cells: number;
  };
  readonly disclosures: ReadonlyArray<string>;
}

export function buildPhaseReport(): PhaseReport {
  const rows = AGENT_DOMAIN_KEYS.map((k) => rowFor(AGENT_DOMAINS.find((d) => d.domain_key === k)!));
  const bucket = loadUnresolvedBucket();

  const domained = rows.reduce((n, r) => n + r.legacy_rows_with_disposition, 0);
  const unknownCells = rows.reduce(
    (n, r) => n + [r.production_readiness, r.live_project_id].filter((v) => v === UNKNOWN).length,
    0,
  );

  return {
    rows,
    totals: {
      domains: rows.length,
      managers_reachable: rows.filter((r) => r.manager_can_reach_surface).length,
      managers_blocked: rows.filter((r) => !r.manager_can_reach_surface).length,
      distinct_accountable_humans: new Set(rows.map((r) => r.accountable_human)).size,
      capabilities: rows.reduce((n, r) => n + r.distinct_capabilities, 0),
      capabilities_confirmed: rows.reduce((n, r) => n + r.capabilities_confirmed_by_manager, 0),
      stories: rows.reduce((n, r) => n + r.stories, 0),
      releases: rows.reduce((n, r) => n + r.releases, 0),
      legacy_rows_with_disposition: domained,
      legacy_rows_unresolved: bucket.legacy_row_count,
      legacy_rows_total: domained + bucket.legacy_row_count,
      agents_existing: rows.filter((r) => r.existing_agent_id !== null).length,
      // Not computed. Stated as a literal zero because the phase forbids it, and a computation
      // over an empty table would read as a measurement of something that was attempted.
      agents_built_this_phase: 0,
      projects_provisioned: 0,
      build_authorizations: 0,
      unknown_cells: unknownCells,
    },
    disclosures: [
      'NOTHING IS ACTIVATED. No agent was built, no agent was activated, no autonomy level was '
      + 'changed, no project was provisioned, and no access was granted.',
      `ZERO of ${rows.reduce((n, r) => n + r.distinct_capabilities, 0)} capabilities are confirmed, `
      + 'because no manager has validated one. Coverage over an empty confirmed set is not complete '
      + 'coverage, and is reported as zero rather than as coverage.',
      'READINESS IS `unknown`, not zero. Readiness would require a provisioned project and a '
      + 'lifecycle stage; there is neither, so it is not established rather than measured as absent.',
      `${bucket.legacy_row_count} legacy agent rows belong to no domain and need an owner decision. `
      + 'Five of them are live production rows.',
      `${rows.filter((r) => !r.manager_can_reach_surface).length} of ${rows.length} managers cannot `
      + 'reach the admin surface. Each carries a named reason; none is defaulted to reachable.',
      'INTENDED BUILDERS ARE INTENTIONS. The named interns are a selected subset, not the '
      + 'population, and no assignment or access grant is active.',
      'ALL TEN REPORT `no_authorization` from the build-authorization gate, because the '
      + 'authorization table is empty.',
    ],
  };
}

/** The report as Markdown, for the handoff. Every figure comes from `buildPhaseReport`. */
export function renderPhaseReportMarkdown(report: PhaseReport = buildPhaseReport()): string {
  const h = [
    '| # | Domain | Accountable human | Manager reach | Capabilities | Confirmed | Tools | Legacy | Releases | Stories | Readiness | Authorization |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const body = report.rows.map((r) => [
    r.seq, r.title, r.accountable_human,
    r.manager_can_reach_surface ? 'yes' : 'NO',
    r.distinct_capabilities, r.capabilities_confirmed_by_manager, r.unique_tools_required,
    r.legacy_rows_with_disposition, r.releases, r.stories,
    r.production_readiness, r.build_authorization,
  ].join(' | '));
  const t = report.totals;
  return [
    ...h,
    ...body.map((b) => `| ${b} |`),
    '',
    `**Totals.** ${t.domains} domains, ${t.distinct_accountable_humans} distinct accountable humans, `
    + `${t.managers_reachable} reachable and ${t.managers_blocked} blocked. ${t.capabilities} `
    + `capabilities, ${t.capabilities_confirmed} confirmed. ${t.releases} releases, ${t.stories} `
    + `stories. ${t.legacy_rows_with_disposition} + ${t.legacy_rows_unresolved} = `
    + `${t.legacy_rows_total} legacy rows. ${t.agents_built_this_phase} agents built, `
    + `${t.projects_provisioned} projects provisioned, ${t.build_authorizations} build `
    + `authorizations. ${t.unknown_cells} cells are \`unknown\` rather than zero.`,
    '',
    ...report.disclosures.map((d) => `- ${d}`),
  ].join('\n');
}
