/**
 * Mandrill open/click poll — attribution and recording.
 *
 * Extracted from schedulerService.ts (3,600 lines, past the file ceiling) so
 * the one decision that matters here is a pure function with a test: WHICH
 * scheduled email does a polled open or click belong to?
 *
 * ── THE DEFECT THIS REPLACES ────────────────────────────────────────────────
 *
 * The previous poll pinned every open and click to "the most recent sent
 * email to this lead", ignoring the subject Mandrill reports. A lead who
 * opened a login link the day after a campaign email had the open recorded
 * against the campaign. Measured on production on 2026-09-11: of 11,243 poll
 * rows, 4,467 (40%) sit on an email whose subject disagrees with what
 * Mandrill said was opened — 3,325 opens and 1,142 clicks — and every
 * campaign engagement figure downstream (`touchpoint_count`, engagement
 * charts, the 360's Communications tab) inherited the guess.
 *
 * ── THE RULE NOW ────────────────────────────────────────────────────────────
 *
 * Attribute by SUBJECT: the newest `scheduled_emails` row for this lead with
 * `status = 'sent'` whose trimmed, case-folded subject equals the one Mandrill
 * reports. No match means this platform did not send that message (portal
 * access links, class reminders, school-system mail all share the Mandrill
 * account). The open is still a real open by this lead and is recorded — with
 * NO campaign attribution rather than a guess, and `metadata.attribution =
 * 'no_matching_send'` so a reader of the row knows why the FK is empty.
 *
 * Subject is the only join key `messages/search` offers: the response carries
 * no `metadata` (checked against the live API), so the `scheduled_email_id`
 * the sender puts in Mandrill metadata is invisible to the poll. The webhook
 * path, which does receive metadata, is unaffected by this module.
 *
 * ── IDEMPOTENCY ─────────────────────────────────────────────────────────────
 *
 * The poll runs every 30 minutes over the same day's messages, so the same
 * open is offered many times. Dedup key: (lead, outcome, subject, day). The
 * old key omitted the subject, so two different emails opened on one day
 * recorded a single open and silently dropped the other.
 *
 * ── FAILURE PATH ────────────────────────────────────────────────────────────
 *
 * One bad message must not abort the run for the others: each message is
 * isolated, a failure is counted and logged with its class, and the summary
 * says how many failed. The caller owns the Mandrill HTTP call, its timeout
 * and its retry.
 */
import { Op, Sequelize } from 'sequelize';

/** The fields of a `messages/search` result this module reads. */
export interface MandrillSearchMessage {
  _id?: string;
  ts?: number;
  email: string;
  subject?: string | null;
  opens: number;
  clicks: number;
  clicks_detail?: Array<{ url?: string | null; ts?: number }>;
}

export interface SentEmailRef {
  id: string;
  campaign_id: string | null;
  step_index: number | null;
}

/** The three stores the poll writes through; typed as the methods it uses so tests can hand in fakes. */
export interface PollStores {
  Lead: { findOne(options: object): Promise<{ id: number } | null> };
  ScheduledEmail: { findOne(options: object): Promise<SentEmailRef | null> };
  InteractionOutcome: {
    findOne(options: object): Promise<unknown>;
    create(row: object): Promise<unknown>;
  };
}

export interface PollSummary {
  seen: number;
  matchedLeads: number;
  opens: number;
  clicks: number;
  /** Recorded opens/clicks that no sent email of ours explains. */
  unattributed: number;
  failed: number;
}

/** The comparison both the poll and the backfill use. Trimmed, case-folded. */
export const normaliseSubject = (value: unknown): string => String(value ?? '').trim();

