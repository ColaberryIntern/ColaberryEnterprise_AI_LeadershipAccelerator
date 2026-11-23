/**
 * agentCommsSweep - reconcile place_ai_call rows whose completion webhook never arrived (T10).
 *
 * Synthflow posts the call-complete webhook from a URL configured per agent in its dashboard. When it
 * does not arrive, the call still happened; this reads it back with fetchSynthflowCall and finishes the
 * row the way the webhook's agent-tool path does: status and provider_response, the timeline activity
 * ("<Agent> called <First>", same words as the webhook bridge), then completeAgentToolCall (summary).
 * Not reproduced: the webhook's lead-transcript extraction and InteractionOutcome row, which belong to
 * campaign calls, and its post-call SMS, which agent-tool calls never get.
 *
 * Bounds (Failure-First): at most SWEEP_LIMIT rows per run, only rows still open after PENDING_MINUTES,
 * and at most MAX_ATTEMPTS reads per row. A row that cannot be reconciled after MAX_ATTEMPTS is
 * dead-lettered IN PLACE: metadata.reconcile_state = 'dead_letter', logged at error with the call id,
 * and never picked up again. It stays visible on the agent's dashboard as an open call for a person
 * to check in Synthflow.
 *
 * Idempotent: the finishing UPDATE only applies while the row is still open (status sent|pending), so a
 * webhook landing during the sweep, or two sweeps at once, finish the row once. Voice off or no API key
 * means the sweep does nothing at all (it does not burn attempts on a call it cannot read).
 */
import type { SynthflowCallRecord } from '../synthflowService';
import { errorClassOf } from '../inbound/agentRecipientRouter';

export const SWEEP_LIMIT = 20;
export const MAX_ATTEMPTS = 3;
export const PENDING_MINUTES = 30;

export interface OpenCallRow { id: string; callId: string | null; leadId: number | null; meta: Record<string, unknown> }

export interface SweepDeps {
  enabled: () => boolean;
  open: (limit: number) => Promise<OpenCallRow[]>;
  fetchCall: (callId: string) => Promise<SynthflowCallRecord | null>;
  isTerminal: (status: string) => boolean;
  /** Finish the row if still open. Returns false when something else already finished it. */
  finish: (row: OpenCallRow, rec: SynthflowCallRecord) => Promise<boolean>;
  /** The timeline entry, written only by the caller that actually finished the row. */
  activity: (row: OpenCallRow, rec: SynthflowCallRecord) => Promise<void>;
  complete: (row: OpenCallRow, rec: SynthflowCallRecord) => Promise<void>;
  mergeMeta: (logId: string, meta: Record<string, unknown>) => Promise<void>;
}

export interface SweepReport { checked: number; reconciled: number; retried: number; deadLettered: number; failed: number }

const log = (event: string, outcome: 'success' | 'failure' | 'skipped', context: Record<string, unknown>, error_class?: string) =>
  (outcome === 'failure' ? console.error : console.log)(JSON.stringify({
    timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'agent-comms-sweep',
    event, outcome, ...(error_class ? { error_class } : {}), context,
  }));

export async function runAgentCommsSweep(deps: SweepDeps): Promise<SweepReport> {
  const report: SweepReport = { checked: 0, reconciled: 0, retried: 0, deadLettered: 0, failed: 0 };
  const started = Date.now();
  if (!deps.enabled()) { log('agent_comms_sweep_skipped', 'skipped', { reason: 'voice_off' }); return report; }

  let rows: OpenCallRow[];
  try {
    rows = await deps.open(SWEEP_LIMIT);
  } catch (err) {
    log('agent_comms_sweep_failed', 'failure', { stage: 'select' }, errorClassOf(err, 'SweepSelectError'));
    report.failed++;
    return report;
  }

  for (const row of rows.slice(0, SWEEP_LIMIT)) {
    report.checked++;
    try {
      const rec = row.callId ? await deps.fetchCall(row.callId) : null;
      if (rec && deps.isTerminal(rec.status)) {
        if (await deps.finish(row, rec)) {
          // The row is closed now, so nothing will pick it up again: a failed timeline write must
          // not stop the summary (the webhook isolates its activity bridge the same way).
          if (row.leadId) {
            try {
              await deps.activity(row, rec);
            } catch (err) {
              log('agent_call_activity_failed', 'failure', { log_id: row.id }, errorClassOf(err, 'ActivityWriteError'));
            }
          }
          await deps.complete(row, rec);
        }
        report.reconciled++;
        continue;
      }
      const attempts = Number(row.meta.reconcile_attempts || 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await deps.mergeMeta(row.id, { reconcile_attempts: attempts, reconcile_state: 'dead_letter', reconcile_last_status: rec?.status ?? 'unreadable' });
        log('agent_call_dead_lettered', 'failure', { log_id: row.id, call_id: row.callId, agent: row.meta.agent_name ?? null, attempts }, 'ReconcileExhausted');
        report.deadLettered++;
      } else {
        await deps.mergeMeta(row.id, { reconcile_attempts: attempts, reconcile_last_status: rec?.status ?? 'unreadable' });
        report.retried++;
      }
    } catch (err) {
      log('agent_call_reconcile_failed', 'failure', { log_id: row.id }, errorClassOf(err, 'ReconcileError'));
      report.failed++;
    }
  }
  log('agent_comms_sweep_done', 'success', { ...report, duration_ms: Date.now() - started });
  return report;
}

