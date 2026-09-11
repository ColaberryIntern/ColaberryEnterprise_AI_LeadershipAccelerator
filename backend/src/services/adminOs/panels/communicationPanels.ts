import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/**
 * Every communication with this person, threaded by campaign.
 *
 * Ali, 2026-09-10: "I want a tab added to 360 that shows every communication to
 * this level of detail that's already in the campaign where we can click on and
 * read every campaign communication and see any back and forth communication."
 *
 * ── WHY THIS IS NOT THE CAMPAIGN MODAL ──────────────────────────────────────
 *
 * The campaign lead modal already shows this, but scoped to ONE campaign:
 * `/api/admin/campaigns/:id/leads/:leadId/timeline` takes a campaign id and
 * filters every query by it. Opening a person from a campaign therefore shows
 * only what that campaign sent, and a person in four campaigns has four places
 * to look and no single history.
 *
 * This is the same data, keyed on the PERSON, threaded by campaign — plus the
 * messages that belong to no campaign at all, which the campaign-scoped view
 * cannot show by construction.
 *
 * ── BOTH DIRECTIONS ─────────────────────────────────────────────────────────
 *
 * "See any back and forth" is the requirement, so inbound matters as much as
 * outbound. Two tables carry it:
 *
 *   scheduled_emails      what we sent (or will send) — subject, body, step
 *   communication_logs    carries a `direction`, so replies live here
 *
 * and interaction_outcomes records what happened to a sent message (opened,
 * clicked, replied). An outcome is attached to its message by
 * `scheduled_email_id` where that link exists, so a message shows its own
 * engagement rather than the reader matching timestamps by eye.
 */

export interface CommunicationOutcome {
  outcome: string;
  at: string | null;
  channel: string | null;
  /**
   * The subject Mandrill recorded for the message this outcome was actually on.
   * When it differs from the message the row is attached to, the attachment is
   * wrong — see `attributed` — and the reader is shown this instead.
   */
  subject: string | null;
  /**
   * False when the recorded subject disagrees with the message the foreign key
   * points at. The Mandrill poll in schedulerService pins every open and click
   * for a lead to "the most recent sent email to this lead", whatever Mandrill
   * says was opened — so a login-email open lands on a campaign email. The
   * metadata subject is the truth; the FK is a guess.
   */
  attributed: boolean;
}

export interface CommunicationMessage {
  id: string;
  /** Inbound is a reply FROM the person; outbound is ours. */
  direction: 'inbound' | 'outbound';
  channel: string | null;
  subject: string | null;
  /** The full body. This tab exists to read them. */
  body: string | null;
  sentAt: string | null;
  scheduledFor: string | null;
  status: string | null;
  aiGenerated: boolean;
  stepIndex: number | null;
  toAddress: string | null;
  /** The table this came from, so any row can be traced back. */
  source: string;
  outcomes: CommunicationOutcome[];
}

export interface CommunicationThread {
  campaignId: string | null;
  /** "Not part of a campaign" for the null-campaign thread. */
  campaignName: string;
  campaignStatus: string | null;
  enrollmentStatus: string | null;
  stepIndex: number | null;
  totalSteps: number | null;
  enrolledAt: string | null;
  lastActivityAt: string | null;
  /** From campaign_leads — the same counters the campaign modal shows. */
  touchpoints: number | null;
  responses: number | null;
  messages: CommunicationMessage[];
}

export interface CommunicationsPanel {
  threads: CommunicationThread[];
  totalMessages: number;
  totalCampaigns: number;
  totalOutcomes: number;
  inboundCount: number;
  /** True when the message cap was hit, so the UI can say so rather than imply completeness. */
  truncated: boolean;
}

/** Bodies are returned in full, so the row cap is what keeps the payload sane. */
const MESSAGE_CAP = 300;

interface EnrolmentRow {
  campaign_id: string | null; campaign_name: string | null; campaign_status: string | null;
  status: string | null; current_step_index: number | null; total_steps: number | null;
  enrolled_at: string | null; last_activity_at: string | null;
  touchpoint_count: number | null; response_count: number | null;
}

interface MessageRow {
  id: string; campaign_id: string | null; direction: string; channel: string | null;
  subject: string | null; body: string | null; sent_at: string | null;
  scheduled_for: string | null; status: string | null; ai_generated: boolean | null;
  step_index: number | null; to_address: string | null; source: string;
}

interface OutcomeRow {
  scheduled_email_id: string | null; campaign_id: string | null;
  outcome: string; channel: string | null; created_at: string | null;
  metadata: { subject?: string | null } | null;
}

