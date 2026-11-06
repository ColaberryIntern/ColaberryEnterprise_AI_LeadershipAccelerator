/**
 * resumeCycles — v3 §V2, T12. Bounded enqueueing of review cycles, for two triggers:
 *  - AUTO-RESUME: when a human answers a need, the documents it unblocked get a cycle kicked automatically, so the
 *    agent picks up where it was waiting (`resumeUnblocked`).
 *  - BUILD ALL: an admin/edit-share action that kicks a cycle for every not-passed document in blueprint order
 *    (`buildAllDocuments`).
 *
 * RAILS (bounded, idempotent): one active run per document (an already-running doc is skipped, matching the route's
 * 409), deduped candidate keys, and a per-call CAP so a single resolve or Build-all can never fan out unboundedly
 * (the per-project resume guard). `enqueueReviewCycles` takes the store/runner as injected deps so the dedupe + cap
 * are unit-testable without a DB; `resumeUnblocked` / `buildAllDocuments` wire the real services.
 */

/** Per-call cap: at most this many cycles are kicked from one resolve or Build-all (the per-project resume guard). */
export const RESUME_CAP = 5;

export interface BuildAllDocInput { key: string; status: string; superseded?: boolean; order?: number }

/**
 * PURE: the documents Build-all should enqueue — not yet accepted, not superseded — in blueprint (order_index) order,
 * capped. Deterministic: same documents ⇒ same list.
 */
export function planBuildAll(docs: BuildAllDocInput[], cap: number = RESUME_CAP): string[] {
  const limit = Math.max(1, Math.min(50, cap));
  return (Array.isArray(docs) ? docs : [])
    .filter((d) => d && d.key && d.status !== 'accepted' && !d.superseded)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((d) => d.key)
    .filter((k, i, xs) => xs.indexOf(k) === i)
    .slice(0, limit);
}

export interface EnqueueDeps {
  docIdFor: (projectId: string, docKey: string) => Promise<string | null>;
  isActive: (docId: string) => Promise<boolean>;
  createRun: (docId: string) => Promise<{ id: string }>;
  /** Fire-and-forget: start the cycle for (projectId, docKey) against the created run. */
  startCycle: (projectId: string, docKey: string, runId: string) => void;
}

export interface EnqueueResult { enqueued: Array<{ docKey: string; runId: string }>; skipped: string[] }

/**
 * Kick a review cycle for each candidate doc, bounded. Dedupes the keys, skips a doc with an active run (one at a time)
 * or no id, and stops at `cap`. Never throws — a per-doc store error skips that doc. Idempotent: re-running while a
 * cycle is active enqueues nothing new.
 */
export async function enqueueReviewCycles(
  projectId: string,
  docKeys: string[],
  deps: EnqueueDeps,
  opts?: { cap?: number },
): Promise<EnqueueResult> {
  const cap = Math.max(1, Math.min(20, opts?.cap ?? RESUME_CAP));
  const unique = [...new Set((Array.isArray(docKeys) ? docKeys : []).filter(Boolean))];
  const enqueued: Array<{ docKey: string; runId: string }> = [];
  const skipped: string[] = [];
  for (const docKey of unique) {
    if (enqueued.length >= cap) { skipped.push(docKey); continue; }
    try {
      const docId = await deps.docIdFor(projectId, docKey);
      if (!docId) { skipped.push(docKey); continue; }
      if (await deps.isActive(docId)) { skipped.push(docKey); continue; } // one active run per doc (409 dedupe)
      const { id: runId } = await deps.createRun(docId);
      deps.startCycle(projectId, docKey, runId);
      enqueued.push({ docKey, runId });
    } catch { skipped.push(docKey); }
  }
  return { enqueued, skipped };
}

/** Build the real enqueue deps (run store + the fire-and-forget cycle runner). */
async function realDeps(identityId: string | null, maxIterations: number): Promise<EnqueueDeps> {
  const review = await import('./govProposalReviewStore');
  const runs = await import('./govProposalReviewRunStore');
  return {
    docIdFor: (projectId, docKey) => review.docIdFor(projectId, docKey),
    isActive: async (docId) => !!(await runs.activeRunForDoc(docId)),
    createRun: (docId) => runs.createRun(docId),
    startCycle: (projectId, docKey, runId) => {
      void (async () => {
        try {
          const { runReviewCycle } = await import('./runReviewCycle');
          await runReviewCycle(projectId, docKey, { maxIterations, identityId, runId });
        } catch {
          try { await runs.updateRun(runId, { status: 'failed', lastMessage: 'The review cycle errored.' }); } catch { /* never leave the run stuck active */ }
        }
      })();
    },
  };
}

/** AUTO-RESUME: kick a cycle for each document a just-answered need unblocked (bounded). Fire-and-forget safe. */
export async function resumeUnblocked(projectId: string, unblockedDocKeys: string[], opts?: { identityId?: string | null; maxIterations?: number }): Promise<EnqueueResult> {
  if (!projectId || !(Array.isArray(unblockedDocKeys) && unblockedDocKeys.length)) return { enqueued: [], skipped: [] };
  const deps = await realDeps(opts?.identityId ?? null, opts?.maxIterations ?? 3);
  return enqueueReviewCycles(projectId, unblockedDocKeys, deps);
}

/** BUILD ALL: kick a cycle for every not-passed document in blueprint order (bounded). */
export async function buildAllDocuments(projectId: string, opts?: { identityId?: string | null; maxIterations?: number; cap?: number }): Promise<EnqueueResult> {
  if (!projectId) return { enqueued: [], skipped: [] };
  const { listProposalDocuments } = await import('./govProposalDocumentStore');
  const docs = await listProposalDocuments(projectId);
  const keys = planBuildAll(docs.map((d) => ({ key: d.key, status: d.status, superseded: d.superseded, order: d.order })), opts?.cap);
  const deps = await realDeps(opts?.identityId ?? null, opts?.maxIterations ?? 3);
  return enqueueReviewCycles(projectId, keys, deps, { cap: opts?.cap });
}
