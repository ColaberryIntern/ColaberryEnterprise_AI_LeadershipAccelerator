import crypto from 'crypto';
import { bcPost } from '../ops/basecampClient';
import WorkLedgerEvent from '../../models/WorkLedgerEvent';
import { emitEvent } from '../workLedger/workLedgerService';
import { getDaraBasecampConfig } from './daraBasecampConfigService';
import { getDaraAdminUserId } from './daraIdentitySeed';

/**
 * Dara v2 Phase 6 — the "governed Basecamp Agent-to-Human Work Gateway."
 *
 * REAL, DIRECT-RESEARCH FINDING THIS DESIGN RESPONDS TO (not from memory,
 * verified against the actual current code): the shared Basecamp credential
 * this repo's `basecampClient.ts`/`basecampToken.ts` already use (Phase 2's
 * approved reuse decision) is a bare OAuth bearer token tied to Ali's own
 * personal grant — there is no "on behalf of" header anywhere in the client.
 * Any write made through it is attributed, in Basecamp's own UI and activity
 * log, to Ali personally — not to any AI identity. A separate "CB System"
 * service-account token DOES exist in this codebase (person id 37708014),
 * but it is provisioned and used only by `scripts/ops-engine/*.js` (host
 * cron scripts outside this backend, with their own token cache/refresh
 * mechanism) — reusing it from here would be new integration work, not a
 * drop-in swap.
 *
 * Given that, this module does NOT change the Phase 2 credential decision
 * unilaterally (that's a real call for Ali, flagged in the Phase 6 gate
 * packet) — it mitigates the honesty gap the only way available without a
 * new credential: every real todo this creates carries a mandatory,
 * unmissable AI-disclosure line in its own body, so a human reading it in
 * Basecamp (regardless of who the API says authored it) is never misled
 * about who — or what — is actually asking. This directly serves Dara's own
 * persona guardrail: "Never pretend to be human or hide that you are an AI."
 *
 * Idempotency: real API calls to an external, human-visible system are the
 * one case in this whole mission where "duplicate on retry" is genuinely
 * bad (a second visible todo, not just a redundant internal row) — so this
 * checks for an existing WorkLedgerEvent under the same idempotency key
 * BEFORE attempting the real bcPost, not only after (emitEvent()'s own
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
    const todo = await bcPost<BasecampTodoResponse>(
      `/buckets/${config.projectId}/todolists/${config.todolistId}/todos.json`,
      {
        content: title,
        due_on: threeDaysFromNow(),
        assignee_ids: [config.assigneeBasecampPersonId],
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
