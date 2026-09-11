import { Op } from 'sequelize';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import { canReopen } from './caseStateMachine';
import { reopenCase } from './caseRepository';
import { logCaseEvent } from './caseEventLog';
import type { ScoredCandidate } from './caseGroupingService';

// Reopen-on-reply (/inbox-zero T7).
//
// Before this, the hourly auto-sync turned EVERY surviving inbound message
// into a new case. A customer replying on a thread whose case Ali had
// already resolved did not reopen that case; it spawned a second case with
// none of the first one's history, and the resolved case stayed resolved.
// The only reopen trigger the engine had was source deletion.
//
// This step runs before clustering. For each surviving email candidate that
// carries a thread_id, it looks for an existing item on the same provider
// and thread whose case is in one of the engine's own REOPENABLE_STATES
// (RESOLVED, WAITING, DELEGATED — a reply on a WAITING case IS the thing
// being waited for). When found, the case is reopened through the ONE
// sanctioned path (caseRepository.reopenCase: REOPENED then straight to
// ASSESSING, reopen_count incremented, event logged, ticket re-opened), the
// reply is attached to that case as an INCLUDED item, and it is removed
// from the candidates that would otherwise become a new case.
//
// A case in any OTHER open state (ASSESSING, EXECUTING, ...) is left alone:
// attaching new replies to in-flight cases is a separate change with its
// own consequences for the planner, and today's behaviour (a new case) is
// preserved there, on purpose.

export const REOPEN_ACTOR = 'inbox_zero_reopen';

export interface ReopenOnReplyResult {
  /** Candidates that did NOT reopen anything and should proceed to clustering. */
  passthrough: ScoredCandidate[];
  /** Case ids reopened by this run (each at most once). */
  reopenedCaseIds: string[];
  /** Replies attached to reopened cases. */
  attached: number;
}

function threadKey(provider: string, threadId: string): string {
  return `${provider}::${threadId}`;
}

/**
 * Attach a reply to the case that owns its thread. Idempotent on
 * (case_id, source_hash) via the table's unique index: a re-run cannot
 * attach the same message twice.
 */
async function attachReply(caseRow: InboxCase, candidate: ScoredCandidate, correlationId: string): Promise<boolean> {
  try {
    const created = await InboxCaseItem.create({
      case_id: caseRow.id,
      source_type: candidate.source_type,
      source_id: candidate.source_id,
      provider: candidate.provider,
      source_url: candidate.source_url,
      title: candidate.title,
      occurred_at: candidate.occurred_at,
      match_score: candidate.score,
      match_reasons: [{ kind: 'reply_on_reopened_thread', detail: 'New message on a thread this case already owned', weight: 1 }],
      inclusion_status: 'INCLUDED',
      disposition: null,
      disposition_reason: null,
      snapshot: {
        ...candidate.snapshot,
        thread_id: candidate.thread_id,
        message_id: candidate.message_id,
        in_reply_to: candidate.in_reply_to,
        basecamp_refs: candidate.basecamp_refs,
      },
      source_hash: candidate.sourceHash,
    } as any); // `as any`: same create-shape cast caseDiscoveryService.persistClusterAsCase uses for this model
    await logCaseEvent({
      case_id: caseRow.id,
      item_id: created.id,
      event_type: 'candidate_included',
      actor_type: 'system',
      actor_id: REOPEN_ACTOR,
      details: { reason: 'reply_on_reopened_thread', source_type: candidate.source_type },
      correlation_id: correlationId,
    });
    return true;
  } catch (err: any) {
    if (err?.name === 'SequelizeUniqueConstraintError') return false; // already attached on a prior run
    throw err;
  }
}

