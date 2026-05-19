import { Request, Response } from 'express';
import { handleIngest } from '../services/leadIngestionService';

export async function handleLeadIngest(req: Request, res: Response): Promise<void> {
  // Outer try/catch catches anything handleIngest itself throws BEFORE
  // entering its own try (arg parsing edge cases, DB connection drops
  // during the initial `raw` create). The service has its own end-to-end
  // try/catch, so this is belt-and-suspenders — but without it an
  // uncaught exception leaks the stack to the webhook sender and the
  // request crashes the Express handler. Reliability hardening 2026-05-19.
  try {
    const sourceSlug = (req.query.source as string) || (req.body?._source as string) || '';
    const entrySlug = (req.query.entry as string) || (req.body?._entry as string) || '';
    const signature = (req.headers['x-webhook-signature'] as string) || '';
    const sessionId = (req.headers['x-session-id'] as string) || '';

    const rawBody = typeof req.body === 'object' && req.body !== null ? req.body : {};
    // Use the canonical JSON representation of the parsed body as the payload
    // for HMAC verification. Senders must HMAC the same JSON they POST.
    const rawBodyText = JSON.stringify(rawBody);

    const result = await handleIngest({
      sourceSlug,
      entrySlug,
      rawBody,
      rawBodyText,
      headers: req.headers as Record<string, any>,
      remoteIp: req.ip,
      signature,
      sessionId,
    });

    const response: Record<string, any> = {
      success: result.success,
      status: result.status,
      raw_payload_id: result.rawPayloadId,
    };
    if (result.leadId !== undefined) response.lead_id = result.leadId;
    if (result.isNewLead !== undefined) response.is_new_lead = result.isNewLead;
    if (result.normalized !== undefined) response.normalized = result.normalized;
    if (result.missingFields) response.missing_fields = result.missingFields;
    if (result.error) response.error = result.error;
    if ((result as any).routingActions) response.routing_actions = (result as any).routingActions;

    res.status(result.httpStatus).json(response);
  } catch (err: any) {
    // Don't leak internals to webhook senders. Log with a stable error_class
    // string so the ops log surface can group these.
    console.error('[LeadIngest][Controller] uncaught:', {
      error_class: err?.name || 'UnknownError',
      message: err?.message,
      source: req.query.source,
      entry: req.query.entry,
    });
    res.status(500).json({
      success: false,
      status: 'error',
      error: 'Internal error processing webhook',
    });
  }
}