/* ── production dependencies, all lazily imported ─────────────────────────── */

export function defaultSweepDeps(): SweepDeps {
  const q = async <T extends object>(sql: string, replacements: Record<string, unknown>): Promise<T[]> => {
    const { sequelize } = await import('../../config/database');
    const { QueryTypes } = await import('sequelize');
    return sequelize.query<T>(sql, { replacements, type: QueryTypes.SELECT });
  };
  return {
    enabled: () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { env } = require('../../config/env');
      return Boolean(env.enableVoiceCalls && env.synthflowApiKey);
    },
    open: async (limit) => (await q<{ id: string; call_id: string | null; lead_id: number | null; metadata: Record<string, unknown> | null }>(
      `SELECT id, provider_message_id AS call_id, lead_id, metadata FROM communication_logs
        WHERE channel = 'voice' AND metadata->>'source' = 'agent-tool' AND status IN ('sent', 'pending')
          AND created_at < now() - make_interval(mins => :mins)
          AND coalesce(metadata->>'reconcile_state', '') <> 'dead_letter'
        ORDER BY created_at ASC LIMIT :limit`, { mins: PENDING_MINUTES, limit }))
      .map((r) => ({ id: String(r.id), callId: r.call_id, leadId: r.lead_id, meta: r.metadata || {} })),
    fetchCall: async (callId) => (await import('../synthflowService')).fetchSynthflowCall(callId),
    isTerminal: (status) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { isTerminalCallStatus } = require('../synthflowService');
      return isTerminalCallStatus(status);
    },
    finish: async (row, rec) => {
      const updated = await q<{ id: string }>(
        `UPDATE communication_logs SET status = :status,
            provider_response = coalesce(provider_response, '{}'::jsonb) || CAST(:pr AS jsonb)
          WHERE id = :id AND status IN ('sent', 'pending') RETURNING id`,
        { id: row.id, status: rec.status === 'completed' ? 'delivered' : 'failed', pr: JSON.stringify({
          call_status: rec.status, duration: rec.durationSeconds, transcript: rec.transcript, recording_url: rec.recordingUrl,
          end_call_reason: rec.endedReason, completed_at: new Date().toISOString(), reconciled_by: 'agent_comms_sweep',
        }) });
      return updated.length > 0;
    },
    activity: async (row, rec) => {
      const { Lead } = await import('../../models');
      const { logActivity } = await import('../activityService');
      const { callActivitySubject } = await import('./tools/agentCallCompletion');
      const lead = await Lead.findByPk(row.leadId as number, { attributes: ['name'] });
      await logActivity({
        lead_id: row.leadId as number, type: 'call',
        subject: callActivitySubject(String(row.meta.agent_name || 'Agent'), lead?.name ?? null, rec.durationSeconds, rec.disposition),
        body: rec.transcript ? rec.transcript.substring(0, 2000) : undefined,
        metadata: { activity_subtype: 'voice_call', call_id: row.callId, duration: rec.durationSeconds, disposition: rec.disposition, reconciled_by: 'agent_comms_sweep' },
      });
    },
    complete: async (row, rec) => {
      const { completeAgentToolCall, defaultCompletionDeps } = await import('./tools/agentCallCompletion');
      await completeAgentToolCall({ logId: row.id, meta: row.meta, transcript: rec.transcript, status: rec.status }, defaultCompletionDeps());
    },
    mergeMeta: async (logId, meta) => (await import('./tools/agentCallCompletion')).mergeCommLogMeta(logId, meta),
  };
}
