/**
 * caseStudyServiceLinkStore — reads and writes the case-study/service links.
 *
 * TWO INVARIANTS CARRY THIS MODULE, and both are the kind that look fine in a happy-path test and ruin the
 * feature in week three:
 *
 * 1. A SUGGESTION PASS NEVER OVERWRITES A HUMAN DECISION. The pass is advisory and re-runnable, so the second run
 *    must insert only pairs that have no row yet and leave every existing row exactly as it stands — including
 *    `rejected`. If a re-run reset decided rows to `suggested`, a reviewer's "no, that record does not prove that
 *    service" would silently come back as an open proposal, and the queue would never converge. The unique index
 *    on (case_study_id, service_offering_id) plus an ON CONFLICT DO NOTHING insert is what makes the pass safe to
 *    run twice, per CLAUDE.md's idempotency contract.
 *
 * 2. ONE TENANT NEVER SEES ANOTHER'S SERVICE NAMES. `service_offerings` is tenant-scoped; `case_studies` is not
 *    (it carries no tenant_id or organization_id at all). So a single case study can be linked by two tenants, and
 *    a naive "list this record's links" would leak the other tenant's catalog through the shared record. Every
 *    read here resolves the services for the caller's tenant FIRST and keeps only links pointing into that set.
 *
 * The models are lazy-loaded inside each function, so importing this module never initializes the ORM.
 */
import { CASE_STUDY_SERVICE_LINK_STATES, CaseStudyServiceLinkState } from '../../models/CaseStudyServiceLink';
import { suggestServicesForCaseStudy, ServiceLinkSuggestion } from './caseStudyServiceLinkSuggestor';

export class CaseStudyServiceLinkNotFoundError extends Error {
  constructor(public id: string) {
    super('case study service link not found');
    this.name = 'CaseStudyServiceLinkNotFoundError';
  }
}

export class CaseStudyNotFoundError extends Error {
  constructor(public id: string) {
    super('case study not found');
    this.name = 'CaseStudyNotFoundError';
  }
}

/** A decision is a human act, so only these two states can be written by a decision. */
export const DECIDABLE_STATES: ReadonlyArray<CaseStudyServiceLinkState> = ['confirmed', 'rejected'];

