/**
 * proposalActivity — the Proposal Studio agent-panel activity feed (B.4). It is DERIVED at read-time from rows that
 * already exist (review runs, document gaps/needs, document versions, gate decisions, build-artifact captures,
 * blueprint versions, library answers, signatures) — there is NO new event table. `mergeActivity` is the PURE,
 * unit-testable core; `loadProposalActivity` gathers the sources best-effort (a missing/younger table never breaks
 * the feed) and merges them newest-first.
 *
 * The feed is a PLAIN BUILD LOG, not prose. It reports only what actually happened — the agent is starting a
 * document, it created a Need for you, it finished a document, it is starting the next one. It never echoes the
 * drafter's own narration (that is where overstated "white glove" language came from), so every line is a fact
 * tied to a row and a timestamp.
 */
export type ActivityKind = 'run' | 'need' | 'version' | 'gate' | 'artifact' | 'blueprint' | 'library_answer' | 'signature';

export interface ActivityEvent {
  kind: ActivityKind;
  at: string;              // ISO timestamp (feed is sorted newest-first on this)
  summary: string;
  docKey?: string | null;
}

export interface ActivitySources {
  /** One row per review-cycle run; emits a "Starting <doc>" at startedAt and a "Finished/Paused/Snag <doc>" at finishedAt. */
  runs?: Array<{ docKey?: string | null; title?: string | null; status: string; startedAt: string | null; finishedAt: string | null }>;
  /** A gap the agent could not fill from grounded facts — emitted as "Created a Needs for you: <question>". */
  needs?: Array<{ docKey?: string | null; title?: string | null; question: string; createdAt: string | null }>;
  versions?: Array<{ docKey?: string | null; title?: string | null; version: number; authorKind: string; createdAt: string | null }>;
  gates?: Array<{ docKey?: string | null; title?: string | null; gate: string; status: string; decidedAt: string | null }>;
  artifacts?: Array<{ storyId?: string | null; caption?: string | null; capturedAt: string | null }>;
  blueprints?: Array<{ version: number; createdAt: string | null }>;
  libraryAnswers?: Array<{ key: string; createdAt: string | null }>;
  signatures?: Array<{ formKey: string; status: string; at: string | null }>;
}

/** A document's display name for the feed: its title, else its key, else a neutral fallback. */
function docName(title?: string | null, docKey?: string | null): string {
  return (title && title.trim()) || (docKey && docKey.trim()) || 'a document';
}

/** Trim a gap question to one readable line for the feed. */
function clip(str: string, n = 90): string {
  const x = (str || '').trim().replace(/\s+/g, ' ');
  return x.length > n ? `${x.slice(0, n - 1)}…` : x;
}

/** PURE: fold the typed sources into one newest-first, limit-bounded feed. Rows without a timestamp are dropped
 *  (they cannot be ordered). Deterministic; garbage ⇒ empty. */
export function mergeActivity(sources: ActivitySources, limit = 50): ActivityEvent[] {
  const s = sources ?? {};
  const events: ActivityEvent[] = [];

  for (const r of s.runs ?? []) {
    const name = docName(r?.title, r?.docKey);
    if (r?.startedAt) events.push({ kind: 'run', at: r.startedAt, docKey: r.docKey ?? null, summary: `Starting ${name}` });
    if (r?.finishedAt) {
      const msg = r.status === 'blocked' ? `Paused ${name}, waiting on your answers`
        : r.status === 'failed' ? `Hit a snag on ${name}, will retry`
        : `Finished ${name}`;
      events.push({ kind: 'run', at: r.finishedAt, docKey: r.docKey ?? null, summary: msg });
    }
  }
  for (const n of s.needs ?? []) if (n?.createdAt) events.push({ kind: 'need', at: n.createdAt, docKey: n.docKey ?? null, summary: `Created a Needs for you: ${clip(n.question)}` });
  for (const v of s.versions ?? []) if (v?.createdAt) events.push({ kind: 'version', at: v.createdAt, docKey: v.docKey ?? null, summary: `${v.authorKind === 'human' ? 'You edited' : 'Drafted'} ${docName(v.title, v.docKey)} (v${v.version})` });
  for (const g of s.gates ?? []) if (g?.decidedAt) events.push({ kind: 'gate', at: g.decidedAt, docKey: g.docKey ?? null, summary: `Checked ${docName(g.title, g.docKey)}: ${g.gate} ${g.status}` });
  for (const a of s.artifacts ?? []) if (a?.capturedAt) events.push({ kind: 'artifact', at: a.capturedAt, summary: `Captured ${a.caption || a.storyId || 'a build screenshot'}` });
  for (const b of s.blueprints ?? []) if (b?.createdAt) events.push({ kind: 'blueprint', at: b.createdAt, summary: `Re-read the solicitation package (v${b.version})` });
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

  // Documents → id/key/title map, then everything keyed off a document: runs, versions, gate decisions, and the gaps.
  try {
    const { default: GovProposalDocument } = await import('../../../models/GovProposalDocument');
    const docRows: any[] = await GovProposalDocument.findAll({ where: { delivery_project_id: deliveryProjectId } });
    const metaById = new Map<string, { docKey: string; title: string | null }>();
    const titleByKey = new Map<string, string | null>();
    const docIds: string[] = [];
    for (const r of docRows) { const p = r.get({ plain: true }); metaById.set(p.id, { docKey: p.doc_key, title: p.title ?? null }); titleByKey.set(p.doc_key, p.title ?? null); docIds.push(p.id); }
    if (docIds.length) {
      try {
        const { default: GovProposalReviewRun } = await import('../../../models/GovProposalReviewRun');
        const rrows: any[] = await GovProposalReviewRun.findAll({ where: { document_id: docIds } });
        sources.runs = rrows.map((r) => { const p = r.get({ plain: true }); const m = metaById.get(p.document_id); return { docKey: m?.docKey ?? null, title: m?.title ?? null, status: p.status, startedAt: iso(p.started_at), finishedAt: iso(p.finished_at) }; });
      } catch { /* best-effort */ }
      try {
        const { default: GovProposalDocumentVersion } = await import('../../../models/GovProposalDocumentVersion');
        const vrows: any[] = await GovProposalDocumentVersion.findAll({ where: { document_id: docIds } });
        sources.versions = vrows.map((r) => { const p = r.get({ plain: true }); const m = metaById.get(p.document_id); return { docKey: m?.docKey ?? null, title: m?.title ?? null, version: p.version, authorKind: p.author_kind, createdAt: iso(p.created_at) }; });
      } catch { /* best-effort */ }
      try {
        const { default: GovProposalGateReview } = await import('../../../models/GovProposalGateReview');
        const grows: any[] = await GovProposalGateReview.findAll({ where: { document_id: docIds } });
        sources.gates = grows.map((r) => { const p = r.get({ plain: true }); const m = metaById.get(p.document_id); return { docKey: m?.docKey ?? null, title: m?.title ?? null, gate: p.gate, status: p.status, decidedAt: iso(p.decided_at) }; });
      } catch { /* best-effort */ }
    }
    // Gaps ("Needs you") are keyed on delivery_project_id + doc_key, not document_id.
    try {
      const { default: GovProposalDocumentGap } = await import('../../../models/GovProposalDocumentGap');
      const gaprows: any[] = await GovProposalDocumentGap.findAll({ where: { delivery_project_id: deliveryProjectId } });
      sources.needs = gaprows.map((r) => { const p = r.get({ plain: true }); return { docKey: p.doc_key ?? null, title: titleByKey.get(p.doc_key) ?? null, question: p.question, createdAt: iso(p.created_at) }; });
    } catch { /* best-effort */ }
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
