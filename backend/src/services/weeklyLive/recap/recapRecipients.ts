import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { isSuppressedForChannel, SuppressionEvent } from '../../channelSuppression';
import { SUPPRESSED_LEAD_STATUSES } from '../../explorerGrowth/explorerContactabilityService';

/**
 * Who gets the recap (WL1.1, assumption A1): every person who checked in to the class through the QR
 * page, i.e. every session_guests row for the session, once per email, minus test check-ins, people
 * who opted out of recaps, and anyone whose email belongs to a lead suppressed for email.
 */
export interface GuestRow { id: string; name: string; email: string; email_lower: string }
export interface Recipient { guestId: string; name: string; email: string; emailLower: string }
export interface Skipped { emailLower: string; guestId: string; reason: 'test_guest' | 'opted_out' | 'lead_suppressed' | 'invalid_email' }
export interface RecipientPlan { recipients: Recipient[]; skipped: Skipped[] }

const TEST_DOMAINS = /@(example\.(com|org|net)|test\.com|mailinator\.com)$/i;
const TEST_NAME = /^(test|qa|probe)\b/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isTestGuest(g: Pick<GuestRow, 'name' | 'email_lower'>): boolean {
  return TEST_DOMAINS.test(g.email_lower) || /\+test/i.test(g.email_lower) || TEST_NAME.test(g.name.trim());
}

/**
 * Pure. `optedOut` and `leadSuppressed` are sets of lower-case emails. Deduplicates on email_lower
 * (the table is already unique per session; this guards a caller passing rows from elsewhere).
 */
export function planRecipients(guests: GuestRow[], optedOut: Set<string>, leadSuppressed: Set<string>): RecipientPlan {
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  const skipped: Skipped[] = [];
  for (const g of guests) {
    const em = String(g.email_lower || g.email || '').trim().toLowerCase();
    if (!em || seen.has(em)) continue;
    seen.add(em);
    const base = { emailLower: em, guestId: g.id };
    if (!EMAIL.test(em)) { skipped.push({ ...base, reason: 'invalid_email' }); continue; }
    if (isTestGuest({ name: g.name || '', email_lower: em })) { skipped.push({ ...base, reason: 'test_guest' }); continue; }
    if (optedOut.has(em)) { skipped.push({ ...base, reason: 'opted_out' }); continue; }
    if (leadSuppressed.has(em)) { skipped.push({ ...base, reason: 'lead_suppressed' }); continue; }
    recipients.push({ guestId: g.id, name: g.name, email: g.email, emailLower: em });
  }
  return { recipients, skipped };
}

/** Lead-side suppression for a set of emails: a suppressed status, or unsubscribe events blocking email. */
export async function loadLeadSuppressed(emails: string[]): Promise<Set<string>> {
  if (!emails.length) return new Set();
  const rows = await sequelize.query<{ email: string; status: string | null; channel: string | null; created_at: Date | null }>(
    `SELECT LOWER(l.email) AS email, l.status, u.channel, u.created_at
       FROM leads l LEFT JOIN unsubscribe_events u ON u.lead_id = l.id
      WHERE LOWER(l.email) IN (:emails)`,
    { replacements: { emails }, type: QueryTypes.SELECT },
  );
  const byEmail = new Map<string, { status: string | null; events: SuppressionEvent[] }>();
  for (const r of rows) {
    const e = byEmail.get(r.email) || { status: r.status, events: [] };
    if (r.channel !== null && r.created_at) e.events.push({ channel: r.channel, created_at: r.created_at });
    if (r.status && SUPPRESSED_LEAD_STATUSES.includes(r.status)) e.status = r.status;
    byEmail.set(r.email, e);
  }
  const out = new Set<string>();
  for (const [email, e] of byEmail) {
    if ((e.status && SUPPRESSED_LEAD_STATUSES.includes(e.status)) || isSuppressedForChannel(e.events, 'email').suppressed) out.add(email);
  }
  return out;
}

export async function loadRecipientPlan(sessionId: string): Promise<RecipientPlan> {
  const guests = await sequelize.query<GuestRow>(
    'SELECT id, name, email, email_lower FROM session_guests WHERE session_id = :sid ORDER BY created_at',
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  const emails = [...new Set(guests.map((g) => String(g.email_lower || '').toLowerCase()).filter(Boolean))];
  const opt = emails.length
    ? await sequelize.query<{ email_lower: string }>('SELECT email_lower FROM weekly_live_recap_optouts WHERE email_lower IN (:emails)', { replacements: { emails }, type: QueryTypes.SELECT })
    : [];
  return planRecipients(guests, new Set(opt.map((o) => o.email_lower)), await loadLeadSuppressed(emails));
}