export interface ServiceLinkDto {
  id: string;
  caseStudyId: string;
  /**
   * The record's own identity, carried on the link.
   *
   * Without these, a service's evidence list renders as a column of UUIDs: the link knows which service it points
   * at but nothing about the case study, and that list is exactly the screen where someone asks "what proves this
   * service?". `caseStudyStatus` comes too, because an archived record is not evidence a bid should lean on.
   */
  caseStudyTitle: string;
  caseStudySlug: string | null;
  caseStudyStatus: string | null;
  serviceOfferingId: string;
  serviceName: string;
  serviceCategory: string | null;
  state: CaseStudyServiceLinkState;
  rationale: string | null;
  matchScore: number | null;
  suggestedBy: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDto(link: any, service: any, record?: any): ServiceLinkDto {
  const l = link && link.get ? link.get() : link;
  const s = (service && service.get ? service.get() : service) || {};
  const c = (record && record.get ? record.get() : record) || {};
  return {
    id: l.id,
    caseStudyId: l.case_study_id,
    // A record that cannot be resolved is labelled as such rather than rendered as a blank row: a reviewer needs
    // to see that the link exists and points at something missing, not an empty cell they read as "no evidence".
    caseStudyTitle: c.title ?? '(case study unavailable)',
    caseStudySlug: c.slug ?? null,
    caseStudyStatus: c.status ?? null,
    serviceOfferingId: l.service_offering_id,
    serviceName: s.name ?? '(unknown service)',
    serviceCategory: s.category ?? null,
    state: l.state,
    rationale: l.rationale ?? null,
    matchScore: l.match_score ?? null,
    suggestedBy: l.suggested_by ?? null,
    decidedBy: l.decided_by ?? null,
    decidedAt: l.decided_at ?? null,
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  };
}

/**
 * The caller's tenant catalog, keyed by id. The tenancy guard every read in this module passes through.
 *
 * `activeOnly` separates two different questions. A NEW suggestion should only ever point at a service the company
 * still offers, so the pass asks for active services. A READ must include retired ones, because a link confirmed
 * last quarter against a service since retired is still a true record of what was decided, and dropping it from
 * the list would make a reviewer's own confirmed work vanish without explanation.
 */
async function tenantServicesById(tenantId: string, activeOnly = false): Promise<Record<string, any>> {
  const { default: ServiceOffering } = await import('../../models/ServiceOffering');
  const where: any = { tenant_id: tenantId };
  if (activeOnly) where.status = 'active';
  const rows: any[] = await ServiceOffering.findAll({ where });
  const byId: Record<string, any> = {};
  for (const row of rows) byId[(row as any).id] = row;
  return byId;
}

export interface SuggestLinksInput {
  caseStudyId: string;
  tenantId: string;
  /** Who or what ran the pass, e.g. 'suggestion-pass'. Never a claim that this identity agreed with the result. */
  suggestedBy: string;
  max?: number;
}

export interface SuggestLinksResult {
  caseStudyId: string;
  /** Rows actually inserted by this run. Zero on a second run, which is the point. */
  inserted: number;
  /** Pairs the pass proposed that already had a row, left untouched whatever their state. */
  alreadyPresent: number;
  /** Everything the pass proposed, whether or not it was inserted, so the caller can show its reasoning. */
  proposed: ServiceLinkSuggestion[];
}

/**
 * Run the advisory pass for one case study and persist anything new as `suggested`.
 *
 * Safe to run repeatedly: existing rows are never updated, so a human's `confirmed` or `rejected` survives every
 * later run. Returns what it proposed and what it actually inserted, which are different numbers after the first
 * run and that difference is the idempotency evidence.
 */
export async function suggestLinksForCaseStudy(input: SuggestLinksInput): Promise<SuggestLinksResult> {
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');

  const record: any = await CaseStudy.findByPk(input.caseStudyId);
  if (!record) throw new CaseStudyNotFoundError(input.caseStudyId);
  const r = record.get ? record.get() : record;

  const services = Object.values(await tenantServicesById(input.tenantId, true)).map((row: any) => {
    const s = row.get ? row.get() : row;
    return {
      id: s.id,
      name: s.name,
      category: s.category ?? null,
      keywords: s.keywords_json ?? [],
      naicsCodes: s.naics_codes_json ?? [],
    };
  });

  const proposed = suggestServicesForCaseStudy(
    {
      title: r.title ?? null,
      canonicalSummary: r.canonical_summary ?? null,
      industry: r.industry ?? null,
      primaryCapability: r.primary_capability ?? null,
      programKey: r.program_key ?? null,
    },
    services,
    { max: input.max },
  );
  if (!proposed.length) {
    return { caseStudyId: input.caseStudyId, inserted: 0, alreadyPresent: 0, proposed: [] };
  }

  // Existing rows for this record, read before writing anything. Needed to report how many proposals were already
  // known, and to leave decided rows alone: nothing below updates an existing row.
  const existing: any[] = await CaseStudyServiceLink.findAll({ where: { case_study_id: input.caseStudyId } });
  const existingPairs = new Set(
    existing.map((row: any) => (row.get ? row.get() : row).service_offering_id as string),
  );
  const countBefore = existing.length;
  const toInsert = proposed.filter((p) => !existingPairs.has(p.serviceOfferingId));

  if (toInsert.length) {
    // ON CONFLICT DO NOTHING against the unique pair index, even though the pairs were just filtered against a
    // read: the read-then-write would otherwise lose a race with a concurrent pass and raise a unique violation
    // rather than quietly doing nothing. The filter is for reporting; this flag is for correctness.
    await CaseStudyServiceLink.bulkCreate(
      toInsert.map((p) => ({
        case_study_id: input.caseStudyId,
        service_offering_id: p.serviceOfferingId,
        state: 'suggested' as CaseStudyServiceLinkState,
        rationale: p.rationale,
        match_score: p.matchScore,
        suggested_by: input.suggestedBy,
      })) as any,
      { ignoreDuplicates: true },
    );
  }

  // COUNTED FROM THE DATABASE, not from the length of what was submitted.
  //
  // The obvious `inserted = created.filter(row => row.id).length` cannot work here and would have been a number
  // that could never be anything but `proposed.length`: the model declares `defaultValue: DataTypes.UUIDV4`, so
  // Sequelize mints each id client-side BEFORE the insert, and a row that ON CONFLICT discarded still comes back
  // carrying an id. Re-reading the count is the only way this number reflects what actually landed.
  const countAfter = await CaseStudyServiceLink.count({ where: { case_study_id: input.caseStudyId } });
  const inserted = Math.max(0, countAfter - countBefore);
  return {
    caseStudyId: input.caseStudyId,
    inserted,
    alreadyPresent: proposed.length - inserted,
    proposed,
  };
}

export interface ListLinksForCaseStudyInput {
  caseStudyId: string;
  tenantId: string;
  state?: CaseStudyServiceLinkState;
}

/** Every link on one record that points at a service in the caller's tenant. Strongest proposals first. */
export async function listLinksForCaseStudy(input: ListLinksForCaseStudyInput): Promise<ServiceLinkDto[]> {
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  const byId = await tenantServicesById(input.tenantId);
  const where: any = { case_study_id: input.caseStudyId };
  if (input.state) where.state = input.state;
  const links: any[] = await CaseStudyServiceLink.findAll({ where });
  // One lookup for the one record every link here shares, rather than one per link.
  const record: any = links.length ? await CaseStudy.findByPk(input.caseStudyId) : null;
  return links
    .filter((link: any) => !!byId[(link.get ? link.get() : link).service_offering_id])
    .map((link: any) => toDto(link, byId[(link.get ? link.get() : link).service_offering_id], record))
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0) || a.serviceName.localeCompare(b.serviceName));
}

