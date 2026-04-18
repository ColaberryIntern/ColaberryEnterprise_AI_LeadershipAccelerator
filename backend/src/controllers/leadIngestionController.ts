import { Request, Response } from 'express';
import { handleIngest } from '../services/leadIngestionService';

export async function handleLeadIngest(req: Request, res: Response): Promise<void> {
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
}
