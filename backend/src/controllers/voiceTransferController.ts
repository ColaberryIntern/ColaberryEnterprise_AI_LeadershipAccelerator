/**
 * Human transfer webhooks (VS3.2). Both run AFTER the same gate and verifyTwilio checks as every
 * other voice webhook (flag, signature, account, our number), then verify our signed ref.
 *
 *   POST /api/webhook/voice/twilio/connect-action   the relay session ended. HandoffData asks for a
 *        transfer -> <Dial> the teammate line (with a signed dial-action URL) or the safe fallback;
 *        any other end -> hang up.
 *   POST /api/webhook/voice/twilio/dial-action      the <Dial> finished. Answered -> hang up;
 *        busy / no-answer / failed / canceled -> the safe fallback.
 *
 * Every response is TwiML with status 200, even on a bad ref (hang-up): a 4xx makes Twilio speak an
 * "application error" to the person on the line. A fallback is recorded on the call
 * (voice_calls.state_reason = 'transfer_fallback') so a teammate calls back. The teammate number is
 * read from the server env only, here, and is never logged.
 */
import { tapVoiceLog } from '../services/voice/ops/opsMetrics';
import type { Request, Response } from 'express';
import { verifyToken } from '../services/voice/twilio/correlationToken';
import {
  ACTION_TOKEN_TTL_SECONDS, DIAL_ACTION_PATH, END_TWIML, FALLBACK_TWIML, decideConnectAction, decideDialAction, dialTwiml,
} from '../services/voice/transfer/humanTransfer';
import { mintToken } from '../services/voice/twilio/correlationToken';
import { loadVoiceConfig } from '../services/voice/voiceConfig';
import { refuseTransferDial } from '../services/voice/transfer/transferGuard';

export interface TransferDeps {
  target: () => string | undefined;
  publicBaseUrl: () => string | undefined;
  now: () => number;
  recordFallback: (callId: string) => Promise<void>;
  /** VS4.2: null = may dial; otherwise why not. Anything unreadable is a refusal. */
  refuseDial: (callId: string, target: string) => Promise<string | null>;
  /** VS3.6: an inbound call ended here (no status callback carries our ref for inbound). Never throws. */
  closeInbound: (callId: string, body: Record<string, unknown>) => Promise<void>;
  log: (line: Record<string, unknown>) => void;
}

export function defaultTransferDeps(): TransferDeps {
  return {
    target: () => loadVoiceConfig().VOICE_TRANSFER_NUMBER,
    publicBaseUrl: () => loadVoiceConfig().VOICE_PUBLIC_BASE_URL,
    now: () => Date.now(),
    recordFallback: async (callId) => {
      const { sequelize } = await import('../config/database');
      await sequelize.query("UPDATE voice_calls SET state_reason = 'transfer_fallback', updated_at = NOW() WHERE id = :callId AND state_reason IS DISTINCT FROM 'caller_opt_out'", { replacements: { callId } });
    },
    refuseDial: (callId, target) => refuseTransferDial(callId, target),
    closeInbound: closeInboundCall,
    log: (line) => (line.level === 'error' || line.level === 'warn' ? console.warn : console.log)(JSON.stringify(tapVoiceLog(line))),
  };
}

export async function closeInboundCall(callId: string, body: Record<string, unknown>): Promise<void> {
  if (body.Direction !== 'inbound') return;
  try {
    const store = await import('../services/voice/twilio/voiceCallStore');
    const { twilioStatusToEvents } = await import('../services/voice/twilio/twilioStatusMap');
    const now = new Date();
    const at = (status: string, ms: number) => twilioStatusToEvents(callId, { CallSid: body.CallSid, CallStatus: status }, new Date(now.getTime() + ms).toISOString());
    const r = await store.appendCallEvents([...at('in-progress', -1), ...at('completed', 0)]);
    if (r.inserted) {
      await store.recomputeCall(callId);
      (await import('../services/voice/postcall/directCompletionRuntime')).completeDirectCall(callId);
    }
  } catch (e) {
    console.warn(JSON.stringify({ level: 'error', service: 'voice-studio', event: 'voice_inbound_close_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', call_id: callId }));
  }
}

const twiml = (res: Response, body: string): void => { res.status(200).type('text/xml').send(body); };

export function makeTransferHandlers(d: TransferDeps) {
  async function fallback(res: Response, callId: string, why: string): Promise<void> {
    try { await d.recordFallback(callId); } catch (e) {
      d.log({ level: 'error', event: 'voice_transfer_fallback_record_failed', outcome: 'failure', error_class: (e as Error).name || 'DatabaseError', call_id: callId });
    }
    d.log({ level: 'warn', event: 'voice_transfer_fallback', outcome: 'partial', error_class: 'TransferUnavailable', call_id: callId, reason: why });
    twiml(res, FALLBACK_TWIML);
  }

  async function connectAction(req: Request, res: Response): Promise<void> {
    const v = verifyToken(req.query.ref, 'status', d.now());
    if (!v.ok) { d.log({ level: 'warn', event: 'voice_transfer_ref_invalid', outcome: 'failure', error_class: 'CorrelationTokenInvalid' }); return twiml(res, END_TWIML); }
    const callId = v.claims.callId;
    const decision = decideConnectAction((req.body as Record<string, unknown>)?.HandoffData, d.target(), new Date(d.now()));
    if (decision === 'end') { await d.closeInbound(callId, (req.body ?? {}) as Record<string, unknown>); return twiml(res, END_TWIML); }
    const base = d.publicBaseUrl();
    if (decision === 'fallback' || !base) await d.closeInbound(callId, (req.body ?? {}) as Record<string, unknown>);
    if (decision === 'fallback' || !base) return fallback(res, callId, decision === 'fallback' ? 'no_teammate_available' : 'config_missing');
    const refused = await d.refuseDial(callId, d.target() as string);
    if (refused) { await d.closeInbound(callId, (req.body ?? {}) as Record<string, unknown>); return fallback(res, callId, refused); }
    const dialAction = `${new URL(DIAL_ACTION_PATH, base).toString()}?ref=${encodeURIComponent(mintToken(callId, 'status', ACTION_TOKEN_TTL_SECONDS, d.now()))}`;
    d.log({ level: 'info', event: 'voice_transfer_dialing', outcome: 'success', call_id: callId });
    twiml(res, dialTwiml(d.target() as string, dialAction));
  }

  async function dialAction(req: Request, res: Response): Promise<void> {
    const v = verifyToken(req.query.ref, 'status', d.now());
    if (!v.ok) { d.log({ level: 'warn', event: 'voice_transfer_ref_invalid', outcome: 'failure', error_class: 'CorrelationTokenInvalid' }); return twiml(res, END_TWIML); }
    const status = (req.body as Record<string, unknown>)?.DialCallStatus;
    await d.closeInbound(v.claims.callId, (req.body ?? {}) as Record<string, unknown>);
    if (decideDialAction(status) === 'end') {
      d.log({ level: 'info', event: 'voice_transfer_connected', outcome: 'success', call_id: v.claims.callId });
      return twiml(res, END_TWIML);
    }
    return fallback(res, v.claims.callId, `dial_${typeof status === 'string' ? status.replace(/[^a-z-]/g, '').slice(0, 20) : 'unknown'}`);
  }

  return { connectAction, dialAction };
}
