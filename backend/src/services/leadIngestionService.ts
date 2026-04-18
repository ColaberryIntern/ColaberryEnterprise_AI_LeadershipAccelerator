import { LeadSource, EntryPoint, FormDefinition, RawLeadPayload, Lead } from '../models';
import { createLead } from './leadService';
import { logActivity } from './activityService';
import { verifyHmacSignature } from '../utils/hmac';
import { normalizeWithFieldMap, validateNormalized, NormalizedLead } from '../utils/normalizeFields';

export interface IngestRequest {
  sourceSlug?: string;
  entrySlug?: string;
  rawBody: Record<string, any>;
  rawBodyText: string;
  headers: Record<string, any>;
  remoteIp?: string;
  signature?: string;
  sessionId?: string;
}

export interface IngestResult {
  success: boolean;
  status: 'accepted' | 'rejected' | 'error';
  httpStatus: number;
  rawPayloadId: string;
  leadId?: number;
  isNewLead?: boolean;
  normalized?: NormalizedLead;
  error?: string;
  missingFields?: string[];
}

/**
 * Resolve an HMAC secret reference. `lead_sources.hmac_secret` may either
 * contain the literal secret or the name of an env var that holds it.
 * If the value looks like an env var name (uppercase, underscores, no spaces)
 * and `process.env[value]` is set, return the env value. Otherwise return
 * the stored value verbatim.
 */
function resolveSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (/^[A-Z0-9_]{3,}$/.test(stored) && typeof process.env[stored] === 'string') {
    return process.env[stored] as string;
  }
  return stored;
}

