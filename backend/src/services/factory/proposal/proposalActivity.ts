/**
 * proposalActivity — the Proposal Studio agent-panel activity feed (B.4). It is DERIVED at read-time from rows that
 * already exist (document versions, gate decisions, build-artifact captures, blueprint versions, library answers,
 * signatures) — there is NO new event table. `mergeActivity` is the PURE, unit-testable core; `loadProposalActivity`
 * gathers the sources best-effort (a missing/younger table never breaks the feed) and merges them newest-first.
 */
export type ActivityKind = 'version' | 'gate' | 'artifact' | 'blueprint' | 'library_answer' | 'signature';

export interface ActivityEvent {
  kind: ActivityKind;
  at: string;              // ISO timestamp (feed is sorted newest-first on this)
  summary: string;
  docKey?: string | null;
}

export interface ActivitySources {
  versions?: Array<{ docKey?: string | null; version: number; authorKind: string; changeSummary: string | null; createdAt: string | null }>;
  gates?: Array<{ docKey?: string | null; gate: string; status: string; decidedAt: string | null }>;
  artifacts?: Array<{ storyId?: string | null; caption?: string | null; capturedAt: string | null }>;
  blueprints?: Array<{ version: number; createdAt: string | null }>;
  libraryAnswers?: Array<{ key: string; createdAt: string | null }>;
  signatures?: Array<{ formKey: string; status: string; at: string | null }>;
}

/** PURE: fold the typed sources into one newest-first, limit-bounded feed. Rows without a timestamp are dropped
 *  (they cannot be ordered). Deterministic; garbage ⇒ empty. */
export function mergeActivity(sources: ActivitySources, limit = 50): ActivityEvent[] {
  const s = sources ?? {};
  const events: ActivityEvent[] = [];
  for (const v of s.versions ?? []) if (v?.createdAt) events.push({ kind: 'version', at: v.createdAt, docKey: v.docKey ?? null, summary: `${v.authorKind === 'human' ? 'Human' : 'Agent'} version ${v.version}${v.changeSummary ? `: ${v.changeSummary}` : ''}` });
  for (const g of s.gates ?? []) if (g?.decidedAt) events.push({ kind: 'gate', at: g.decidedAt, docKey: g.docKey ?? null, summary: `${g.gate} gate ${g.status}` });
  for (const a of s.artifacts ?? []) if (a?.capturedAt) events.push({ kind: 'artifact', at: a.capturedAt, summary: `Captured ${a.caption || a.storyId || 'a build screenshot'}` });
  for (const b of s.blueprints ?? []) if (b?.createdAt) events.push({ kind: 'blueprint', at: b.createdAt, summary: `Blueprint v${b.version} analyzed` });
  for (const l of s.libraryAnswers ?? []) if (l?.createdAt) events.push({ kind: 'library_answer', at: l.createdAt, summary: `Answered: ${l.key}` });
  for (const sig of s.signatures ?? []) if (sig?.at) events.push({ kind: 'signature', at: sig.at, docKey: null, summary: `${sig.formKey} ${sig.status}` });
  const n = Math.max(1, Math.min(200, Number.isFinite(limit) ? limit : 50));
  return events
    .filter((e) => typeof e.at === 'string' && e.at)
    .sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
    .slice(0, n);
}

/** Gather the activity sources for a project (best-effort, each in its own try/catch) and merge newest-first. */
export async function loadProposalActivity(deliveryProjectId: string, limit = 50): Promise<ActivityEvent[]> {
  if (!deliveryProjectId) return [];
  const sources: ActivitySources = {};
  const iso = (d: unknown): string | null => (d ? new Date(d as any).toISOString() : null);

  // Documents → id/key map, then their versions + gate decisions.
  try {
    const { default: GovProposalDocument } = await import('../../../models/GovProposalDocument');
    const docRows: any[] = await GovProposalDocument.findAll({ where: { delivery_project_id: deliveryProjectId } });
    const keyById = new Map<string, string>();
    const docIds: string[] = [];
    for (const r of docRows) { const p = r.get({ plain: true }); keyById.set(p.id, p.doc_key); docIds.push(p.id); }
    if (docIds.length) {
      try {
        const { default: GovProposalDocumentVersion } = await import('../../../models/GovProposalDocumentVersion');
        const vrows: any[] = await GovProposalDocumentVersion.findAll({ where: { document_id: docIds } });
        sources.versions = vrows.map((r) => { const p = r.get({ plain: true }); return { docKey: keyById.get(p.document_id) ?? null, version: p.version, authorKind: p.author_kind, changeSummary: p.change_summary ?? null, createdAt: iso(p.created_at) }; });
      } catch { /* best-effort */ }
      try {
        const { default: GovProposalGateReview } = await import('../../../models/GovProposalGateReview');
        const grows: any[] = await GovProposalGateReview.findAll({ where: { document_id: docIds } });
        sources.gates = grows.map((r) => { const p = r.get({ plain: true }); return { docKey: keyById.get(p.document_id) ?? null, gate: p.gate, status: p.status, decidedAt: iso(p.decided_at) }; });
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }

  try {
    const { default: GovBuildArtifact } = await import('../../../models/GovBuildArtifact');
    const rows: any[] = await GovBuildArtifact.findAll({ where: { delivery_project_id: deliveryProjectId } });
    sources.artifacts = rows.map((r) => { const p = r.get({ plain: true }); return { storyId: p.story_id ?? null, caption: p.caption ?? null, capturedAt: iso(p.captured_at) }; });
  } catch { /* best-effort */ }

  try {
    const { default: GovProposalBlueprint } = await import('../../../models/GovProposalBlueprint');
    const rows: any[] = await GovProposalBlueprint.findAll({ where: { delivery_project_id: deliveryProjectId } });
    sources.blueprints = rows.map((r) => { const p = r.get({ plain: true }); return { version: p.version, createdAt: iso(p.created_at) }; });
  } catch { /* best-effort */ }

  // Library answers recorded from the Proposal Studio, scoped to the project's tenant.
  try {
    const { default: GovQualification } = await import('../../../models/GovQualification');
    const q: any = await GovQualification.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
    if (q?.tenant_id) {
      const { default: GovCompanyFact } = await import('../../../models/GovCompanyFact');
      const rows: any[] = await GovCompanyFact.findAll({ where: { tenant_id: q.tenant_id, source: 'answered in proposal studio' } });
      sources.libraryAnswers = rows.map((r) => { const p = r.get({ plain: true }); return { key: p.key, createdAt: iso(p.created_at ?? p.updated_at) }; });
    }
  } catch { /* best-effort */ }

  return mergeActivity(sources, limit);
}
