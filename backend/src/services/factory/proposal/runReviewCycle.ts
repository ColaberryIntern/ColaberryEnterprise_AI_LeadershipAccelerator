/**
 * runReviewCycle — the Proposal Studio P5 agent loop. It drafts/revises a document toward the 95 bar, following the
 * FLOW.md cycle: run the six checks, and either STOP (the version passes, or it hit an open question a human must
 * answer, or revision failed) or REVISE the failing sections and write a new version, up to `maxIterations` (default
 * 3). Each iteration writes a version with a change summary and emits a structured log line. It never fabricates — a
 * missing fact surfaces as a gap and stops the loop for a human.
 *
 * The loop CORE (`reviewCycleCore`) takes its I/O as injected deps so it is unit-testable without a DB or the model;
 * `runReviewCycle` wires the real services.
 */
import type { CheckRunResult } from './proposalReviewTypes';
import type { Grounding } from './proposalGrounding';
import type { ReviseResult } from './reviseProposalDocumentAI';

export type ReviewCycleStop = 'passed' | 'open_questions' | 'revise_failed' | 'max_iterations' | 'no_document' | 'build_failed';

export interface ReviewCycleResult {
  iterations: number;
  stoppedBecause: ReviewCycleStop;
  finalPasses: boolean;
}

export interface ReviewCycleDeps {
  loadContent: () => Promise<string | null>;        // current document HTML, or null if the document has no draft
  /** v3 T06: build the FIRST draft (outline → section drafts → assemble → save) when the document has none. Returns
   *  the assembled HTML, or null if the build failed. Absent ⇒ the legacy `no_document` stop (older callers). */
  createDraft?: () => Promise<string | null>;
  runChecks: () => Promise<CheckRunResult | null>;  // score the current version
  gatherGrounding: () => Promise<Grounding>;        // the agent's only facts
  revise: (html: string, findings: CheckRunResult['findings'], g: Grounding) => Promise<ReviseResult>;
  saveVersion: (html: string, changeSummary: string) => Promise<void>; // write a new agent version
  persistGaps: (gaps: Array<{ question: string; suggestions: string[] }>) => Promise<void>;
  log: (fields: Record<string, unknown>) => void;
}

export async function reviewCycleCore(deps: ReviewCycleDeps, opts?: { maxIterations?: number }): Promise<ReviewCycleResult> {
  const max = Math.max(1, Math.min(10, opts?.maxIterations ?? 3));
  let currentHtml = await deps.loadContent();
  if (currentHtml === null) {
    // v3 T06: no draft yet — the agent BUILDS one from the outline instead of dead-ending. The create-path drafts
    // the sections, assembles them, and saves the first version; the loop below then judges + revises it like any
    // other draft. A caller that did not inject a create-path keeps the old `no_document` behavior.
    if (!deps.createDraft) return { iterations: 0, stoppedBecause: 'no_document', finalPasses: false };
    deps.log({ event: 'review_cycle_build', step: 'outlining' });
    const built = await deps.createDraft();
    if (!built) { deps.log({ event: 'review_cycle_build', step: 'build_failed' }); return { iterations: 0, stoppedBecause: 'build_failed', finalPasses: false }; }
    deps.log({ event: 'review_cycle_build', step: 'built' });
    currentHtml = built;
  }

  for (let i = 1; i <= max; i++) {
    const checks = await deps.runChecks();
    const passes = !!checks?.passes;
    deps.log({ event: 'review_cycle_iteration', iteration: i, passes, scores: checks?.scores ?? null });
    if (passes) return { iterations: i, stoppedBecause: 'passed', finalPasses: true };

    // An open question (an unresolved fact gap) needs a human — stop and surface it.
    const openQuestions = (checks?.findings ?? []).filter((f) => f.check === 'fact' && f.severity === 'major');
    if (openQuestions.length) return { iterations: i, stoppedBecause: 'open_questions', finalPasses: false };

    const grounding = await deps.gatherGrounding();
    const revised = await deps.revise(currentHtml, checks?.findings ?? [], grounding);
    if (revised.error || !revised.html) return { iterations: i, stoppedBecause: 'revise_failed', finalPasses: false };

    // The revision raised questions it could not answer from the grounding — persist them and stop for a human.
    if (revised.gaps.length) { await deps.persistGaps(revised.gaps); deps.log({ event: 'review_cycle_gaps', iteration: i, gaps: revised.gaps.length }); return { iterations: i, stoppedBecause: 'open_questions', finalPasses: false }; }

    await deps.saveVersion(revised.html, revised.changeSummary || `Agent revision ${i}`);
    currentHtml = revised.html;
  }
  return { iterations: max, stoppedBecause: 'max_iterations', finalPasses: false };
}

