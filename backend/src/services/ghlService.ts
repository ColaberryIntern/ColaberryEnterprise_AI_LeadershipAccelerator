import { getSetting, getTestOverrides } from './settingsService';
import { resolveGhlAccountForSource } from './leads/ghlAccountRouting';
import { logActivity } from './activityService';
import Lead from '../models/Lead';
import { redactForLogs } from '../utils/piiRedaction';
import { classifyError } from '../utils/errorClassifier';

// Lazy import (matches alertDeliveryService.ts's convention): avoids pulling
// the full Sequelize/model graph into every ghlService import.
async function emitFailureEvent(params: Parameters<typeof import('./aiEventService').emitAiEvent>[0]): Promise<void> {
  try {
    const { emitAiEvent } = await import('./aiEventService');
    await emitAiEvent(params);
  } catch (err: any) {
    console.error(JSON.stringify({
      level: 'error', service: 'backend', event: 'emit_failure_event_failed',
      outcome: 'failure', error_class: err?.constructor?.name ?? 'Error',
      context: { event_type: params.event_type, message: err?.message },
    }));
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface GHLContact {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  tags?: string[];
  customFields?: Array<{ id: string; value: any }>;
}

interface GHLResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface SyncResult {
  contactId: string | null;
  isTestMode: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Core API helper                                                    */
/* ------------------------------------------------------------------ */

const GHL_BASE = 'https://rest.gohighlevel.com/v1';

async function ghlFetch(
  path: string,
  method: string,
  body?: any,
  /**
   * Per-call credential, used when a lead routes to a non-default sub-account.
   * Omitted by every pre-existing caller, which keeps them on the global key.
   * See leads/ghlAccountRouting.ts.
   */
  apiKeyOverride?: string
): Promise<GHLResult> {
  const apiKey = apiKeyOverride || (await getSetting('ghl_api_key'));
  if (!apiKey) {
    return { success: false, error: 'GHL API key not configured' };
  }

  try {
    const response = await fetch(`${GHL_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error(`[GHL] API error ${response.status}:`, data);
      emitFailureEvent({
        event_type: 'ghl_request_failed',
        outcome: 'failure',
        external_system: 'ghl',
        error_class: classifyError({ status: response.status, message: data?.message }),
        metadata: { path, method, message: String(data?.message || JSON.stringify(data)).slice(0, 200) },
      });
      return { success: false, error: data?.message || JSON.stringify(data) };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[GHL] Request failed:', error.message);
    emitFailureEvent({
      event_type: 'ghl_request_failed',
      outcome: 'failure',
      external_system: 'ghl',
      error_class: classifyError(error),
      metadata: { path, method, message: String(error?.message || '').slice(0, 200) },
    });
    return { success: false, error: error.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Contact search                                                     */
/* ------------------------------------------------------------------ */

export async function findContactByEmail(email: string, apiKey?: string): Promise<GHLContact | null> {
  const result = await ghlFetch(
    `/contacts/?query=${encodeURIComponent(email)}&limit=1`,
    'GET',
    undefined,
    apiKey
  );

  if (!result.success || !result.data?.contacts?.length) return null;

  const contact = result.data.contacts[0] as GHLContact;

  // GHL V1 query does fuzzy matching — verify exact email match
  if (contact.email?.toLowerCase() !== email.toLowerCase()) {
    console.warn(
      `[GHL] Fuzzy match rejected: searched "${email}", got "${contact.email}" (contact ${contact.id})`
    );
    return null;
  }

  return contact;
}

export async function findContactByPhone(phone: string, apiKey?: string): Promise<GHLContact | null> {
  if (!phone) return null;
  // Normalize to digits only for search
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;

  const result = await ghlFetch(
    `/contacts/?query=${encodeURIComponent(phone)}&limit=1`,
    'GET',
    undefined,
    apiKey
  );

  if (!result.success || !result.data?.contacts?.length) return null;

  const contact = result.data.contacts[0] as GHLContact;

  // Verify phone match (normalize both sides to digits)
  const contactDigits = (contact.phone || '').replace(/\D/g, '');
  if (!contactDigits || !contactDigits.endsWith(digits.slice(-10))) {
    console.warn(
      `[GHL] Phone fuzzy match rejected: searched "${phone}", got "${contact.phone}" (contact ${contact.id})`
    );
    return null;
  }

  return contact;
}

/* ------------------------------------------------------------------ */
/*  Contact create                                                     */
/* ------------------------------------------------------------------ */

export async function createContact(
  lead: { name: string; email: string; phone?: string; company?: string; title?: string },
  interestGroup?: string,
  apiKey?: string
): Promise<{ success: boolean; contactId?: string; error?: string }> {
  const nameParts = (lead.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const payload: any = {
    email: lead.email,
    phone: lead.phone || undefined,
  };
  // Only include name/company if provided — avoids overwriting existing GHL contact data in test mode
  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;
  if (lead.company) payload.companyName = lead.company;
  if (interestGroup) {
    payload.tags = [interestGroup];
    payload.customField = { interestgroup: interestGroup };
  }

  const result = await ghlFetch('/contacts/', 'POST', payload, apiKey);

  if (!result.success) return { success: false, error: result.error };
  return { success: true, contactId: result.data?.contact?.id };
}

/* ------------------------------------------------------------------ */
/*  Contact update                                                     */
/* ------------------------------------------------------------------ */

export async function updateContact(
  contactId: string,
  fields: Record<string, any>,
  apiKey?: string
): Promise<GHLResult> {
  return ghlFetch(`/contacts/${contactId}`, 'PUT', fields, apiKey);
}

/* ------------------------------------------------------------------ */
/*  Tags                                                               */
/* ------------------------------------------------------------------ */

export async function addContactTag(contactId: string, tag: string, apiKey?: string): Promise<void> {
  const result = await ghlFetch(`/contacts/${contactId}/tags`, 'POST', {
    tags: [tag],
  }, apiKey);
  if (!result.success) {
    console.warn(`[GHL] Failed to add tag "${tag}" to ${contactId}: ${result.error}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Notes                                                              */
/* ------------------------------------------------------------------ */

export async function addContactNote(contactId: string, note: string, apiKey?: string): Promise<void> {
  const result = await ghlFetch(`/contacts/${contactId}/notes/`, 'POST', {
    body: note,
  }, apiKey);
  if (!result.success) {
    console.warn(`[GHL] Failed to add note to ${contactId}: ${result.error}`);
  }
}

/* ------------------------------------------------------------------ */
/*  SMS via custom field (triggers GHL workflow)                        */
/* ------------------------------------------------------------------ */

export async function sendSmsViaGhl(
  contactId: string,
  message: string
): Promise<GHLResult> {
  console.log(`[GHL] Updating cory_sms_composed for contact ${contactId} (${message.length} chars)`);

  const result = await updateContact(contactId, {
    customField: { cory_sms_composed: message },
  });

  if (result.success) {
    console.log(`[GHL] SMS composed field updated for contact ${contactId} — triggers GHL workflow`);
  } else {
    console.error(`[GHL] Failed to update cory_sms_composed for contact ${contactId}: ${result.error}`);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Orchestrator: sync lead to GHL                                     */
/* ------------------------------------------------------------------ */

export async function syncLeadToGhl(
  lead: InstanceType<typeof Lead>,
  interestGroup?: string,
  force = false,
  bypassEnabledCheck = false
): Promise<SyncResult> {
  const enabled = await getSetting('ghl_enabled');
  if (!enabled && !bypassEnabledCheck) return { contactId: null, isTestMode: false };

  // Which sub-account this lead belongs in. A source routed to an account that
  // has no key on file yet is withheld rather than falling back to the default,
  // because the default is Agent Cory AI and writing there would put the lead in
  // the wrong CRM in front of an outbound dialer. See leads/ghlAccountRouting.ts.
  const route = await resolveGhlAccountForSource(lead.source);
  if (route.status !== 'ready') {
    const reason =
      route.status === 'unconfigured'
        ? `routed to "${route.accountKey}" but ${route.settingKey} is not set`
        : 'no GHL API key configured';
    console.warn(`[GHL] Lead ${lead.id} not synced: ${reason}`);
    await logActivity({
      lead_id: lead.id,
      type: 'system',
      subject: 'GHL Sync Withheld',
      metadata: {
        action: 'ghl_sync',
        status: 'withheld',
        reason: route.status,
        account: route.status === 'unconfigured' ? route.accountKey : null,
        source: lead.source || null,
      },
    }).catch(() => {});
    return { contactId: null, isTestMode: false, error: reason };
  }
  const apiKey = route.account.apiKey;

  const testOverrides = await getTestOverrides();
  const isTestMode = !!(testOverrides.enabled);
  const effectiveEmail = isTestMode && testOverrides.email
    ? testOverrides.email
    : lead.email;
  const notePrefix = isTestMode ? '[TEST MODE] ' : '';

  try {
    // Force resync: clear old contact ID first
    if (force && lead.ghl_contact_id) {
      await lead.update({ ghl_contact_id: null });
    }

    // If lead already has a real GHL contact, update interest group if provided
    if (lead.ghl_contact_id && !isTestMode && !force) {
      if (interestGroup) {
        await addContactTag(lead.ghl_contact_id, interestGroup, apiKey);
        await updateContact(lead.ghl_contact_id, {
          customField: { interestgroup: interestGroup },
        }, apiKey);
        await logActivity({
          lead_id: lead.id,
          type: 'system',
          subject: 'GHL Interest Group Updated',
          metadata: { action: 'ghl_sync', status: 'updated', ghl_contact_id: lead.ghl_contact_id, interest_group: interestGroup, email: effectiveEmail },
        });
        console.log(`[GHL] Lead ${lead.id} interest group updated to "${interestGroup}" on contact ${lead.ghl_contact_id}`);
      } else {
        await logActivity({
          lead_id: lead.id,
          type: 'system',
          subject: 'GHL Contact Already Linked',
          metadata: { action: 'ghl_sync', status: 'existing', ghl_contact_id: lead.ghl_contact_id, email: effectiveEmail },
        });
      }
      return { contactId: lead.ghl_contact_id, isTestMode };
    }

    // Search by email, then fallback to phone
    let contactId: string | null = null;
    let isNewContact = false;
    const existing = await findContactByEmail(effectiveEmail, apiKey);
    if (existing) {
      contactId = existing.id;
      if (interestGroup) {
        await addContactTag(contactId, interestGroup, apiKey);
        await updateContact(contactId, { customField: { interestgroup: interestGroup } }, apiKey);
      }
    }

    // Phone-based dedup fallback — prevent duplicates when email differs but phone matches
    if (!contactId && lead.phone) {
      const phoneMatch = await findContactByPhone(lead.phone, apiKey);
      if (phoneMatch) {
        contactId = phoneMatch.id;
        console.log(`[GHL] Found existing contact by phone ${redactForLogs(lead.phone)}: ${contactId} (email: ${redactForLogs(phoneMatch.email ?? '')})`);
        if (interestGroup) {
          await addContactTag(contactId, interestGroup, apiKey);
          await updateContact(contactId, { customField: { interestgroup: interestGroup } }, apiKey);
        }
      }
    }

    // Create new contact if not found by email or phone
    if (!contactId) {
      const createResult = await createContact(
        {
          name: isTestMode ? '' : lead.name,
          email: effectiveEmail,
          phone: isTestMode && testOverrides.phone ? testOverrides.phone : lead.phone,
          company: isTestMode ? '' : (lead.company || ''),
          title: isTestMode ? '' : (lead.title || ''),
        },
        interestGroup,
        apiKey
      );

      if (!createResult.success) {
        console.error(`[GHL] Failed to create contact for lead ${lead.id}: ${createResult.error}`);
        await logActivity({
          lead_id: lead.id,
          type: 'system',
          subject: 'GHL Sync Failed',
          metadata: { action: 'ghl_sync', status: 'failed', error: createResult.error, interest_group: interestGroup },
        });
        return { contactId: null, isTestMode, error: createResult.error };
      }

      contactId = createResult.contactId || null;
      isNewContact = !!contactId;
    }

    if (contactId) {
      // Only add note for newly created contacts — don't cross-contaminate existing ones
      if (isNewContact) {
        await addContactNote(
          contactId,
          `${notePrefix}📋 Lead Synced from Colaberry Accelerator\n` +
          `👤 ${lead.name} | ${lead.company || 'N/A'}\n` +
          `📧 ${effectiveEmail}\n` +
          `🏷️ Interest Group: ${interestGroup || 'N/A'}\n` +
          `📊 Lead Score: ${lead.lead_score || 0} | Stage: ${lead.pipeline_stage || 'new_lead'}`,
          apiKey
        );
      }

      await logActivity({
        lead_id: lead.id,
        type: 'system',
        subject: isNewContact
          ? (isTestMode ? 'GHL Test Sync' : 'GHL Contact Created')
          : 'GHL Linked to Existing Contact',
        metadata: {
          action: 'ghl_sync',
          status: 'success',
          ghl_contact_id: contactId,
          interest_group: interestGroup,
          email: effectiveEmail,
          test_mode: isTestMode,
          is_new_contact: isNewContact,
        },
      });

      console.log(`[GHL] Lead ${lead.id} ${isNewContact ? 'created' : 'linked'} as contact ${contactId} (group: ${interestGroup || 'none'}${isTestMode ? ', TEST MODE' : ''})`);
    }

    return { contactId, isTestMode };
  } catch (error: any) {
    console.error(`[GHL] syncLeadToGhl failed for lead ${lead.id}:`, error.message);
    await logActivity({
      lead_id: lead.id,
      type: 'system',
      subject: 'GHL Sync Failed',
      metadata: { action: 'ghl_sync', status: 'failed', error: error.message },
    }).catch(() => {}); // don't let logging failure mask the real error
    return { contactId: null, isTestMode, error: error.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Bulk sync: all leads in a campaign                                 */
/* ------------------------------------------------------------------ */

export async function bulkSyncCampaignLeads(
  campaignId: string,
  interestGroup: string,
  leads: InstanceType<typeof Lead>[],
  force = false
): Promise<{ synced: number; failed: number; results: Array<{ leadId: number; contactId: string | null; error?: string }> }> {
  const results: Array<{ leadId: number; contactId: string | null; error?: string }> = [];
  let synced = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      const syncResult = await syncLeadToGhl(lead, interestGroup, force);
      // Only persist ghl_contact_id when NOT in test mode
      if (syncResult.contactId && !syncResult.isTestMode && !lead.ghl_contact_id) {
        await lead.update({ ghl_contact_id: syncResult.contactId });
      }
      results.push({ leadId: lead.id, contactId: syncResult.contactId, error: syncResult.error });
      if (syncResult.contactId) synced++;
      else failed++;
    } catch (error: any) {
      results.push({ leadId: lead.id, contactId: null, error: error.message });
      failed++;
    }
  }

  console.log(`[GHL] Bulk sync for campaign ${campaignId}: ${synced} synced, ${failed} failed`);
  return { synced, failed, results };
}

/* ------------------------------------------------------------------ */
/*  Fire-and-forget: sync newly created lead to GHL                    */
/* ------------------------------------------------------------------ */

export async function syncNewLeadToGhl(lead: InstanceType<typeof Lead>): Promise<void> {
  try {
    const enabled = await getSetting('ghl_enabled');
    if (!enabled) return;

    const result = await syncLeadToGhl(lead);
    if (result.contactId && !result.isTestMode && !lead.ghl_contact_id) {
      await lead.update({ ghl_contact_id: result.contactId });
    }
  } catch (err: any) {
    console.error(`[GHL] syncNewLeadToGhl failed for lead ${lead.id}: ${err.message}`);
  }
}