export async function handleIngest(req: IngestRequest): Promise<IngestResult> {
  // 1. Always persist the raw payload first so we never lose data.
  const raw = await RawLeadPayload.create({
    source_slug: req.sourceSlug || null,
    entry_slug: req.entrySlug || null,
    headers: req.headers,
    body: req.rawBody,
    remote_ip: req.remoteIp || null,
    status: 'pending',
  } as any);

  const reject = async (httpStatus: number, error: string, extra?: Partial<IngestResult>): Promise<IngestResult> => {
    await raw.update({ status: 'rejected', error_message: error } as any);
    return {
      success: false,
      status: 'rejected',
      httpStatus,
      rawPayloadId: raw.id,
      error,
      ...extra,
    };
  };

  try {
    // 2. Resolve source + entry point.
    if (!req.sourceSlug || !req.entrySlug) {
      return await reject(400, 'Missing source or entry slug (use ?source=<slug>&entry=<slug>)');
    }

    const source = await LeadSource.findOne({ where: { slug: req.sourceSlug, is_active: true } });
    if (!source) return await reject(400, `Unknown or inactive source: ${req.sourceSlug}`);

    const entry = await EntryPoint.findOne({ where: { source_id: source.id, slug: req.entrySlug, is_active: true } });
    if (!entry) return await reject(400, `Unknown or inactive entry point: ${req.entrySlug}`);

    // 3. Verify HMAC if the source requires one.
    const secret = resolveSecret(source.hmac_secret);
    const prev = resolveSecret(source.hmac_secret_prev);
    if (secret) {
      if (!verifyHmacSignature(req.rawBodyText, req.signature, secret, prev)) {
        return await reject(403, 'Invalid signature');
      }
    }

    // 4. Load active form definition (most recent active version wins).
    const formDef = await FormDefinition.findOne({
      where: { entry_point_id: entry.id, is_active: true },
      order: [['version', 'DESC']],
    });

    const fieldMap = (formDef?.field_map as Record<string, string>) || {};
    const requiredFields = (formDef?.required_fields as string[]) || ['email'];

    // 5. Normalize.
    const normalized = normalizeWithFieldMap(req.rawBody, fieldMap);
    // Default source/form_type reflect the registry unless overridden by body.
    if (!req.rawBody?.source) normalized.source = source.slug;
    if (!req.rawBody?.form_type) normalized.form_type = entry.slug;

    // 6. Validate.
    const validation = validateNormalized(normalized, requiredFields);
    if (!validation.ok) {
      return await reject(400, `Missing required field(s): ${validation.missing.join(', ')}`, {
        missingFields: validation.missing,
        normalized,
      });
    }
    // Fallback safety: require at least email OR phone (leadService.createLead requires a valid email).
    if (!normalized.email) {
      return await reject(400, 'email is required (phone-only ingest not yet supported)', { normalized });
    }

    // 7. Upsert lead via existing service.
    const { lead, isDuplicate } = await createLead({
      name: normalized.name,
      email: normalized.email,
      company: normalized.company,
      role: normalized.role,
      phone: normalized.phone,
      title: normalized.title,
      company_size: normalized.company_size,
      evaluating_90_days: normalized.evaluating_90_days,
      interest_area: normalized.interest_area,
      message: normalized.message,
      source: normalized.source,
      form_type: normalized.form_type,
      consent_contact: normalized.consent_contact,
      utm_source: normalized.utm_source,
      utm_campaign: normalized.utm_campaign,
      page_url: normalized.page_url,
      corporate_sponsorship_interest: normalized.corporate_sponsorship_interest,
      timeline: '',
    } as any);

    // 8. Stamp the new ingest-specific fields on the lead.
    const leadUpdates: Record<string, any> = { source_id: source.id, entry_point_id: entry.id };
    if (normalized.metadata?.visitor_fingerprint && !(lead as any).visitor_id) {
      leadUpdates.visitor_id = null; // resolved below
    }
    await lead.update(leadUpdates as any);

    // 9. Attribution: if visitor fingerprint or session id present, link to visitor.
    const fingerprint: string | undefined = normalized.metadata?.visitor_fingerprint || req.sessionId;
    if (fingerprint) {
      try {
        const { findOrCreateVisitor, resolveIdentity } = require('./visitorTrackingService');
        const visitorId = await findOrCreateVisitor(String(fingerprint), {
          ip_address: req.remoteIp || '',
          user_agent: (req.headers['user-agent'] as string) || '',
        });
        await resolveIdentity(visitorId, lead.id);
        await lead.update({ visitor_id: visitorId } as any);
      } catch (err: any) {
        console.warn(`[LeadIngest] Visitor link failed: ${err?.message}`);
      }
    }

    // 10. Log form_submit activity.
    await logActivity({
      lead_id: lead.id,
      type: 'system',
      subject: `Form submit: ${source.slug}/${entry.slug}`,
      metadata: {
        subtype: 'form_submit',
        source_slug: source.slug,
        entry_slug: entry.slug,
        raw_payload_id: raw.id,
        utm_source: normalized.utm_source || null,
        utm_campaign: normalized.utm_campaign || null,
        referrer: normalized.metadata?.referrer || null,
        is_duplicate: isDuplicate,
      },
    });

    // 11. Evaluate routing rules (async; does not block response).
    //     Dispatched here; engine + action runner arrive in Gate 4.
    let routingActions: Array<{ type: string; status: string }> = [];
    try {
      const { evaluateAndDispatch } = require('./routingEngineService');
      routingActions = await evaluateAndDispatch(lead, {
        source_slug: source.slug,
        entry_slug: entry.slug,
        raw_payload_id: raw.id,
        normalized,
      });
    } catch {
      // Routing engine may not be loaded yet (Gate 4). Safe to skip.
    }

    await raw.update({ status: 'accepted', resulting_lead_id: lead.id } as any);

    return {
      success: true,
      status: 'accepted',
      httpStatus: 200,
      rawPayloadId: raw.id,
      leadId: lead.id,
      isNewLead: !isDuplicate,
      normalized,
      ...(routingActions.length > 0 ? { ...({ routingActions } as any) } : {}),
    };
  } catch (error: any) {
    await raw.update({ status: 'error', error_message: error?.message || 'unknown error' } as any);
    console.error('[LeadIngest] Error:', error?.message);
    return {
      success: false,
      status: 'error',
      httpStatus: 500,
      rawPayloadId: raw.id,
      error: error?.message || 'Internal error',
    };
  }
}

export async function getIngestLog(leadId: number) {
  return RawLeadPayload.findAll({ where: { resulting_lead_id: leadId }, order: [['received_at', 'DESC']] });
}

export async function findLead(leadId: number) {
  return Lead.findByPk(leadId);
}
