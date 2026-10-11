/**
 * govRelationship — ADVISORY, DETERMINISTIC answer to "have we pursued this agency before?" for the gov bid
 * decision. Given the opportunity's agency, it finds OTHER active qualifications for the same agency (normalized
 * exact match) across the tenant and returns them as prior pursuits with their decision + date. It reads only;
 * it writes nothing and gates nothing — it never touches evaluateRequirements, coverage, or any approval path.
 * The match is a SUGGESTION ("possible prior work — verify"), never authoritative: agency names are free text.
 */

/** One prior pursuit of the same agency (one active qualification record, mapped for display). */
export interface PriorPursuit {
  canonicalOpportunityId: string;
  title: string | null;
  agency: string | null;
  decision: string;
  date: string | null; // ISO 8601, or null when the record carries no timestamp
}
/** The raw, already-extracted fields from one qualification record the pure matcher consumes (no DB types here). */
export interface PriorPursuitRow {
  canonicalOpportunityId: string;
  title: string | null;
  agency: string | null;
  decision: string;
  date: string | null;
}
export interface AgencyRelationship {
  agency: string | null;
  priorCount: number;
  pursuits: PriorPursuit[];
}

const MAX_PURSUITS = 10;

/** Normalize an agency name for matching: lowercase, strip to alphanumerics, collapse to single spaces, trim. */
export function normalizeAgency(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * PURE: from a set of qualification rows, the prior pursuits for the SAME agency as `agency`, excluding the
 * current opportunity (`excludeKey`). Normalized exact agency match; deduped by canonicalOpportunityId keeping
 * the newest-dated row; newest first; capped. Empty agency or no overlap -> []. Total (never throws).
 */
export function matchPriorPursuits(agency: string | null | undefined, rows: PriorPursuitRow[], excludeKey: string): PriorPursuit[] {
  const target = normalizeAgency(agency);
  if (!target) return [];
  const byKey = new Map<string, PriorPursuit>();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.canonicalOpportunityId || r.canonicalOpportunityId === excludeKey) continue;
    if (normalizeAgency(r.agency) !== target) continue;
    const prior = byKey.get(r.canonicalOpportunityId);
    const newer = !prior || (r.date ?? '') > (prior.date ?? '');
    if (newer) {
      byKey.set(r.canonicalOpportunityId, {
        canonicalOpportunityId: r.canonicalOpportunityId,
        title: r.title ?? null, agency: r.agency ?? null, decision: r.decision, date: r.date ?? null,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, MAX_PURSUITS);
}

/** Map one GovQualification row to the agency/title the matcher reads (decoupled provenance, else OP snapshot). */
export function rowFromQualification(rec: any): PriorPursuitRow {
  const r = rec && typeof rec.get === 'function' ? rec.get() : rec;
  const rj = (r && r.requirements_json) || {};
  const prov = rj.provenance || {};
  const snap = (r && r.source_snapshot) || {};
  const snapAgency = snap.agency ?? (snap.opportunity && snap.opportunity.agency) ?? null;
  const snapTitle = snap.title ?? (snap.opportunity && snap.opportunity.title) ?? null;
  const created = r && r.created_at ? new Date(r.created_at) : null;
  return {
    canonicalOpportunityId: r ? r.canonical_opportunity_id : '',
    title: prov.title ?? snapTitle ?? null,
    agency: prov.agency ?? snapAgency ?? null,
    decision: (r && r.decision) || 'pending_review',
    date: created && !isNaN(created.getTime()) ? created.toISOString() : null,
  };
}

/**
 * Load the tenant's active qualifications and return the prior pursuits for this opportunity's agency.
 * Best-effort and read-only: the caller treats any throw as "no relationship" (advisory panel, never a gate).
 */
export async function getAgencyRelationship(tenantId: string, gwsKey: string, agency: string | null): Promise<AgencyRelationship> {
  if (!normalizeAgency(agency)) return { agency: agency ?? null, priorCount: 0, pursuits: [] };
  const { default: GovQualification } = await import('../../models/GovQualification');
  // Only active (latest) versions — fork-on-edit supersedes older ones — so one row per opportunity thread.
  const records: any[] = await GovQualification.findAll({ where: { tenant_id: tenantId, status: 'active' }, limit: 500 });
  const rows = (Array.isArray(records) ? records : []).map(rowFromQualification);
  const pursuits = matchPriorPursuits(agency, rows, gwsKey);
  return { agency: agency ?? null, priorCount: pursuits.length, pursuits };
}
