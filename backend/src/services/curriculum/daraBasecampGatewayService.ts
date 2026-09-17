import crypto from 'crypto';
import { cbSystemBcPost } from './daraCbSystemBasecampClient';
import WorkLedgerEvent from '../../models/WorkLedgerEvent';
import { emitEvent } from '../workLedger/workLedgerService';
import { getDaraBasecampConfig } from './daraBasecampConfigService';
import { getDaraAdminUserId } from './daraIdentitySeed';

/**
 * Dara v2 Phase 6/7 — the "governed Basecamp Agent-to-Human Work Gateway."
 *
 * REAL, DIRECT-RESEARCH FINDING (Phase 6): the shared Basecamp credential
 * originally reused here (Ali's own personal OAuth grant) has no "on behalf
 * of" header — any write made through it is attributed, in Basecamp's own
 * UI and activity log, to Ali personally, not to any AI identity.
 *
 * REAL ACTIVATION DECISION (Phase 7, Ali, 2026-09-17): "Use CB System for
 * agent communication." This gateway now posts via `daraCbSystemBasecampClient.ts`
 * — the real, already-provisioned CB System service-account identity (person
 * id 37708014), verified live against the real API before this was wired
 * (a real todo fetch + people lookup, not assumed). This resolves the
 * attribution problem at the identity layer rather than only mitigating it —
 * the mandatory AI-disclosure line below is now belt-and-suspenders, not the
 * only defense, and is kept for the same reason Dara's persona guardrail
 * states it plainly regardless: never let the mechanism obscure that this is
 * an AI acting, even when the identity itself is honest too.
 *
 * Idempotency: real API calls to an external, human-visible system are the
 * one case in this whole mission where "duplicate on retry" is genuinely
 * bad (a second visible todo, not just a redundant internal row) — so this
 * checks for an existing WorkLedgerEvent under the same idempotency key
 * BEFORE attempting the real post, not only after (emitEvent()'s own
 * built-in idempotency-key dedup protects the LEDGER write, not the
 * external side effect that already happened by the time it's called).
 *
 * Fail-closed like every other Dara v2 proactive/external capability: no
 * real write happens unless `getDaraBasecampConfig()` returns a fully
 * configured, explicit target — see that module's own header.
 */
export interface BasecampGatewayResult {
  created: boolean;
  reason: string;
  basecampTodoId?: number;
  basecampAppUrl?: string;
}

function threeDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

interface BasecampTodoResponse {
  id: number;
  app_url: string;
}

export async function createBasecampTodoForHandoff(
  handoffTicketId: string,
  title: string,
  studentName: string,
  reason: string,
): Promise<BasecampGatewayResult> {
  const config = await getDaraBasecampConfig();
  if (!config) {
    return { created: false, reason: 'basecamp_gateway_not_configured' };
  }

  const idempotencyKey = `dara-basecamp-todo:${handoffTicketId}`;
  const existing = await WorkLedgerEvent.findOne({ where: { idempotency_key: idempotencyKey } });
  if (existing) {
    return { created: false, reason: 'already_created' };
  }

  const daraAdminUserId = await getDaraAdminUserId();
  const actorId = daraAdminUserId || 'dara';

  // Mandatory, unmissable AI-disclosure line — the real mitigation for the
  // credential-attribution finding above. Never omitted, never optional.
  const description =
    `<div>🤖 Created by Dara, Colaberry's AI Curriculum Employee — not a person. ` +
    `Flagged re: ${studentName}: ${reason}</div>`;

  try {
    const todo = await cbSystemBcPost<BasecampTodoResponse>(
      `/buckets/${config.projectId}/todolists/${config.todolistId}/todos.json`,
      {
        content: title,
        due_on: threeDaysFromNow(),
        // Omitted entirely (not an empty array) when no real assignee id is
        // configured — Basecamp treats a present-but-empty assignee_ids as
        // "unassign everyone", which is a different, unintended statement
        // from "nobody was ever set."
        ...(config.assigneeBasecampPersonId ? { assignee_ids: [config.assigneeBasecampPersonId] } : {}),
        description,
      },
    );

    await emitEvent({
      traceId: crypto.randomUUID(),
      actorType: 'ai_staff',
      actorId,
      intent: 'dara.basecamp_todo_create',
      domain: 'basecamp_gateway',
      actionClass: 'create',
      targetType: 'basecamp_todo',
      targetId: String(todo.id),
      riskTier: 'R3',
      idempotencyKey,
      afterStateRef: todo.app_url,
      result: 'success',
      sourceRecordType: 'ticket',
      sourceRecordId: handoffTicketId,
    });

    return { created: true, reason: 'created', basecampTodoId: todo.id, basecampAppUrl: todo.app_url };
  } catch (e: any) {
    await emitEvent({
      traceId: crypto.randomUUID(),
      actorType: 'ai_staff',
      actorId,
      intent: 'dara.basecamp_todo_create',
      domain: 'basecamp_gateway',
      actionClass: 'create',
      targetType: 'basecamp_todo',
      riskTier: 'R3',
      idempotencyKey,
      result: 'failure',
      reasonCode: String(e?.message || e).slice(0, 100),
      sourceRecordType: 'ticket',
      sourceRecordId: handoffTicketId,
    }).catch(() => { /* the real failure below is the one that matters */ });

    return { created: false, reason: 'basecamp_request_failed' };
  }
}
