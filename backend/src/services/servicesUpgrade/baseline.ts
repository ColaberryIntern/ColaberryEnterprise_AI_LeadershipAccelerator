/**
 * SV0.1 - pure logic for the Our Services baseline: which pursuits to sample, how to read their requirements, how to
 * shape the catalog snapshot, and how to summarize the result. No I/O here; the script does the reading and writing.
 *
 * Why a baseline: every later Services Upgrade ticket must prove it did not make the Gov Contracts AI worse. That
 * proof needs a frozen "before" taken with the same code path the product uses (assessCapabilityFit over ACTIVE
 * services only).
 */
import fs from 'fs';
import path from 'path';
import {
  CapabilityFitBaseline, CatalogServiceRow, CatalogSnapshot, type PursuitBaseline,
} from './schemas';

export const BASELINE_SIZE = 5;
export const MIN_REQUIREMENTS = 3;
export const SELECTION_RULE =
  `The ${BASELINE_SIZE} most recently updated active gov qualifications (latest version per opportunity) with at least ` +
  `${MIN_REQUIREMENTS} established requirements; ties broken by canonical_opportunity_id ascending.`;

export interface QualificationRow {
  canonical_opportunity_id: string;
  status: string;
  version: number;
  updated_at: Date | string;
  // any: requirements_json is a free-form JSONB dossier owned by the gov pipeline; only `.established` and
  // `.provenance` are read here, each defensively.
  requirements_json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Established requirements -> {id, text}. Same id rule as govBuildPublish.mapEstablishedToRequirements. */
export function mapEstablished(established: unknown): { id: string; text: string }[] {
  if (!Array.isArray(established)) return [];
  const out: { id: string; text: string }[] = [];
  const seen = new Set<string>();
  // any: untyped JSONB array element, read defensively (same rule as govBuildPublish.mapEstablishedToRequirements).
  established.forEach((e: any, i: number) => {
    const id = String(e?.id ?? `REQ-${String(i + 1).padStart(3, '0')}`);
    const text = String(e?.text ?? e?.statement ?? '').trim();
    if (!text || seen.has(id)) return;
    seen.add(id);
    out.push({ id, text });
  });
  return out;
}

const ts = (v: Date | string): number => new Date(v).getTime() || 0;

/** Deterministic sample: latest active version per opportunity, >= MIN_REQUIREMENTS, newest first, id tie-break. */
export function selectBaselinePursuits(rows: QualificationRow[], n = BASELINE_SIZE): QualificationRow[] {
  const latest = new Map<string, QualificationRow>();
  for (const r of rows) {
    if (r.status !== 'active') continue;
    const prev = latest.get(r.canonical_opportunity_id);
    if (!prev || r.version > prev.version) latest.set(r.canonical_opportunity_id, r);
  }
  return [...latest.values()]
    .filter((r) => mapEstablished(r.requirements_json?.established).length >= MIN_REQUIREMENTS)
    .sort((a, b) => ts(b.updated_at) - ts(a.updated_at) || a.canonical_opportunity_id.localeCompare(b.canonical_opportunity_id))
    .slice(0, n);
}

/** serviceCatalog DTO -> snapshot row (only the fields the Gov AI contract cares about). */
// any: serviceCatalog.toServiceOfferingDto returns `any`; the result is Zod-validated on the next line.
export function toSnapshotRow(dto: any): CatalogServiceRow {
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
  return CatalogServiceRow.parse({
    id: dto.id, name: dto.name, description: dto.description ?? null, category: dto.category ?? null,
    keywords: arr(dto.keywords), naicsCodes: arr(dto.naicsCodes), pscCodes: arr(dto.pscCodes),
    pastPerformance: dto.pastPerformance ?? null, status: dto.status,
    updatedAt: dto.updatedAt ? new Date(dto.updatedAt).toISOString() : null,
  });
}

export interface BaselineSummary {
  byStatus: Record<'active' | 'growth' | 'retired', number>;
  weakRows: { id: string; name: string; issues: string[] }[];
  perPursuit: { id: string; title: string | null; have: number; partial: number; new: number; matched: number; error: string | null }[];
  totals: { have: number; partial: number; new: number; matched: number };
  /** Where today's catalog stands for every service a stored verdict matched: still active, moved to growth, or retired. */
  matchesByStatus: Record<'active' | 'growth' | 'retired' | 'unknown', number>;
}

/** Counts that the SV0.1 artifacts chart. Weak = would fail the Gov AI Compatibility Contract field rules. */
export function summarizeBaseline(snapshot: CatalogSnapshot, fit: CapabilityFitBaseline): BaselineSummary {
  const byStatus = { active: 0, growth: 0, retired: 0 };
  const weakRows: BaselineSummary['weakRows'] = [];
  for (const r of snapshot.rows) {
    byStatus[r.status] += 1;
    if (r.status !== 'active') continue;
    const issues: string[] = [];
    if (!r.description || r.description.trim().length < 40) issues.push('description missing or under 40 chars');
    if (!r.category) issues.push('no category');
    if (r.keywords.length < 3) issues.push('fewer than 3 keywords');
    if (r.naicsCodes.length === 0) issues.push('no NAICS');
    if (issues.length) weakRows.push({ id: r.id, name: r.name, issues });
  }
  const statusById = new Map(snapshot.rows.map((r) => [r.id, r.status]));
  const matchesByStatus = { active: 0, growth: 0, retired: 0, unknown: 0 };
  const perPursuit = fit.pursuits.map((p: PursuitBaseline) => {
    const c = (a: string) => p.capabilities.filter((x) => x.assessment === a).length;
    for (const x of p.capabilities) if (x.matchedServiceId) matchesByStatus[statusById.get(x.matchedServiceId) ?? 'unknown'] += 1;
    return { id: p.canonicalOpportunityId, title: p.title, have: c('have'), partial: c('partial'), new: c('new'),
      matched: p.capabilities.filter((x) => x.matchedServiceId).length, error: p.error };
  });
  const totals = perPursuit.reduce((t, p) => ({ have: t.have + p.have, partial: t.partial + p.partial, new: t.new + p.new, matched: t.matched + p.matched }),
    { have: 0, partial: 0, new: 0, matched: 0 });
  return { byStatus, weakRows, perPursuit, totals, matchesByStatus };
}

/**
 * Validate everything, then overwrite (never append). Throws before writing ANY file if any artifact is invalid.
 * `fits` maps a file stem (e.g. `capability_fit_stored`) to its baseline.
 */
export function writeBaseline(outDir: string, takenOn: string, snapshot: unknown, fits: Record<string, unknown>): string[] {
  const snap = CatalogSnapshot.parse(snapshot);
  const parsed = Object.entries(fits).map(([stem, f]) => [stem, CapabilityFitBaseline.parse(f)] as const);
  fs.mkdirSync(outDir, { recursive: true });
  const write = (stem: string, data: unknown): string => {
    const p = path.join(outDir, `${stem}_${takenOn}.json`);
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
    return p;
  };
  return [write('catalog', snap), ...parsed.map(([stem, f]) => write(stem, f))];
}

export const STORED_SELECTION_RULE = 'Every completed gov_ai_vettings row for the gov tenant with a stored fit_json, newest first. '
  + 'These are the verdicts the live Gov AI actually produced, against the catalog as it stood at each completed_at.';

/** A stored gov_ai_vettings row -> a baseline pursuit. Pure. */
// any: gov_ai_vettings.fit_json / opportunity_json are untyped JSONB; the result is Zod-validated by writeBaseline.
export function vettingToPursuit(v: any): PursuitBaseline {
  const caps: any[] = Array.isArray(v?.fit_json?.capabilities) ? v.fit_json.capabilities : [];
  return {
    canonicalOpportunityId: String(v.qualification_key), source: 'stored_vetting',
    title: v.title ?? v.opportunity_json?.title ?? null, requirementCount: null,
    verdict: v.verdict ?? null, coveragePct: typeof v.coverage_pct === 'number' ? v.coverage_pct : null,
    completedAt: v.completed_at ? new Date(v.completed_at).toISOString() : null, error: null,
    capabilities: caps.map((c) => ({ id: String(c.id ?? ''), name: String(c.name ?? ''), assessment: c.assessment,
      matchedServiceId: c.matchedServiceId ?? null, rationale: String(c.rationale ?? '') })),
  };
}

/** A raw SQL export row of service_offerings (snake_case) -> the serviceCatalog DTO shape toSnapshotRow expects. */
// any: raw psql json_agg row; validated by toSnapshotRow's Zod parse.
export function sqlRowToDto(r: any): any {
  return { id: r.id, name: r.name, description: r.description, category: r.category, keywords: r.keywords ?? r.keywords_json,
    naicsCodes: r.naics ?? r.naics_codes_json, pscCodes: r.psc ?? r.psc_codes_json, pastPerformance: r.past_performance,
    status: r.status, updatedAt: r.updated_at };
}

export interface BaselineArgs { help: boolean; catalogOnly: boolean; outDir: string; takenOn: string; fromExport: [string, string] | null }
export const BASELINE_USAGE = 'Usage: node dist/scripts/snapshotServiceCatalogBaseline.js [--catalog-only] [--from-export <catalog.json> <vettings.json>] [--help]\n' +
  '  --catalog-only  catalog snapshot only, no OpenAI call.\n' +
  '  --from-export   build the artifacts offline from read-only SQL exports (no DB connection, no OpenAI).\n' +
  '  env OUT_DIR (default /tmp/svc-baseline), TAKEN_ON (default today, YYYY-MM-DD).\n' +
  '  Read-only: lists service_offerings and runs capability-fit (no persistence) on the baseline pursuits.';

/** Pure arg parse - runs before the DB module is imported so --help has no side effects. */
export function parseBaselineArgs(argv: string[], env: Record<string, string | undefined>, today: string): BaselineArgs {
  return {
    help: argv.includes('--help') || argv.includes('-h'),
    catalogOnly: argv.includes('--catalog-only'),
    outDir: env.OUT_DIR || '/tmp/svc-baseline',
    takenOn: env.TAKEN_ON || today,
    fromExport: argv.includes('--from-export') ? [argv[argv.indexOf('--from-export') + 1], argv[argv.indexOf('--from-export') + 2]] as [string, string] : null,
  };
}