export async function reopenCasesOnNewReplies(
  candidates: ScoredCandidate[],
  correlationId: string,
): Promise<ReopenOnReplyResult> {
  const withThread = candidates.filter((c) => c.source_type === 'email' && !!c.thread_id);
  if (withThread.length === 0) return { passthrough: candidates, reopenedCaseIds: [], attached: 0 };

  // One JSONB-path query for every thread this run saw, instead of one per candidate.
  const providers = Array.from(new Set(withThread.map((c) => c.provider)));
  const threadIds = Array.from(new Set(withThread.map((c) => c.thread_id as string)));
  const priorItems = await InboxCaseItem.findAll({
    where: { provider: { [Op.in]: providers }, source_type: 'email', snapshot: { thread_id: { [Op.in]: threadIds } } } as any, // `as any`: nested JSONB path where is not expressible in this model's WhereOptions typing
  });
  if (priorItems.length === 0) return { passthrough: candidates, reopenedCaseIds: [], attached: 0 };

  // Pre-T7 data can have ONE thread split across several cases (that is the
  // bug this step fixes), so a thread may map to more than one case. Collect
  // them all, then pick deterministically below.
  const caseIdsByThread = new Map<string, Set<string>>();
  for (const it of priorItems) {
    const tid = (it.snapshot as Record<string, unknown> | null)?.thread_id;
    if (typeof tid !== 'string') continue;
    const key = threadKey(it.provider, tid);
    if (!caseIdsByThread.has(key)) caseIdsByThread.set(key, new Set());
    caseIdsByThread.get(key)!.add(it.case_id);
  }

  const allCaseIds = Array.from(new Set(Array.from(caseIdsByThread.values()).flatMap((s) => Array.from(s))));
  const cases = await InboxCase.findAll({ where: { id: { [Op.in]: allCaseIds } } as any }); // see above
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const passthrough: ScoredCandidate[] = [];
  const reopened = new Set<string>();
  let attached = 0;

  // Tiebreak for a split thread, in order: a case THIS run already reopened
  // for it (so every reply on the thread lands in one place), then a case
  // that can actually be reopened, then the oldest — the original
  // conversation, not the accidental duplicate. Never row order.
  const ageOf = (c: InboxCase) => (c.opened_at ? new Date(c.opened_at).getTime() : 0);
  const byAge = (a: InboxCase, b: InboxCase) => ageOf(a) - ageOf(b) || a.id.localeCompare(b.id);
  const pickCase = (key: string): InboxCase | undefined => {
    const candidates = Array.from(caseIdsByThread.get(key) ?? []).map((id) => caseById.get(id)).filter((c): c is InboxCase => !!c);
    if (candidates.length === 0) return undefined;
    const alreadyThisRun = candidates.filter((c) => reopened.has(c.id)).sort(byAge);
    if (alreadyThisRun[0]) return alreadyThisRun[0];
    const reopenable = candidates.filter((c) => canReopen(c.state)).sort(byAge);
    return reopenable[0] ?? candidates.sort(byAge)[0];
  };

  for (const candidate of candidates) {
    const tid = candidate.source_type === 'email' ? candidate.thread_id : null;
    const caseRow = tid ? pickCase(threadKey(candidate.provider, tid)) : undefined;
    // A case this run already reopened is in ASSESSING now; a second reply on
    // the same thread must still attach to it, not leak through as a new case.
    if (!caseRow || (!reopened.has(caseRow.id) && !canReopen(caseRow.state))) {
      passthrough.push(candidate);
      continue;
    }

    if (!reopened.has(caseRow.id)) {
      await reopenCase(caseRow.id, {
        actor_type: 'system',
        actor_id: REOPEN_ACTOR,
        event_type: 'case_reopened',
        reason: `New reply on thread ${tid} from ${candidate.participants?.[0] ?? 'unknown sender'}`,
        details: { reopened_by: REOPEN_ACTOR, thread_id: tid, message_id: candidate.message_id },
      });
      reopened.add(caseRow.id);
    }
    if (await attachReply(caseRow, candidate, correlationId)) attached++;
  }

  if (reopened.size > 0) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'info',
        service: 'caseReopenService',
        event: 'cases_reopened_on_reply',
        outcome: 'success',
        correlation_id: correlationId,
        context: { reopened: reopened.size, attached },
      }),
    );
  }

  return { passthrough, reopenedCaseIds: Array.from(reopened), attached };
}