/** Distinct clicked URLs, capped so a metadata row cannot grow without bound. */
export function clickedUrls(msg: MandrillSearchMessage, cap = 10): string[] {
  const out: string[] = [];
  for (const c of msg.clicks_detail ?? []) {
    const url = typeof c?.url === 'string' ? c.url.slice(0, 500) : '';
    if (url && !out.includes(url)) out.push(url);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Where-clause for "the sent email this subject describes", for one lead.
 * Static `Sequelize.*` builders so the rule needs no live connection to be
 * constructed or tested.
 */
export function sentEmailWhere(leadId: number, subject: string): object {
  return {
    lead_id: leadId,
    status: 'sent',
    [Op.and]: [
      Sequelize.where(
        Sequelize.fn('lower', Sequelize.fn('btrim', Sequelize.col('subject'))),
        subject.toLowerCase(),
      ),
    ],
  };
}

export async function findSentEmailBySubject(
  ScheduledEmail: PollStores['ScheduledEmail'],
  leadId: number,
  subject: string,
): Promise<SentEmailRef | null> {
  if (!subject) return null;
  return ScheduledEmail.findOne({
    where: sentEmailWhere(leadId, subject),
    order: [['sent_at', 'DESC']],
    attributes: ['id', 'campaign_id', 'step_index'],
  });
}

/** Dedup: same lead, same outcome, same SUBJECT, since the start of the window. */
export function dedupWhere(leadId: number, outcome: 'opened' | 'clicked', subject: string, since: Date): object {
  return {
    lead_id: leadId,
    outcome,
    created_at: { [Op.gte]: since },
    // `where(literal, null)` renders as IS NULL, so a message with no subject
    // dedups against other subject-less rows rather than against everything.
    [Op.and]: [Sequelize.where(Sequelize.literal(`metadata->>'subject'`), subject || null)],
  };
}

/**
 * Record the opens and clicks in one page of Mandrill search results.
 * `since` is the start of the polling window (today, in the caller's terms)
 * and bounds the dedup lookup.
 */
export async function recordMandrillEngagement(
  messages: MandrillSearchMessage[],
  stores: PollStores,
  since: Date,
  log: Pick<Console, 'warn'> = console,
): Promise<PollSummary> {
  const summary: PollSummary = { seen: messages.length, matchedLeads: 0, opens: 0, clicks: 0, unattributed: 0, failed: 0 };

  for (const msg of messages) {
    try {
      if (!msg.email || (msg.opens <= 0 && msg.clicks <= 0)) continue;
      const lead = await stores.Lead.findOne({ where: { email: msg.email.toLowerCase() } });
      if (!lead) continue;
      summary.matchedLeads++;

      const subject = normaliseSubject(msg.subject);
      const sent = await findSentEmailBySubject(stores.ScheduledEmail, lead.id, subject);
      if (!sent) summary.unattributed++;

      const row = {
        lead_id: lead.id,
        channel: 'email',
        campaign_id: sent?.campaign_id ?? null,
        scheduled_email_id: sent?.id ?? null,
        // NOT NULL with default 0 on the table; null would fail validation and
        // — in the old code — abort the whole run for every later message.
        step_index: sent?.step_index ?? 0,
        metadata: {
          subject: subject || null,
          source: 'mandrill_poll',
          attribution: sent ? 'subject_match' : 'no_matching_send',
          ...(msg._id ? { mandrill_id: msg._id } : {}),
          ...(msg.ts ? { mandrill_ts: msg.ts } : {}),
        },
      };

      if (msg.opens > 0) {
        const dup = await stores.InteractionOutcome.findOne({ where: dedupWhere(lead.id, 'opened', subject, since) });
        if (!dup) {
          await stores.InteractionOutcome.create({ ...row, outcome: 'opened' });
          summary.opens++;
        }
      }
      if (msg.clicks > 0) {
        const dup = await stores.InteractionOutcome.findOne({ where: dedupWhere(lead.id, 'clicked', subject, since) });
        if (!dup) {
          const urls = clickedUrls(msg);
          await stores.InteractionOutcome.create({
            ...row,
            outcome: 'clicked',
            // Mandrill's clicks_detail names the URL, so "what was clicked" is
            // answerable for rows recorded from here on.
            metadata: urls.length ? { ...row.metadata, clicked_urls: urls } : row.metadata,
          });
          summary.clicks++;
        }
      }
    } catch (err) {
      summary.failed++;
      const e = err as { name?: string; message?: string };
      log.warn(JSON.stringify({
        level: 'warn', service: 'backend', event: 'mandrill_poll_message_failed',
        error_class: e?.name || 'Error', message: e?.message,
        // Subject only; the recipient address is not logged.
        context: { subject: normaliseSubject(msg.subject).slice(0, 120) },
      }));
    }
  }
  return summary;
}

// ── WHAT THE POLL ASKS MANDRILL FOR ─────────────────────────────────────────
//
// Measured 2026-09-11: the shared Mandrill account moves 1,000+ messages a day
// (school discussions digests alone are 580-850), and `messages/search` caps
// at 1,000 with no paging. The old request -- `query: '*'`, today only,
// `limit: 100` -- returned the 100 most recent messages on the account, and on
// three sampled days not one of them was a campaign email. Attribution was
// fixed above; this is the fix for what the poll SEES.
//
// Every campaign send carries `X-MC-Tags: campaign-sequence` (schedulerService
// send path), and the search API filters on tags. Two-day window so an open
// that lands the morning after the send is still caught; the dedup window
// widens to match. When a result fills the cap, coverage is saturated and the
// caller should say so -- Aug 13-14 2026 had 1,000+ tagged sends in two days.

/** The tag the send path puts on every campaign email. */
export const CAMPAIGN_TAG = 'campaign-sequence';
/** Mandrill's hard maximum for `messages/search`. */
export const SEARCH_LIMIT = 1000;

export interface SearchRequest {
  query: '*';
  tags: string[];
  date_from: string;
  date_to: string;
  limit: number;
}

const isoDay = (d: Date): string => d.toISOString().split('T')[0];

/** The window's start, as the dedup lower bound: UTC midnight of `date_from`. */
export function searchWindowStart(now: Date, daysBack = 1): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - daysBack);
  return start;
}

export function buildSearchRequest(now: Date, daysBack = 1): SearchRequest {
  return {
    query: '*',
    tags: [CAMPAIGN_TAG],
    date_from: isoDay(searchWindowStart(now, daysBack)),
    date_to: isoDay(now),
    limit: SEARCH_LIMIT,
  };
}

/** True when Mandrill returned as many rows as it is allowed to: there may be more. */
export const searchSaturated = (rows: unknown[]): boolean => rows.length >= SEARCH_LIMIT;