/**
 * A timestamp as milliseconds, whatever shape the driver handed back.
 *
 * These fields are TYPED as `string | null`, and at runtime Sequelize returns
 * Date objects for timestamp columns. Sorting them with `localeCompare` threw
 * `TypeError: bt.localeCompare is not a function` and took the whole profile
 * endpoint down with a 500 — for every person who had any message at all.
 *
 * Nothing caught it: tsc believed the declared type, the unit tests mock
 * `sequelize.query` so they never see a Date, and verifying the SQL against
 * production exercised the query but not this sort. Compare numerically and
 * the shape stops mattering.
 */
function millis(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(String(value));
  const n = d.getTime();
  return Number.isNaN(n) ? 0 : n;
}

export async function loadCommunications(leadIds: number[]): Promise<CommunicationsPanel | null> {
  if (leadIds.length === 0) return null;
  const replacements = { leadIds, cap: MESSAGE_CAP };

  const [enrolments, messages, outcomes] = await Promise.all([
    sequelize.query<EnrolmentRow>(
      `SELECT cl.campaign_id, c.name AS campaign_name, c.status AS campaign_status,
              cl.status, cl.current_step_index, cl.total_steps,
              cl.enrolled_at, cl.last_activity_at,
              cl.touchpoint_count, cl.response_count
       FROM campaign_leads cl
       LEFT JOIN campaigns c ON c.id = cl.campaign_id
       WHERE cl.lead_id IN (:leadIds)
       ORDER BY cl.enrolled_at DESC NULLS LAST`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<MessageRow>(
      // The UNION is wrapped in a subquery so the ORDER BY can use an
      // EXPRESSION. Postgres rejects `ORDER BY COALESCE(a, b)` directly on a
      // UNION -- "Only result column names can be used, not expressions" --
      // and ordering by a bare column would put unsent scheduled messages in
      // the wrong place. Caught by running this against production; the unit
      // tests mock the query layer and would have passed it.
      `SELECT * FROM (
         -- Outbound: what we sent or scheduled.
         SELECT se.id::text AS id, se.campaign_id::text AS campaign_id, 'outbound' AS direction,
                se.channel, se.subject, se.body, se.sent_at, se.scheduled_for, se.status,
                se.ai_generated, se.step_index, se.to_email AS to_address,
                'scheduled_emails' AS source
         FROM scheduled_emails se
         WHERE se.lead_id IN (:leadIds) AND COALESCE(se.is_test_action, false) = false
         UNION ALL
         -- Both directions. communication_logs is where a REPLY lands, which is
         -- the half the campaign-scoped view never shows.
         SELECT cl.id::text, cl.campaign_id::text,
                COALESCE(cl.direction, 'outbound'), cl.channel, cl.subject, cl.body,
                cl.created_at, NULL, cl.status, false, NULL,
                COALESCE(cl.to_address, cl.from_address),
                'communication_logs'
         FROM communication_logs cl
         WHERE cl.lead_id IN (:leadIds)
       ) m
       ORDER BY COALESCE(m.sent_at, m.scheduled_for) DESC NULLS LAST
       LIMIT :cap`,
      { type: QueryTypes.SELECT, replacements },
    ),
    sequelize.query<OutcomeRow>(
      `SELECT io.scheduled_email_id::text AS scheduled_email_id,
              io.campaign_id::text AS campaign_id,
              io.outcome, io.channel, io.created_at, io.metadata
       FROM interaction_outcomes io
       WHERE io.lead_id IN (:leadIds)
       ORDER BY io.created_at ASC`,
      { type: QueryTypes.SELECT, replacements },
    ),
  ]);

  // ── OUTCOMES ATTACH ONLY WHEN MANDRILL'S OWN SUBJECT AGREES ───────────────
  //
  // Found 2026-09-11 on a live profile: an email showing "7 opens & clicks" whose
  // outcomes all carried metadata.subject of "Log into your ColaberryApp
  // Account" and "[Accelerator] Your Portal Access Link" — her login emails,
  // not the campaign email. The Mandrill poll pins every open and click to the
  // most recent sent email regardless of which was opened. The FK is therefore
  // a guess; the recorded subject is the fact. Trust the FK only when the two
  // agree, or when no subject was recorded at all (older rows predate it).
  const subjectOf = new Map<string, string | null>();
  for (const m of messages) subjectOf.set(m.id, m.subject);
  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

  const byMessage = new Map<string, CommunicationOutcome[]>();
  const unattached: Array<OutcomeRow> = [];
  for (const o of outcomes) {
    const recorded = o.metadata?.subject ?? null;
    const fkSubject = o.scheduled_email_id ? subjectOf.get(o.scheduled_email_id) : undefined;
    const agrees = !recorded || fkSubject === undefined || norm(recorded) === norm(fkSubject);
    const entry: CommunicationOutcome = {
      outcome: o.outcome, at: o.created_at, channel: o.channel,
      subject: recorded, attributed: agrees,
    };
    if (o.scheduled_email_id && agrees && subjectOf.has(o.scheduled_email_id)) {
      const list = byMessage.get(o.scheduled_email_id) ?? [];
      list.push(entry);
      byMessage.set(o.scheduled_email_id, list);
    } else {
      unattached.push(o);
    }
  }

  const threads = new Map<string, CommunicationThread>();
  const keyOf = (id: string | null) => id ?? '__none__';

  for (const e of enrolments) {
    const key = keyOf(e.campaign_id);
    if (threads.has(key)) continue;
    threads.set(key, {
      campaignId: e.campaign_id,
      campaignName: e.campaign_name ?? 'Unnamed campaign',
      campaignStatus: e.campaign_status,
      enrollmentStatus: e.status,
      stepIndex: e.current_step_index,
      totalSteps: e.total_steps,
      enrolledAt: e.enrolled_at,
      lastActivityAt: e.last_activity_at,
      touchpoints: e.touchpoint_count,
      responses: e.response_count,
      messages: [],
    });
  }

  let inboundCount = 0;
  for (const m of messages) {
    const key = keyOf(m.campaign_id);
    if (!threads.has(key)) {
      // A message whose campaign this person was never enrolled in, or none at
      // all. Both are real and both would vanish from a campaign-scoped view.
      threads.set(key, {
        campaignId: m.campaign_id,
        campaignName: m.campaign_id ? 'Campaign (not enrolled)' : 'Not part of a campaign',
        campaignStatus: null,
        enrollmentStatus: null,
        stepIndex: null,
        totalSteps: null,
        enrolledAt: null,
        lastActivityAt: null,
        touchpoints: null,
        responses: null,
        messages: [],
      });
    }
    const direction: 'inbound' | 'outbound' = m.direction === 'inbound' ? 'inbound' : 'outbound';
    if (direction === 'inbound') inboundCount += 1;
    threads.get(key)!.messages.push({
      id: m.id,
      direction,
      channel: m.channel,
      subject: m.subject,
      body: m.body,
      sentAt: m.sent_at,
      scheduledFor: m.scheduled_for,
      status: m.status,
      aiGenerated: !!m.ai_generated,
      stepIndex: m.step_index,
      toAddress: m.to_address,
      source: m.source,
      outcomes: byMessage.get(m.id) ?? [],
    });
  }

  // Unattributable outcomes still belong to their campaign's thread — labelled
  // with the subject Mandrill recorded, which is the only honest name we have
  // for an engagement on a message we do not hold.
  for (const o of unattached) {
    const t = threads.get(keyOf(o.campaign_id));
    if (!t) continue;
    const recorded = o.metadata?.subject ?? null;
    t.messages.push({
      id: `outcome-${o.created_at}-${o.outcome}`,
      direction: o.outcome === 'replied' ? 'inbound' : 'outbound',
      channel: o.channel,
      subject: recorded,
      body: null,
      sentAt: o.created_at,
      scheduledFor: null,
      status: o.outcome,
      aiGenerated: false,
      stepIndex: null,
      toAddress: null,
      source: 'interaction_outcomes',
      outcomes: [{ outcome: o.outcome, at: o.created_at, channel: o.channel, subject: recorded, attributed: true }],
    });
  }

  const ordered = Array.from(threads.values());
  for (const t of ordered) {
    t.messages.sort((a, b) => millis(b.sentAt ?? b.scheduledFor) - millis(a.sentAt ?? a.scheduledFor));
  }
  // Threads with recent traffic first; the campaign-less thread sinks unless it
  // is genuinely the most recent thing that happened.
  ordered.sort((a, b) =>
    millis(b.messages[0]?.sentAt ?? b.lastActivityAt ?? b.enrolledAt)
    - millis(a.messages[0]?.sentAt ?? a.lastActivityAt ?? a.enrolledAt));

  return {
    threads: ordered,
    totalMessages: ordered.reduce((n, t) => n + t.messages.length, 0),
    totalCampaigns: ordered.filter((t) => t.campaignId).length,
    totalOutcomes: outcomes.length,
    inboundCount,
    truncated: messages.length >= MESSAGE_CAP,
  };
}
