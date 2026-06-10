// Opportunity Scoring Engine — the deterministic brain of the Missed
// Opportunities Report. For every email the Inbox COS routed AWAY from the
// Inbox (AUTOMATION / SILENT_HOLD / ASK_USER), it computes an Opportunity
// Risk Score (0-100): "how likely is it that Ali would have wanted to see
// this?" The score is a pure function of explainable factors — no LLM, no
// black box. Every point is attributed in `factors` so the report is fully
// auditable (CLAUDE.md: production systems must be deterministic).
//
// Idempotent: re-running for the same date upserts one row per (email, date).

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { InboxOpportunityScore } from '../../models';
import type { ScoreFactor, ScoreTopic, OpportunityBand } from '../../models/InboxOpportunityScore';

export const HIDDEN_STATES = ['AUTOMATION', 'SILENT_HOLD', 'ASK_USER'] as const;

// Mail that ALWAYS reaches Ali's Inbox and therefore can never be "missed":
// his own address (the Inbox COS notifier also sends as ali@colaberry.com) and
// the self-generated "Opportunity Pulse" digests. Excluding them keeps the
// report on its real target — external mail that LOOKS like spam but isn't.
// Shared by every query that defines the report's candidate universe (scoring,
// list read, and the window counts) so the three never drift. Assumes the
// joined email table is aliased `e`.
export const SELF_INBOX_EXCLUSION_SQL = `lower(e.from_address) <> 'ali@colaberry.com'
        AND lower(coalesce(e.from_name, '')) NOT LIKE '%inbox cos%'
        AND lower(coalesce(e.subject, '')) NOT LIKE '%opportunity pulse%'`;

// ── Strategic keyword vocabulary (weight per category) ───────────────────
// Presence in subject or body is a strong "Ali would care" signal.
const KEYWORD_GROUPS: Array<{ label: string; points: number; terms: string[] }> = [
  { label: 'Contract reference', points: 14, terms: ['contract', 'agreement', 'msa', 'sow', 'statement of work', 'nda', 'terms'] },
  { label: 'Partnership reference', points: 14, terms: ['partner', 'partnership', 'collaborat', 'joint venture', 'alliance', 'reseller'] },
  { label: 'Deal / revenue signal', points: 12, terms: ['proposal', 'quote', 'pricing', 'purchase order', 'procurement', 'rfp', 'bid', 'invoice', 'payment', 'wire', 'budget'] },
  { label: 'Meeting request', points: 10, terms: ['meeting', 'calendar', 'schedule a call', 'book a time', 'available', 'invite', 'reschedule', 'zoom', 'google meet', 'teams call'] },
  { label: 'Urgency signal', points: 10, terms: ['urgent', 'asap', 'deadline', 'time-sensitive', 'time sensitive', 'expires', 'final notice', 'action required', 'last chance'] },
  { label: 'Strategic / executive', points: 8, terms: ['acquisition', 'investment', 'investor', 'funding', 'board', 'enterprise', 'pilot', 'grant', 'award'] },
];

// Markers that an email is bulk/automated rather than human-written 1:1.
const BULK_SUBJECT_MARKERS = ['newsletter', 'unsubscribe', 'digest', 'weekly update', 'no-reply', 'noreply', 'do not reply', 'webinar', 'sale', '% off', 'promo', 'receipt', 'order confirmation', 'verify your', 'reset your password'];

// Common stopwords stripped from topic extraction.
const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'your', 'you', 'we', 'our', 'us', 'is', 'are', 'be', 'this', 'that', 'it', 'as', 're', 'fw', 'fwd', 'new', 'get', 'now', 'how', 'what', 'why', 'can', 'will', 'has', 'have', 'about', 'into', 'out', 'up', 'all', 'more', 'please', 'hi', 'hello', 'dear', 'thanks', 'thank']);