export interface ListLinksForServiceInput {
  serviceOfferingId: string;
  tenantId: string;
  state?: CaseStudyServiceLinkState;
}

/**
 * Every link on one service. The service itself is tenant-checked, so asking about another tenant's service
 * returns nothing rather than that tenant's evidence list.
 */
export async function listLinksForService(input: ListLinksForServiceInput): Promise<ServiceLinkDto[]> {
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  const byId = await tenantServicesById(input.tenantId);
  const service = byId[input.serviceOfferingId];
  if (!service) return [];
  const where: any = { service_offering_id: input.serviceOfferingId };
  if (input.state) where.state = input.state;
  const links: any[] = await CaseStudyServiceLink.findAll({ where });
  if (!links.length) return [];

  // The records these links point at, fetched in ONE query rather than per link. This is the list where the
  // record's title is the only useful label, so a missing title would make the whole screen unreadable.
  const ids = Array.from(new Set(links.map((l: any) => (l.get ? l.get() : l).case_study_id as string)));
  const records: any[] = await CaseStudy.findAll({ where: { id: ids } });
  const recordById: Record<string, any> = {};
  for (const r of records) recordById[(r.get ? r.get() : r).id] = r;

  return links
    .map((link: any) => {
      const l = link.get ? link.get() : link;
      return toDto(link, service, recordById[l.case_study_id]);
    })
    // A service's evidence list is read title-first, so it orders by the record, then by how strong the match was.
    .sort((a, b) => a.caseStudyTitle.localeCompare(b.caseStudyTitle) || (b.matchScore ?? 0) - (a.matchScore ?? 0));
}

export interface DecideLinkInput {
  id: string;
  tenantId: string;
  state: CaseStudyServiceLinkState;
  decidedBy: string;
}

/**
 * Record a human decision on one link.
 *
 * Only `confirmed` and `rejected` can be written here: there is no path back to `suggested`, because "nobody has
 * looked at this yet" stops being true the moment someone does, and a reviewer undoing a decision should re-decide
 * it rather than erase that it was ever made. `decided_by` and `decided_at` are stamped together, so a confirmed
 * link always carries who stood behind it — which is what makes it quotable as past performance.
 */
export async function decideLink(input: DecideLinkInput): Promise<ServiceLinkDto> {
  const { default: CaseStudyServiceLink } = await import('../../models/CaseStudyServiceLink');
  const { default: CaseStudy } = await import('../../models/CaseStudy');
  if (!DECIDABLE_STATES.includes(input.state)) {
    throw new Error(`a link can only be decided ${DECIDABLE_STATES.join(' or ')}, not '${input.state}'`);
  }
  const byId = await tenantServicesById(input.tenantId);
  const link: any = await CaseStudyServiceLink.findByPk(input.id);
  const row = link && (link.get ? link.get() : link);
  // The tenancy check runs before the row is touched: a link whose service is outside this tenant is reported as
  // not found, never updated.
  if (!link || !byId[row.service_offering_id]) throw new CaseStudyServiceLinkNotFoundError(input.id);

  await link.update({
    state: input.state,
    decided_by: input.decidedBy,
    decided_at: new Date(),
    updated_at: new Date(),
  });
  const record: any = await CaseStudy.findByPk(row.case_study_id);
  return toDto(link, byId[row.service_offering_id], record);
}

export { CASE_STUDY_SERVICE_LINK_STATES };