/** Map the cycle's stop reason to the observable run-row status (B.5). */
const RUN_STATUS_FOR_STOP: Record<ReviewCycleStop, 'passed' | 'blocked' | 'failed' | 'done'> = {
  passed: 'passed',
  open_questions: 'blocked',   // a human must answer a question before the agent can continue
  revise_failed: 'failed',
  max_iterations: 'done',
  no_document: 'failed',
  build_failed: 'failed',      // v3 T06: the create-path could not draft any section (e.g. no API key)
};

/** Wire the real services for a project/document and run the cycle. Fire this fail-soft from a route (kick off,
 *  then the client polls the run — opts.runId — and the version history). When `runId` is given, the cycle writes its
 *  progress (iterations + last message) and terminal status onto that gov_proposal_review_runs row (B.5). */
export async function runReviewCycle(deliveryProjectId: string, docKey: string, opts?: { maxIterations?: number; identityId?: string | null; runId?: string | null }): Promise<ReviewCycleResult> {
  const { listProposalDocuments } = await import('./govProposalDocumentStore');
  const { runProposalDocumentChecks } = await import('./runProposalDocumentChecks');
  const { reviseDocument } = await import('./reviseProposalDocumentAI');
  const { buildGrounding } = await import('./proposalGrounding');
  const { draftProposalDocument } = await import('./govProposalDocumentActions');
  const { updateRun } = await import('./govProposalReviewRunStore');
  const { QueryTypes } = await import('sequelize');
  const { sequelize } = await import('../../../config/database');
  const runId = opts?.runId ?? null;

  const docOf = async () => (await listProposalDocuments(deliveryProjectId)).find((d) => d.key === docKey) ?? null;

  function log(fields: Record<string, unknown>): void {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'proposal-studio-cycle', deliveryProjectId, docKey, ...fields }));
    // B.5: mirror per-iteration progress onto the run row so the agent panel can poll it (best-effort, fire-and-forget).
    if (runId && fields.event === 'review_cycle_iteration') {
      const iteration = typeof fields.iteration === 'number' ? fields.iteration : undefined;
      void updateRun(runId, { iterations: iteration, lastMessage: fields.passes ? `Iteration ${iteration}: passed the checks` : `Iteration ${iteration}: revising failing sections` }).catch(() => undefined);
    }
  }

  // The grounding loader, shared by the create-path (T06) and the revise loop so both draft/revise against the same
  // facts. Best-effort: a missing blueprint/facts still yields a grounding that instructs a [PLACEHOLDER], never an
  // invention.
  async function gather(): Promise<Grounding> {
    const d = await docOf();
    let blueprint: any = null; let facts: string[] = [];
    try { const { default: GovProposalBlueprint } = await import('../../../models/GovProposalBlueprint'); const bp: any = await GovProposalBlueprint.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] }); blueprint = bp ? bp.blueprint_json : null; } catch { /* best-effort */ }
    try {
      const { default: GovQualification } = await import('../../../models/GovQualification');
      const q: any = await GovQualification.findOne({ where: { delivery_project_id: deliveryProjectId }, order: [['version', 'DESC']] });
      if (q?.tenant_id) { const { approvedGroundingFacts } = await import('./govCompanyLibrary'); facts = await approvedGroundingFacts(q.tenant_id); }
    } catch { /* best-effort; grounding without facts still instructs a [PLACEHOLDER], never an invention */ }
    // P-SRC: retrieve the most relevant excerpts from this project's APPROVED uploaded source documents and ground them
    // as cited reference material. Best-effort: no source library, or the embedding proxy down, yields no excerpts.
    let sourceExcerpts: Array<{ documentName: string; text: string }> = [];
    try {
      const { retrieveRelevantChunks } = await import('./govProposalSources');
      const query = [d?.title ?? docKey, ...(d?.requirementIds ?? []), ...((d?.sections ?? []).map((s: any) => `${s.heading ?? ''} ${s.plan ?? ''}`.trim()))].filter(Boolean).join('\n').slice(0, 4000);
      const hits = await retrieveRelevantChunks(deliveryProjectId, query, 8);
      sourceExcerpts = hits.map((h) => ({ documentName: h.documentName, text: h.text }));
    } catch { /* best-effort; grounding without excerpts is still valid */ }
    return buildGrounding({ blueprint, document: { title: d?.title ?? docKey, requirements: (d?.requirementIds ?? []).map((id) => ({ canonicalReqId: id, statement: id })), sections: d?.sections ?? [] }, approvedFacts: facts, sourceExcerpts });
  }

  const deps: ReviewCycleDeps = {
    loadContent: async () => { const d = await docOf(); return d ? (d.contentHtml || null) : null; },
    // T06 create-path: outline → grounded section drafts → assemble → save the first version. The grounding is the
    // same `gather()` the revise loop uses; progress (outlining / drafting k/n) is mirrored onto the run row.
    createDraft: async () => {
      const d = await docOf();
      if (!d) return null;
      const { createFirstProposalDraft } = await import('./createProposalDraft');
      const { draftProposalSectionAI } = await import('./sectionDrafting');
      const g = await gather();
      return createFirstProposalDraft({
        doc: { docKey, title: d.title ?? docKey, requirementIds: d.requirementIds ?? [], sections: (d.sections ?? []).map((s) => ({ sectionKey: s.sectionKey, heading: s.heading, requirementIds: s.requirementIds ?? [], order: s.order, plan: s.plan })), pageLimit: d.pageLimit ?? null },
        grounding: g,
        draftSection: async (section) => { const r = await draftProposalSectionAI({ docKey, docTitle: d.title ?? docKey, section, grounding: g }); return { html: r.html, gaps: r.gaps, error: r.error }; },
        saveDraft: async (html) => { await draftProposalDocument({ deliveryProjectId, docKey, identityId: opts?.identityId ?? null, canVerify: true, manualHtml: html }); },
        onProgress: (msg) => { if (runId) void updateRun(runId, { lastMessage: msg }).catch(() => undefined); },
      });
    },
    runChecks: () => runProposalDocumentChecks(deliveryProjectId, docKey),
    gatherGrounding: gather,
    revise: (html, findings, g) => reviseDocument(html, findings, g),
    saveVersion: async (html) => { await draftProposalDocument({ deliveryProjectId, docKey, identityId: opts?.identityId ?? null, canVerify: true, manualHtml: html }); },
    persistGaps: async (gaps) => {
      for (const gp of gaps) {
        // section_key is NOT NULL; a cycle-raised gap is document-level, so it carries the 'document' sentinel.
        try { await sequelize.query('INSERT INTO gov_proposal_document_gaps (delivery_project_id, doc_key, section_key, question, suggestions, resolution) VALUES ($1,$2,$3,$4,$5::jsonb,$6)', { bind: [deliveryProjectId, docKey, 'document', gp.question, JSON.stringify(gp.suggestions ?? []), 'open'], type: QueryTypes.INSERT }); } catch { /* best-effort */ }
      }
    },
    log,
  };
  const result = await reviewCycleCore(deps, { maxIterations: opts?.maxIterations });
  // B.5: stamp the terminal status + final iteration count onto the run row so the UI stops polling and shows the
  // outcome (Passed / Blocked on a question / Done at max iterations / Failed). Best-effort; never throws past here.
  if (runId) {
    try { await updateRun(runId, { status: RUN_STATUS_FOR_STOP[result.stoppedBecause], iterations: result.iterations, lastMessage: `Stopped: ${result.stoppedBecause}`, resultJson: result }); } catch { /* best-effort */ }
  }
  return result;
}
