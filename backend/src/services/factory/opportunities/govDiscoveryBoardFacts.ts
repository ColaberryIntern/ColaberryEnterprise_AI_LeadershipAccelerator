/**
 * govDiscoveryBoardFacts: reads the saved state buildDiscoveryBoard needs. A failed dismissal read throws, because callers
 * must not act on or display hidden rows they can't identify. Every other read stays up for DISPLAY: it's logged and named
 * in `failedReads`, so a row may look less advanced for one load. rowsToHide refuses to act on those facts, because an
 * empty read looks exactly like "no human progress".
 */
import { FLAGS } from '../../../config/featureFlags';
import type { BoardFacts, FactRead, QualFacts, VettingFacts } from './govDiscoveryBoard';
import { deriveVettingStage, STAGE_RANK } from '../govOpportunityVetting';

async function readOrFlag<T>(failed: Set<FactRead>, name: FactRead, fallback: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err: any) {
    failed.add(name);
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: `gov_board_${name}_read_failed`, outcome: 'partial',
      error_class: err?.constructor?.name ?? 'Error', context: { message: err?.message },
    }));
    return fallback;
  }
}

/**
 * PURE. One opportunity can have a qualification per bidding entity. Human progress on ANY of them counts, so one entity's
 * untouched record can't make another's work look absent. `base` is the most advanced row; no_bid only stands when every
 * entity declined.
 */
export function mergeQualFacts(base: QualFacts, other: QualFacts): QualFacts {
  const humanDecision = (d: string | null): boolean => d === 'approved_bid_pursuit' || d === 'rfi_response';
  let decision = base.decision;
  if (humanDecision(other.decision) && !humanDecision(decision)) decision = other.decision;
  else if (decision === 'no_bid' && other.decision !== 'no_bid') decision = other.decision;
  return {
    ...base,
    decision,
    approvalRequested: base.approvalRequested || other.approvalRequested,
    establishedCount: Math.max(base.establishedCount, other.establishedCount),
    zipSha: base.zipSha ?? other.zipSha,
    title: base.title ?? other.title,
    agency: base.agency ?? other.agency,
    closeDate: base.closeDate ?? other.closeDate,
  };
}

const uuidOf = (key: unknown): string | null => (typeof key === 'string' && key.startsWith('gws:') ? key.slice(4) : null);

/** PURE. A qualification row as the classifier needs it. */
export function toQualFacts(rec: any, closeDate: string | null): QualFacts {
  const rj = rec?.requirements_json ?? {};
  const approval = typeof rj.approval?.status === 'string' ? rj.approval.status : null;
  const docs: any[] = Array.isArray(rj.reviewedDocuments) ? rj.reviewedDocuments : [];
  return {
    decision: typeof rec?.decision === 'string' ? rec.decision : null,
    approvalRequested: approval === 'requested' || approval === 'pending',
    establishedCount: Array.isArray(rj.established) ? rj.established.length : 0,
    zipSha: docs.find((d) => d && d.method === 'solicitation_zip' && d.sha256)?.sha256 ?? null,
    title: rj.provenance?.title ?? null,
    agency: rj.provenance?.agency ?? null,
    closeDate,
  };
}

/** PURE. A saved vetting row as the classifier needs it. */
export function toVettingFacts(r: any): VettingFacts {
  return {
    status: String(r?.status ?? 'queued'), verdict: r?.verdict ?? null, reason: r?.reason ?? null, quote: r?.reason_quote ?? null,
    coveragePct: typeof r?.coverage_pct === 'number' ? r.coverage_pct : null, errorClass: r?.error_class ?? null,
    opportunity: r?.opportunity_json && typeof r.opportunity_json === 'object' ? r.opportunity_json : null,
  };
}

export async function loadBoardFacts(tenantId: string): Promise<BoardFacts> {
  const { listActiveDismissedKeys, listRestoredKeys } = await import('./govOpportunityDismissals');
  const dismissed = await listActiveDismissedKeys(tenantId);
  const failedReads = new Set<FactRead>();
  const restored = await readOrFlag(failedReads, 'restored', new Set<string>(), () => listRestoredKeys(tenantId));

  const assigned = await readOrFlag(failedReads, 'assigned', new Set<string>(), async () => {
    const { listGovPipeline, assignedOpportunityUuids } = await import('../govPipeline');
    return assignedOpportunityUuids(await listGovPipeline(tenantId));
  });

  const qualifications = await readOrFlag(failedReads, 'qualifications', new Map<string, QualFacts>(), async () => {
    const { default: GovQualification } = await import('../../../models/GovQualification');
    const { resolveGovCloseDate } = await import('../govPipeline');
    // Ordered so a tie between entities always resolves the same way: the newest record's ZIP.
    const rows: any[] = await GovQualification.findAll({ where: { tenant_id: tenantId, status: 'active', superseded_by_id: null }, order: [['updated_at', 'DESC'], ['id', 'ASC']] });
    const out = new Map<string, QualFacts>();
    const ranks = new Map<string, number>();
    for (const row of rows) {
      const rec = row?.get ? row.get() : row;
      const uuid = uuidOf(rec?.canonical_opportunity_id);
      if (!uuid) continue;
      const rank = STAGE_RANK[deriveVettingStage(rec).stage];
      const facts = toQualFacts(rec, resolveGovCloseDate(rec));
      const seen = out.get(uuid);
      const seenRank = ranks.get(uuid) ?? -1;
      out.set(uuid, !seen ? facts : seenRank >= rank ? mergeQualFacts(seen, facts) : mergeQualFacts(facts, seen));
      ranks.set(uuid, Math.max(seenRank, rank));
    }
    return out;
  });

  const vettings = await readOrFlag(failedReads, 'vettings', new Map<string, VettingFacts>(), async () => {
    const { default: GovAiVetting } = await import('../../../models/GovAiVetting');
    const rows: any[] = await GovAiVetting.findAll({ where: { tenant_id: tenantId }, order: [['last_uploaded_at', 'DESC']] });
    const out = new Map<string, VettingFacts>();
    for (const row of rows) {
      const uuid = uuidOf(row?.qualification_key);
      if (uuid && !out.has(uuid)) out.set(uuid, toVettingFacts(row)); // newest upload first: later rows are history
    }
    return out;
  });

  const bundles = await readOrFlag(failedReads, 'bundles', new Set<string>(), async () => {
    const { default: GovSourceBundle } = await import('../../../models/GovSourceBundle');
    const rows: any[] = await GovSourceBundle.findAll({ where: { tenant_id: tenantId }, attributes: ['qualification_key', 'sha256'] });
    const out = new Set<string>();
    for (const row of rows) {
      const uuid = uuidOf(row?.qualification_key);
      if (uuid) out.add(`${uuid}:${row.sha256}`);
    }
    return out;
  });

  return { dismissed, restored, assigned, qualifications, vettings, bundles, aiEnabled: FLAGS.govAiVetting, sweepActs: FLAGS.govOpportunitySweep, failedReads };
}
