/**
 * Twilio webhooks for Voice AI Studio (VS2.1): call status, the outbound answer TwiML, and inbound.
 *
 * Order for every request: (1) feature gate: with VOICE_STUDIO_ENABLED and VOICE_TEST_ENABLED both
 * off (or an invalid config) the routes do not exist (next('router') falls through to the normal
 * 404/401 handling); (2) X-Twilio-Signature against our configured public URL; (3) the body parses
 * against TwilioWebhookBodySchema (400 ValidationError otherwise); (4) AccountSid must be ours;
 * (5) the called number must be one we own: To on inbound, From on outbound (Direction), checked
 * against active voice_numbers rows; (6) our signed correlation ref. Only then is anything written.
 *
 * Privacy: To/From arrive from Twilio (signed). The one we own is read ONLY by ownedNumberOf() for the
 * ownership check; nothing else reads a number field, nothing persists or logs one (a static test
 * enforces that). Events carry the CallSid alias and a state only.
 *
 * Failure modes: missing auth token or public URL -> 403 ConfigMissing (fail closed); bad signature
 * -> 403 TwilioSignatureInvalid; foreign account -> 403 TwilioAccountMismatch; bad/expired ref ->
 * 403 CorrelationTokenInvalid; replayed single-use ref -> 200 hang-up TwiML + ReplayRejected (a 4xx
 * would make Twilio speak an "application error" to the person); unknown call -> 204/hang-up;
 * database failure -> 500 so Twilio redelivers (every write is idempotent).
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { loadVoiceConfig, type VoiceConfig } from '../services/voice/voiceConfig';
import { canonicalWebhookUrl, isValidTwilioSignature, type TwilioParams } from '../services/voice/twilio/twilioSignature';
import { twilioAuthToken } from '../services/voice/twilio/twilioCredentials';
import { verifyToken, type TokenClaims } from '../services/voice/twilio/correlationToken';
import { twilioStatusToEvents } from '../services/voice/twilio/twilioStatusMap';
import { appendCallEvents, consumeToken, isOwnedActiveNumber, recomputeCall, type AppendResult, type ConsumeResult } from '../services/voice/twilio/voiceCallStore';

/** Shape every Twilio voice webhook body must have; other Twilio fields pass through unvalidated. */
export const TwilioWebhookBodySchema = z.object({
  AccountSid: z.string().regex(/^AC[0-9a-f]{32}$/i),
  CallSid: z.string().regex(/^CA[0-9a-f]{32}$/i).optional(),
  Direction: z.string().max(40).optional(),
  To: z.string().max(40).optional(),
  From: z.string().max(40).optional(),
}).passthrough();
export type TwilioWebhookBody = z.infer<typeof TwilioWebhookBodySchema>;

/**
 * The number on OUR side of the call: To for inbound, From for an outbound call we placed. The only
 * place in this module that reads a number field.
 */
export function ownedNumberOf(route: 'status' | 'twiml' | 'inbound', body: TwilioWebhookBody): string | undefined {
  const inbound = route === 'inbound' || body.Direction === 'inbound';
  return inbound ? body.To : body.From;
}

export interface VoiceWebhookDeps {
  config: () => VoiceConfig;
  authToken: () => string | undefined;
  accountSid: () => string | undefined;
  appendCallEvents: (events: ReturnType<typeof twilioStatusToEvents>) => Promise<AppendResult>;
  consumeToken: (claims: TokenClaims) => Promise<ConsumeResult>;
  recomputeCall: (callId: string) => Promise<unknown>;
  /** True only for an E.164 number that is an ACTIVE Twilio row in voice_numbers. */
  ownsNumber: (e164: string) => Promise<boolean>;
  /** Engine TwiML for a connected call. Until an engine is registered (VS2.3/VS2.4) the call ends safely. */
  connectTwiml: (callId: string) => Promise<string>;
  now: () => number;
  log: (line: Record<string, unknown>) => void;
}

export const HANGUP_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
export const INBOUND_FALLBACK_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, this line is not taking calls right now. Goodbye.</Say><Hangup/></Response>';

export function defaultVoiceWebhookDeps(): VoiceWebhookDeps {
  return {
    config: () => loadVoiceConfig(),
    authToken: () => twilioAuthToken(),
    accountSid: () => process.env.TWILIO_ACCOUNT_SID || undefined,
    appendCallEvents, consumeToken, recomputeCall, ownsNumber: isOwnedActiveNumber,
    connectTwiml: async () => HANGUP_TWIML,
    now: () => Date.now(),
    log: (line) => (line.level === 'error' || line.level === 'warn' ? console.warn : console.log)(JSON.stringify({ service: 'voice-studio', ...line })),
  };
}

function deny(res: Response, deps: VoiceWebhookDeps, req: Request, errorClass: string, status = 403): void {
  deps.log({ level: 'warn', event: 'voice_webhook_refused', outcome: 'failure', error_class: errorClass, route: req.path });
  res.status(status).json({ error: 'Forbidden' });
}

