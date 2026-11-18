/**
 * ghlMirrorService - OH1l (T6): mirror Maya's conversations onto the GHL contact.
 *
 * One note on the person's GHL contact per event: an email sent, a reply received, a call
 * finished. The admissions team works in GHL, so without this they cannot see what Maya
 * already said or heard.
 *
 * SWITCH: setting `ghl_mirror_enabled`, DEFAULT false (settingsService DEFAULTS). While it is
 * false NOTHING here touches GHL: no contact lookup, no sync, no note. An unreadable setting
 * is treated as false (fail closed).
 *
 * NEVER IN THE WAY: every entry point swallows its own errors. A GHL outage, a missing
 * contact or a slow API must never fail or delay the send, reply or webhook that triggered
 * the note. Callers use mirrorToGhlInBackground, which does not await.
 *
 * The note body is plain text, trimmed to 500 characters.
 */
import type { Lead } from '../models';

export type GhlMirrorEvent = 'email_sent' | 'reply_received' | 'call_finished';

export const GHL_MIRROR_SETTING = 'ghl_mirror_enabled';
export const MAX_NOTE_BODY_CHARS = 500;

type LeadLike = InstanceType<typeof Lead> | { id: number; ghl_contact_id?: string | null; [k: string]: any };

export interface GhlMirrorDeps {
  getSetting: (key: string) => Promise<any>;
  findLead: (leadId: number) => Promise<LeadLike | null>;
  syncLeadToGhl: (lead: any, interestGroup?: string, force?: boolean, bypassEnabledCheck?: boolean) => Promise<{ contactId: string | null }>;
  addContactNote: (contactId: string, note: string, apiKey?: string) => Promise<void>;
  /**
   * The API key of the GHL account this lead routes to (the same routing syncLeadToGhl
   * uses), or null when the destination is unconfigured/unknown: then no note is written,
   * rather than landing in the default account where the contact does not exist.
   */
  resolveApiKey: (lead: LeadLike) => Promise<string | null>;
}

const defaultDeps: GhlMirrorDeps = {
  async getSetting(key) {
    const { getSetting } = await import('./settingsService');
    return getSetting(key);
  },
  async findLead(leadId) {
    const { Lead } = await import('../models');
    return Lead.findByPk(leadId);
  },
  async syncLeadToGhl(lead, interestGroup, force, bypass) {
    const { syncLeadToGhl } = await import('./ghlService');
    return syncLeadToGhl(lead, interestGroup, force, bypass);
  },
  async addContactNote(contactId, note, apiKey) {
    const { addContactNote } = await import('./ghlService');
    return addContactNote(contactId, note, apiKey);
  },
  async resolveApiKey(lead) {
    const { resolveGhlAccountForSource } = await import('./leads/ghlAccountRouting');
    const route = await resolveGhlAccountForSource((lead as any)?.source);
    return route.status === 'ready' ? route.account.apiKey : null;
  },
};

/**
 * The lead's GHL contact id: the one on file, otherwise find-or-create it by syncing the
 * lead (bypassing the ghl_enabled check, as the SMS and post-call paths already do).
 * Returns null instead of throwing when GHL cannot resolve one.
 */
export async function resolveGhlContactId(
  lead: LeadLike,
  interestGroup?: string,
  deps: Pick<GhlMirrorDeps, 'syncLeadToGhl'> = defaultDeps,
): Promise<string | null> {
  const onFile = (lead as any)?.ghl_contact_id;
  if (onFile) return String(onFile);
  try {
    const result = await deps.syncLeadToGhl(lead, interestGroup, false, true);
    return result?.contactId || null;
  } catch (err: any) {
    console.warn(`[GHL] Contact sync failed for lead ${(lead as any)?.id}: ${err?.message}`);
    return null;
  }
}

const EVENT_LABEL: Record<GhlMirrorEvent, string> = {
  email_sent: 'Maya email sent',
  reply_received: 'Email reply received',
  call_finished: 'Maya call finished',
};

/** Plain text from an HTML or text body, whitespace collapsed. */
function toPlainText(body: string): string {
  return body
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** The note text: a label line, then the subject and body, body trimmed to 500 characters. */
export function formatMirrorNote(event: GhlMirrorEvent, subject?: string | null, body?: string | null): string {
  const lines = [EVENT_LABEL[event]];
  const s = (subject || '').trim();
  if (s) lines.push(`Subject: ${s.slice(0, 200)}`);
  const text = toPlainText(body || '');
  if (text) {
    lines.push(text.length > MAX_NOTE_BODY_CHARS ? `${text.slice(0, MAX_NOTE_BODY_CHARS - 3)}...` : text);
  }
  return lines.join('\n');
}

export interface GhlMirrorInput {
  event: GhlMirrorEvent;
  /** The lead, or its id (loaded only when the mirror is on). */
  lead?: LeadLike | null;
  leadId?: number | null;
  subject?: string | null;
  body?: string | null;
}

export type GhlMirrorResult =
  | { mirrored: true; contactId: string }
  | { mirrored: false; reason: 'disabled' | 'no_lead' | 'no_account' | 'no_contact' | 'error' };

async function mirrorEnabled(deps: GhlMirrorDeps): Promise<boolean> {
  try {
    const v = await deps.getSetting(GHL_MIRROR_SETTING);
    return v === true || v === 'true';
  } catch {
    return false; // fail closed
  }
}

/** Write one note for one event. Never throws. */
export async function mirrorToGhl(input: GhlMirrorInput, deps: GhlMirrorDeps = defaultDeps): Promise<GhlMirrorResult> {
  try {
    if (!(await mirrorEnabled(deps))) return { mirrored: false, reason: 'disabled' };
    const lead = input.lead || (input.leadId ? await deps.findLead(input.leadId) : null);
    if (!lead) return { mirrored: false, reason: 'no_lead' };
    const apiKey = await deps.resolveApiKey(lead);
    if (!apiKey) return { mirrored: false, reason: 'no_account' };
    // No interest group: a mirror note must not retag the contact or set its interestgroup
    // field, which GHL workflows key on.
    const contactId = await resolveGhlContactId(lead, undefined, deps);
    if (!contactId) return { mirrored: false, reason: 'no_contact' };
    await deps.addContactNote(contactId, formatMirrorNote(input.event, input.subject, input.body), apiKey);
    return { mirrored: true, contactId };
  } catch (err: any) {
    console.warn(`[GHL Mirror] ${input.event} note failed for lead ${input.leadId ?? (input.lead as any)?.id}: ${err?.message}`);
    return { mirrored: false, reason: 'error' };
  }
}

/** Fire-and-forget: start the note and return at once. The caller never waits or fails. */
export function mirrorToGhlInBackground(input: GhlMirrorInput, deps: GhlMirrorDeps = defaultDeps): void {
  void mirrorToGhl(input, deps).catch(() => { /* mirrorToGhl never throws; belt and braces */ });
}