// Band thresholds — drive the heat-map color (green/yellow/gray).
function bandFor(score: number): OpportunityBand {
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ── Positive-signal corpus ───────────────────────────────────────────────
// Senders/domains/topics Ali has historically engaged with. Emails resembling
// these are far more likely to be false negatives worth surfacing.
interface PositiveCorpus {
  vipSenders: Set<string>;
  repliedSenders: Set<string>;
  repliedDomains: Set<string>;
  rescuedSenders: Set<string>;
  feedbackSenders: Set<string>;
  prefSenders: Set<string>;
  prefDomains: Set<string>;
  prefTopics: Set<string>;
}

function domainOf(address: string): string {
  const at = (address || '').toLowerCase().lastIndexOf('@');
  return at >= 0 ? address.toLowerCase().slice(at + 1) : '';
}

async function buildPositiveCorpus(): Promise<PositiveCorpus> {
  const lc = (rows: Array<{ v: string | null }>) =>
    new Set(rows.map((r) => (r.v || '').toLowerCase()).filter(Boolean));

  const [vips, replied, rescued, feedback, prefs] = await Promise.all([
    sequelize.query<{ v: string | null }>(
      `SELECT email_address AS v FROM inbox_vips`,
      { type: QueryTypes.SELECT },
    ),
    sequelize.query<{ v: string | null }>(
      `SELECT DISTINCT e.from_address AS v
         FROM inbox_reply_drafts d JOIN inbox_emails e ON e.id = d.email_id
        WHERE d.status IN ('sent', 'approved', 'edited')`,
      { type: QueryTypes.SELECT },
    ),
    sequelize.query<{ v: string | null }>(
      `SELECT DISTINCT e.from_address AS v
         FROM inbox_classifications c JOIN inbox_emails e ON e.id = c.email_id
        WHERE c.state = 'INBOX' AND c.classified_by IN ('user_override', 'digest_action')`,
      { type: QueryTypes.SELECT },
    ),
    sequelize.query<{ v: string | null }>(
      `SELECT DISTINCT e.from_address AS v
         FROM inbox_false_negative_feedback f JOIN inbox_emails e ON e.id = f.email_id`,
      { type: QueryTypes.SELECT },
    ),
    sequelize.query<{ pattern_type: string; pattern_value: string }>(
      `SELECT pattern_type, pattern_value FROM inbox_surface_preferences WHERE enabled = true`,
      { type: QueryTypes.SELECT },
    ),
  ]);

  const repliedSenders = lc(replied);
  const repliedDomains = new Set<string>();
  repliedSenders.forEach((s) => { const d = domainOf(s); if (d) repliedDomains.add(d); });

  const prefSenders = new Set<string>();
  const prefDomains = new Set<string>();
  const prefTopics = new Set<string>();
  for (const p of prefs) {
    const v = (p.pattern_value || '').toLowerCase();
    if (!v) continue;
    if (p.pattern_type === 'sender') prefSenders.add(v);
    else if (p.pattern_type === 'domain') prefDomains.add(v);
    else if (p.pattern_type === 'topic') prefTopics.add(v);
  }

  return {
    vipSenders: lc(vips),
    repliedSenders,
    repliedDomains,
    rescuedSenders: lc(rescued),
    feedbackSenders: lc(feedback),
    prefSenders,
    prefDomains,
    prefTopics,
  };
}

// ── Candidate row shape (raw join) ───────────────────────────────────────
interface CandidateRow {
  id: string;
  from_address: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  headers: Record<string, any> | null;
  to_addresses: any;
  state: string;
  confidence: number | null;
  reasoning: string | null;
}

// Extract deterministic topics from subject + sender org + matched keywords.
export function extractTopics(row: CandidateRow, matchedKeywordLabels: string[]): ScoreTopic[] {
  const counts = new Map<string, number>();
  const bump = (t: string, by = 1) => {
    const key = t.toLowerCase().trim();
    if (!key || key.length < 3) return;
    counts.set(key, (counts.get(key) || 0) + by);
  };

  // Subject tokens (alphabetic, non-stopword)
  const subject = (row.subject || '').toLowerCase();
  for (const tok of subject.split(/[^a-z0-9]+/)) {
    if (tok.length >= 4 && !STOPWORDS.has(tok) && !/^\d+$/.test(tok)) bump(tok);
  }

  // Sender organization (domain root, minus common providers)
  const dom = domainOf(row.from_address);
  const root = dom.replace(/\.(com|org|net|io|ai|co|edu|gov|us)$/i, '').split('.').pop() || '';
  const GENERIC = new Set(['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'aol', 'proton', 'me']);
  if (root && !GENERIC.has(root)) bump(root, 2);

  // Matched strategic categories become first-class topics
  for (const label of matchedKeywordLabels) bump(label.toLowerCase(), 2);

  return [...counts.entries()]
    .map(([topic, weight]) => ({ topic, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);
}

// ── Core deterministic scorer ────────────────────────────────────────────
export function scoreEmail(row: CandidateRow, corpus: PositiveCorpus): {
  score: number;
  band: OpportunityBand;
  factors: ScoreFactor[];
  topics: ScoreTopic[];
} {
  const factors: ScoreFactor[] = [];
  const sender = (row.from_address || '').toLowerCase();
  const dom = domainOf(sender);
  const haystack = `${row.subject || ''} \n ${row.body_text || ''}`.toLowerCase();

  // Surface preference ("always show emails like this") — strongest signal.
  if (corpus.prefSenders.has(sender)) {
    factors.push({ factor: 'surface_pref_sender', label: 'You asked to always see this sender', points: 40, detail: sender });
  } else if (dom && corpus.prefDomains.has(dom)) {
    factors.push({ factor: 'surface_pref_domain', label: 'You asked to always see this organization', points: 35, detail: dom });
  }

  // VIP sender.
  if (corpus.vipSenders.has(sender)) {
    factors.push({ factor: 'vip_sender', label: 'Sender is on your VIP list', points: 35, detail: sender });
  }

  // Historical engagement (replied to / rescued / prior feedback).
  if (corpus.repliedSenders.has(sender)) {
    factors.push({ factor: 'replied_sender', label: 'You have replied to this sender before', points: 25, detail: sender });
  } else if (dom && corpus.repliedDomains.has(dom)) {
    factors.push({ factor: 'replied_domain', label: 'You have replied to this organization before', points: 15, detail: dom });
  }
  if (corpus.rescuedSenders.has(sender)) {
    factors.push({ factor: 'rescued_sender', label: 'You previously rescued mail from this sender', points: 20, detail: sender });
  }
  if (corpus.feedbackSenders.has(sender)) {
    factors.push({ factor: 'feedback_sender', label: 'You flagged this sender as a missed opportunity before', points: 18, detail: sender });
  }

  // Strategic keywords (capped so a keyword-stuffed email can't dominate).
  const matchedLabels: string[] = [];
  let keywordPoints = 0;
  for (const group of KEYWORD_GROUPS) {
    const hit = group.terms.find((t) => haystack.includes(t));
    if (hit) {
      matchedLabels.push(group.label);
      keywordPoints += group.points;
      factors.push({ factor: 'strategic_keyword', label: group.label, points: group.points, detail: `matched "${hit}"` });
    }
  }
  if (keywordPoints > 36) {
    // Trim overflow as an explicit, visible adjustment.
    factors.push({ factor: 'keyword_cap', label: 'Strategic-keyword contribution capped', points: 36 - keywordPoints, detail: 'multiple categories matched' });
  }

  // Topic-level surface preference.
  const topics = extractTopics(row, matchedLabels);
  const topicHit = topics.find((t) => corpus.prefTopics.has(t.topic));
  if (topicHit) {
    factors.push({ factor: 'surface_pref_topic', label: 'Matches a topic you asked to always see', points: 20, detail: topicHit.topic });
  }

  // Human-written vs bulk. List-Unsubscribe header + bulk subject markers are
  // strong "this is mass mail" signals → penalty. A direct, single-recipient
  // message with none of them reads as human 1:1 → small boost.
  const headers = row.headers || {};
  const headerKeys = Object.keys(headers).map((k) => k.toLowerCase());
  const hasUnsub = headerKeys.includes('list-unsubscribe') || haystack.includes('unsubscribe');
  const bulkMarker = BULK_SUBJECT_MARKERS.find((m) => (row.subject || '').toLowerCase().includes(m) || sender.includes(m.replace(/\s/g, '')));
  const toCount = Array.isArray(row.to_addresses) ? row.to_addresses.length : 0;
  if (hasUnsub || bulkMarker) {
    factors.push({ factor: 'bulk_mail', label: 'Looks like bulk / automated mail', points: -15, detail: bulkMarker ? `marker: ${bulkMarker}` : 'List-Unsubscribe present' });
  } else if (toCount === 1) {
    factors.push({ factor: 'human_written', label: 'Reads as a direct, human-written message', points: 8, detail: 'single recipient, no bulk markers' });
  }

  // Classifier uncertainty — the system itself wasn't confident it should hide
  // this. Low confidence in a hidden state is exactly where false negatives live.
  const conf = row.confidence ?? 0;
  if (conf > 0 && conf < 60) {
    factors.push({ factor: 'low_confidence_hide', label: 'Filter was not confident this should be hidden', points: 10, detail: `classification confidence ${conf}%` });
  }
  if (row.state === 'ASK_USER') {
    factors.push({ factor: 'ask_user_state', label: 'Filter already flagged this as needing your decision', points: 6, detail: 'routed to Ask User' });
  }

  // Sum, clamp, band.
  const raw = factors.reduce((s, f) => s + f.points, 0);
  const score = Math.max(0, Math.min(100, raw));
  return { score, band: bandFor(score), factors, topics };
}

// ── Public entry: score all hidden emails received on a given CT date ─────
export interface ScoringResult {
  reportDate: string;
  processed: number;
  upserted: number;
}

// When `rolling` is true the candidate set is the trailing 24 hours ending now
// (the executive report only cares about "what slipped past me today"); the row
// is still stamped with `reportDate` (today CT) as the idempotency key. When
// false it scores a specific CT calendar day (historical browsing).
export async function scoreHiddenEmailsForDate(reportDate: string, rolling = false): Promise<ScoringResult> {
  const corpus = await buildPositiveCorpus();

  const windowClause = rolling
    ? `e.received_at >= NOW() - INTERVAL '24 hours'`
    : `(e.received_at AT TIME ZONE 'America/Chicago')::date = :reportDate`;

  const candidates = await sequelize.query<CandidateRow>(
    `SELECT e.id, e.from_address, e.from_name, e.subject, e.body_text, e.headers,
            e.to_addresses, c.state, c.confidence, c.reasoning
       FROM inbox_emails e
       JOIN inbox_classifications c ON c.email_id = e.id
      WHERE c.state IN ('AUTOMATION', 'SILENT_HOLD', 'ASK_USER')
        AND ${windowClause}
        AND ${SELF_INBOX_EXCLUSION_SQL}`,
    { type: QueryTypes.SELECT, replacements: { reportDate } },
  );

  let upserted = 0;
  const now = new Date();
  for (const row of candidates) {
    const { score, band, factors, topics } = scoreEmail(row, corpus);
    // Idempotent upsert keyed on (email_id, report_date).
    await InboxOpportunityScore.upsert({
      email_id: row.id,
      report_date: reportDate,
      score,
      band,
      confidence: row.confidence ?? 0,
      reason_hidden: row.reasoning,
      hidden_state: row.state,
      factors,
      topics,
      computed_at: now,
    });
    upserted += 1;
  }

  return { reportDate, processed: candidates.length, upserted };
}

// Today's date in America/Chicago as YYYY-MM-DD (matches Ali's local day).
export function reportDateCT(d: Date = new Date()): string {
  // en-CA locale yields YYYY-MM-DD; timeZone shifts to CT.
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
}