function xml(res: Response, body: string): void {
  res.status(200).type('text/xml').send(body);
}

export function makeVoiceWebhookHandlers(deps: VoiceWebhookDeps) {
  /** (1) Feature gate: off means the route does not exist. */
  function gate(req: Request, _res: Response, next: NextFunction): void {
    const c = deps.config();
    if (!c.valid || !(c.VOICE_STUDIO_ENABLED || c.VOICE_TEST_ENABLED)) return next('router');
    next();
  }

  /** (2)-(5) Twilio signature, body shape, account, and the number we own on this call. */
  function verifyTwilio(route: 'status' | 'twiml' | 'inbound') {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const base = deps.config().VOICE_PUBLIC_BASE_URL;
      const token = deps.authToken();
      const account = deps.accountSid();
      if (!base || !token || !account) return deny(res, deps, req, 'ConfigMissing');
      const params = (req.body && typeof req.body === 'object' ? req.body : {}) as TwilioParams;
      const sig = req.get('X-Twilio-Signature');
      if (!isValidTwilioSignature(token, canonicalWebhookUrl(base, req.originalUrl), params, sig)) return deny(res, deps, req, 'TwilioSignatureInvalid');
      const parsed = TwilioWebhookBodySchema.safeParse(params);
      if (!parsed.success) return deny(res, deps, req, 'ValidationError', 400);
      if (parsed.data.AccountSid !== account) return deny(res, deps, req, 'TwilioAccountMismatch');
      const ours = ownedNumberOf(route, parsed.data);
      if (!ours) return deny(res, deps, req, 'ValidationError', 400);
      try {
        if (!(await deps.ownsNumber(ours))) return deny(res, deps, req, 'TwilioNumberMismatch');
      } catch (e) {
        deps.log({ level: 'error', event: 'voice_number_lookup_failed', outcome: 'failure', error_class: (e as { name?: string })?.name || 'DatabaseError', route: req.path });
        res.status(503).json({ error: 'Temporary failure' });
        return;
      }
      next();
    };
  }

  async function status(req: Request, res: Response): Promise<void> {
    const v = verifyToken(req.query.ref, 'status', deps.now());
    if (!v.ok) return deny(res, deps, req, 'CorrelationTokenInvalid');
    const callId = v.claims.callId;
    try {
      const events = twilioStatusToEvents(callId, req.body as Record<string, unknown>, new Date(deps.now()).toISOString());
      if (!events.length) {
        deps.log({ level: 'warn', event: 'voice_status_unrecognized', outcome: 'skipped', error_class: 'UnrecognizedStatus', call_id: callId });
        res.status(204).end();
        return;
      }
      const r = await deps.appendCallEvents(events);
      if (r.unknownCall) {
        deps.log({ level: 'warn', event: 'voice_status_unknown_call', outcome: 'skipped', error_class: 'UnknownCall', call_id: callId });
        res.status(204).end();
        return;
      }
      if (r.inserted) await deps.recomputeCall(callId);
      deps.log({ level: 'info', event: 'voice_status_ingested', outcome: 'success', call_id: callId, state: events[0].state, inserted: r.inserted, duplicates: r.duplicates });
      res.status(204).end();
    } catch (e) {
      deps.log({ level: 'error', event: 'voice_status_ingest_failed', outcome: 'failure', error_class: (e as { name?: string })?.name || 'DatabaseError', call_id: callId });
      res.status(500).json({ error: 'Temporary failure' });
    }
  }

  async function twiml(req: Request, res: Response): Promise<void> {
    const v = verifyToken(req.query.ref, 'twiml', deps.now());
    if (!v.ok) return deny(res, deps, req, 'CorrelationTokenInvalid');
    const callId = v.claims.callId;
    try {
      const used = await deps.consumeToken(v.claims);
      if (used !== 'consumed') {
        deps.log({ level: 'warn', event: 'voice_twiml_refused', outcome: 'failure', error_class: used === 'replay' ? 'ReplayRejected' : 'UnknownCall', call_id: callId });
        return xml(res, HANGUP_TWIML);
      }
      xml(res, await deps.connectTwiml(callId));
    } catch (e) {
      deps.log({ level: 'error', event: 'voice_twiml_failed', outcome: 'failure', error_class: (e as { name?: string })?.name || 'DatabaseError', call_id: callId });
      xml(res, HANGUP_TWIML); // never leave a live call waiting on a broken handler
    }
  }

  /** Inbound routing arrives in VS3.6; until then every inbound call gets the safe fallback. */
  function inbound(_req: Request, res: Response): void {
    deps.log({ level: 'info', event: 'voice_inbound_fallback', outcome: 'skipped' });
    xml(res, INBOUND_FALLBACK_TWIML);
  }

  return { gate, verifyTwilio, status, twiml, inbound };
}
