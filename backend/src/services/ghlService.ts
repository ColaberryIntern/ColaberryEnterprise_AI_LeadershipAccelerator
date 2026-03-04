import { getSetting, getTestOverrides } from './settingsService';
import Lead from '../models/Lead';

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

/* ------------------------------------------------------------------ */
/*  Core API helper                                                    */
/* ------------------------------------------------------------------ */

const GHL_BASE = 'https://rest.gohighlevel.com/v1';

async function ghlFetch(
  path: string,
  method: string,
  body?: any
): Promise<GHLResult> {
  const apiKey = await getSetting('ghl_api_key');
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
    });

    const data: any = await response.json();

    if (!response.ok) {
      console.error(`[GHL] API error ${response.status}:`, data);
      return { success: false, error: data?.message || JSON.stringify(data) };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('[GHL] Request failed:', error.message);
    return { success: false, error: error.message };
  }
}

/* ------------------------------------------------------------------ */
/*  Contact search                                                     */
/* ------------------------------------------------------------------ */

export async function findContactByEmail(email: string): Promise<GHLContact | null> {
  const result = await ghlFetch(
    `/contacts/?query=${encodeURIComponent(email)}&limit=1`,
    'GET'
  );

  if (!result.success || !result.data?.contacts?.length) return null;
  return result.data.contacts[0] as GHLContact;
}

/* ------------------------------------------------------------------ */
/*  Contact create                                                     */
/* ------------------------------------------------------------------ */

export async function createContact(
  lead: { name: string; email: string; phone?: string; company?: string; title?: string },
  interestGroup: string
): Promise<{ success: boolean; contactId?: string; error?: string }> {
  const nameParts = (lead.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const result = await ghlFetch('/contacts/', 'POST', {
    firstName,
    lastName,
    email: lead.email,
    phone: lead.phone || undefined,
    companyName: lead.company || undefined,
    tags: [interestGroup],
    customField: { interest_group: interestGroup },
  });

  if (!result.success) return { success: false, error: result.error };
  return { success: true, contactId: result.data?.contact?.id };
}

/* ------------------------------------------------------------------ */
/*  Contact update                                                     */
/* ------------------------------------------------------------------ */

export async function updateContact(
  contactId: string,
  fields: Record<string, any>
): Promise<GHLResult> {
  return ghlFetch(`/contacts/${contactId}`, 'PUT', fields);
}

/* ------------------------------------------------------------------ */
/*  Tags                                                               */
/* ------------------------------------------------------------------ */

export async function addContactTag(contactId: string, tag: string): Promise<void> {
  const result = await ghlFetch(`/contacts/${contactId}/tags`, 'POST', {
    tags: [tag],
  });
  if (!result.success) {
    console.warn(`[GHL] Failed to add tag "${tag}" to ${contactId}: ${result.error}`);
  }
}

/* ------------------------------------------------------------------ */
/*  Notes                                                              */
/* ------------------------------------------------------------------ */

export async function addContactNote(contactId: string, note: string): Promise<void> {
  const result = await ghlFetch(`/contacts/${contactId}/notes/`, 'POST', {
    body: note,
  });
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
  const result = await updateContact(contactId, {
    customField: { cory_sms_composed: message },
  });

  if (result.success) {
    console.log(`[GHL] SMS composed field updated for contact ${contactId}`);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Orchestrator: sync lead to GHL                                     */
/* ------------------------------------------------------------------ */

export async function syncLeadToGhl(
  lead: InstanceType<typeof Lead>,
  interestGroup: string
): Promise<string | null> {
  const enabled = await getSetting('ghl_enabled');
  if (!enabled) return null;

  // Test mode: use test email instead of real lead email
  const testOverrides = await getTestOverrides();
  const effectiveEmail = testOverrides.enabled && testOverrides.email
    ? testOverrides.email
    : lead.email;
  const notePrefix = testOverrides.enabled ? '[TEST MODE] ' : '';

  try {
    // Check if contact already exists
    let contactId = lead.ghl_contact_id || null;

    if (!contactId) {
      // Search by email
      const existing = await findContactByEmail(effectiveEmail);
      if (existing) {
        contactId = existing.id;
        // Add interest_group tag to existing contact
        await addContactTag(contactId, interestGroup);
      }
    }

    // Create new contact if not found
    if (!contactId) {
      const createResult = await createContact(
        {
          name: lead.name,
          email: effectiveEmail,
          phone: testOverrides.enabled && testOverrides.phone ? testOverrides.phone : lead.phone,
          company: lead.company,
          title: lead.title,
        },
        interestGroup
      );

      if (!createResult.success) {
        console.error(`[GHL] Failed to create contact for lead ${lead.id}: ${createResult.error}`);
        return null;
      }
      contactId = createResult.contactId || null;
    }

    if (contactId) {
      // Add structured note
      await addContactNote(
        contactId,
        `${notePrefix}📋 Lead Synced from Colaberry Accelerator\n` +
        `👤 ${lead.name} | ${lead.company || 'N/A'}\n` +
        `📧 ${effectiveEmail}\n` +
        `🏷️ Interest Group: ${interestGroup}\n` +
        `📊 Lead Score: ${lead.lead_score || 0} | Stage: ${lead.pipeline_stage || 'new_lead'}`
      );

      console.log(`[GHL] Lead ${lead.id} synced as contact ${contactId} (group: ${interestGroup})`);
    }

    return contactId;
  } catch (error: any) {
    console.error(`[GHL] syncLeadToGhl failed for lead ${lead.id}:`, error.message);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Bulk sync: all leads in a campaign                                 */
/* ------------------------------------------------------------------ */

export async function bulkSyncCampaignLeads(
  campaignId: string,
  interestGroup: string,
  leads: InstanceType<typeof Lead>[]
): Promise<{ synced: number; failed: number; results: Array<{ leadId: number; contactId: string | null; error?: string }> }> {
  const results: Array<{ leadId: number; contactId: string | null; error?: string }> = [];
  let synced = 0;
  let failed = 0;

  for (const lead of leads) {
    try {
      const contactId = await syncLeadToGhl(lead, interestGroup);
      if (contactId && !lead.ghl_contact_id) {
        await lead.update({ ghl_contact_id: contactId });
      }
      results.push({ leadId: lead.id, contactId });
      if (contactId) synced++;
      else failed++;
    } catch (error: any) {
      results.push({ leadId: lead.id, contactId: null, error: error.message });
      failed++;
    }
  }

  console.log(`[GHL] Bulk sync for campaign ${campaignId}: ${synced} synced, ${failed} failed`);
  return { synced, failed, results };
}
