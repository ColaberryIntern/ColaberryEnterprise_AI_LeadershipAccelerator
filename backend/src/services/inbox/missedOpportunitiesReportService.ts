// Missed Opportunities Report — read/aggregation layer. Turns the raw
// per-email opportunity scores into the shapes the executive report needs:
// an executive summary, the attention-blind-spot heat map, the top-25 most
// likely missed emails, topic drilldowns, and the learning-loop metrics.
//
// Scoring itself lives in opportunityScoringService (the deterministic brain);
// this module only reads, aggregates, and records feedback. getReport()
// recomputes scores for the date first (idempotent) so the view is never stale.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  InboxFalseNegativeFeedback,
  InboxSurfacePreference,
  InboxEmail,
} from '../../models';
import type { ScoreFactor, ScoreTopic } from '../../models/InboxOpportunityScore';
import { scoreHiddenEmailsForDate, reportDateCT } from './opportunityScoringService';
import type { FalseNegativeAction, FalseNegativeSource } from '../../models/InboxFalseNegativeFeedback';
import type { SurfacePatternType } from '../../models/InboxSurfacePreference';

export interface HeatMapWord {
  topic: string;
  frequency: number;     // size encoding
  avgScore: number;      // color encoding (band)
  band: 'high' | 'medium' | 'low';
  avgAgeHours: number;   // rotation encoding
  avgConfidence: number; // opacity encoding (0-100)
}

export interface MissedEmailRow {
  emailId: string;
  score: number;
  band: string;
  subject: string;
  fromName: string | null;
  fromAddress: string;
  receivedAt: string;
  currentFolder: string;   // hidden state, human-labeled
  reasonHidden: string | null;
  explanation: string;     // top factors, plain-language
  factors: ScoreFactor[];
  topics: ScoreTopic[];
  confidence: number;
}

export interface ExecutiveSummary {
  reportDate: string;
  totalProcessed: number;
  totalHidden: number;
  surfacedToInbox: number;
  potentiallyValuable: number; // high band
  mediumValue: number;
  deletedFlagged: number;      // 0 in v1 (no Trash ingestion)
  topThemes: string[];
}

export interface MissedOpportunitiesReport {
  summary: ExecutiveSummary;
  heatMap: HeatMapWord[];
  topMissed: MissedEmailRow[];
  deletedButValuable: MissedEmailRow[];
  learning: { restored: number; reopened: number; markedImportant: number; movedToInbox: number; surfacePreferences: number };
  generatedAt: string;
}

const STATE_LABELS: Record<string, string> = {
  AUTOMATION: 'Automation',
  SILENT_HOLD: 'Silent Hold',
  ASK_USER: 'Ask User',
  INBOX: 'Inbox',
};

function bandOf(score: number): 'high' | 'medium' | 'low' {
  if (score >= 65) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// Plain-language explanation from the strongest positive factors.
function explain(factors: ScoreFactor[]): string {
  const positives = factors.filter((f) => f.points > 0).sort((a, b) => b.points - a.points).slice(0, 3);
  if (positives.length === 0) return 'No strong opportunity signals detected.';
  return positives.map((f) => f.label).join('; ') + '.';
}

interface ScoreJoinRow {
  email_id: string;
  score: number;
  band: string;
  confidence: number;
  reason_hidden: string | null;
  hidden_state: string;
  factors: ScoreFactor[];
  topics: ScoreTopic[];
  subject: string;
  from_name: string | null;
  from_address: string;
  received_at: string;
}

// In rolling mode, also bound reads to the trailing 24h so the surfaced set is
// exactly "the last 24 hours" even if earlier same-day runs scored older mail.
async function fetchScoredRows(reportDate: string, rolling = false): Promise<ScoreJoinRow[]> {
  const windowClause = rolling ? `AND e.received_at >= NOW() - INTERVAL '24 hours'` : '';
  return sequelize.query<ScoreJoinRow>(
    `SELECT s.email_id, s.score, s.band, s.confidence, s.reason_hidden, s.hidden_state,
            s.factors, s.topics, e.subject, e.from_name, e.from_address, e.received_at
       FROM inbox_opportunity_scores s
       JOIN inbox_emails e ON e.id = s.email_id
      WHERE s.report_date = :reportDate ${windowClause}
      ORDER BY s.score DESC`,
    { type: QueryTypes.SELECT, replacements: { reportDate } },
  );
}

function toMissedRow(r: ScoreJoinRow): MissedEmailRow {
  return {
    emailId: r.email_id,
    score: r.score,
    band: r.band,
    subject: r.subject || '(no subject)',
    fromName: r.from_name,
    fromAddress: r.from_address,
    receivedAt: r.received_at,
    currentFolder: STATE_LABELS[r.hidden_state] || r.hidden_state,
    reasonHidden: r.reason_hidden,
    explanation: explain(r.factors || []),
    factors: r.factors || [],
    topics: r.topics || [],
    confidence: r.confidence,
  };
}

function buildHeatMap(rows: ScoreJoinRow[]): HeatMapWord[] {
  const now = Date.now();
  const acc = new Map<string, { freq: number; scoreSum: number; ageSum: number; confSum: number; n: number }>();
  for (const r of rows) {
    const ageHours = Math.max(0, (now - new Date(r.received_at).getTime()) / 3_600_000);
    for (const t of r.topics || []) {
      const cur = acc.get(t.topic) || { freq: 0, scoreSum: 0, ageSum: 0, confSum: 0, n: 0 };
      cur.freq += t.weight;
      cur.scoreSum += r.score;
      cur.ageSum += ageHours;
      cur.confSum += r.confidence;
      cur.n += 1;
      acc.set(t.topic, cur);
    }
  }
  return [...acc.entries()]
    .map(([topic, a]) => {
      const avgScore = Math.round(a.scoreSum / a.n);
      return {
        topic,
        frequency: a.freq,
        avgScore,
        band: bandOf(avgScore),
        avgAgeHours: Math.round(a.ageSum / a.n),
        avgConfidence: Math.round(a.confSum / a.n),
      };
    })
    .sort((x, y) => y.frequency - x.frequency || y.avgScore - x.avgScore)
    .slice(0, 40);
}

// ── Public: full report for a CT date (recomputes scores first) ──────────
export async function getReport(reportDate?: string): Promise<MissedOpportunitiesReport> {
  // No date, or today's date, => trailing-24h executive view. An explicit past
  // date => that CT calendar day (historical browsing).
  const date = reportDate || reportDateCT();
  const rolling = !reportDate || reportDate === reportDateCT();
  await scoreHiddenEmailsForDate(date, rolling); // idempotent — keeps the view fresh

  const rows = await fetchScoredRows(date, rolling);

  // Window-wide counts (all classifications in the same window as the scores).
  const countWindow = rolling
    ? `e.received_at >= NOW() - INTERVAL '24 hours'`
    : `(e.received_at AT TIME ZONE 'America/Chicago')::date = :reportDate`;
  const [counts] = await sequelize.query<{ total: string; hidden: string; inbox: string }>(
    `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE c.state IN ('AUTOMATION','SILENT_HOLD','ASK_USER')) AS hidden,
        COUNT(*) FILTER (WHERE c.state = 'INBOX') AS inbox
       FROM inbox_emails e
       JOIN inbox_classifications c ON c.email_id = e.id
      WHERE ${countWindow}`,
    { type: QueryTypes.SELECT, replacements: { reportDate: date } },
  );

  const heatMap = buildHeatMap(rows);
  const high = rows.filter((r) => r.score >= 65);
  const medium = rows.filter((r) => r.score >= 40 && r.score < 65);

  const summary: ExecutiveSummary = {
    reportDate: date,
    totalProcessed: parseInt(counts?.total || '0', 10),
    totalHidden: parseInt(counts?.hidden || '0', 10),
    surfacedToInbox: parseInt(counts?.inbox || '0', 10),
    potentiallyValuable: high.length,
    mediumValue: medium.length,
    deletedFlagged: 0,
    topThemes: heatMap.filter((w) => w.band !== 'low').slice(0, 6).map((w) => w.topic),
  };

  const learning = await getLearningMetrics();

  return {
    summary,
    heatMap,
    topMissed: rows.slice(0, 25).map(toMissedRow),
    deletedButValuable: [], // v1: Trash/Spam ingestion not yet wired
    learning,
    generatedAt: new Date().toISOString(),
  };
}

// ── Topic drilldown ───────────────────────────────────────────────────────
export interface TopicDrilldown {
  topic: string;
  reportDate: string;
  totalEmails: number;
  routingBreakdown: Record<string, number>;
  topSenders: Array<{ sender: string; count: number }>;
  topOrganizations: Array<{ org: string; count: number }>;
  emails: MissedEmailRow[];
  avgScore: number;
}

export async function getTopicDrilldown(topic: string, reportDate?: string): Promise<TopicDrilldown> {
  const date = reportDate || reportDateCT();
  const rolling = !reportDate || reportDate === reportDateCT();
  const rows = (await fetchScoredRows(date, rolling)).filter((r) =>
    (r.topics || []).some((t) => t.topic === topic.toLowerCase()),
  );

  const routingBreakdown: Record<string, number> = {};
  const senderCounts = new Map<string, number>();
  const orgCounts = new Map<string, number>();
  let scoreSum = 0;
  for (const r of rows) {
    const label = STATE_LABELS[r.hidden_state] || r.hidden_state;
    routingBreakdown[label] = (routingBreakdown[label] || 0) + 1;
    senderCounts.set(r.from_address, (senderCounts.get(r.from_address) || 0) + 1);
    const dom = r.from_address.includes('@') ? r.from_address.split('@')[1] : r.from_address;
    orgCounts.set(dom, (orgCounts.get(dom) || 0) + 1);
    scoreSum += r.score;
  }
  const top = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    topic,
    reportDate: date,
    totalEmails: rows.length,
    routingBreakdown,
    topSenders: top(senderCounts).map(([sender, count]) => ({ sender, count })),
    topOrganizations: top(orgCounts).map(([org, count]) => ({ org, count })),
    emails: rows.slice(0, 25).map(toMissedRow),
    avgScore: rows.length ? Math.round(scoreSum / rows.length) : 0,
  };
}

// ── Learning loop ─────────────────────────────────────────────────────────
export async function getLearningMetrics() {
  const [m] = await sequelize.query<{ restored: string; reopened: string; important: string; moved: string }>(
    `SELECT
        COUNT(*) FILTER (WHERE action = 'restored') AS restored,
        COUNT(*) FILTER (WHERE action = 'reopened') AS reopened,
        COUNT(*) FILTER (WHERE action = 'marked_important') AS important,
        COUNT(*) FILTER (WHERE action = 'moved_to_inbox') AS moved
       FROM inbox_false_negative_feedback`,
    { type: QueryTypes.SELECT },
  );
  const prefCount = await InboxSurfacePreference.count({ where: { enabled: true } });
  return {
    restored: parseInt(m?.restored || '0', 10),
    reopened: parseInt(m?.reopened || '0', 10),
    markedImportant: parseInt(m?.important || '0', 10),
    movedToInbox: parseInt(m?.moved || '0', 10),
    surfacePreferences: prefCount,
  };
}

export async function recordFeedback(
  emailId: string,
  action: FalseNegativeAction,
  source: FalseNegativeSource = 'report',
  createdBy?: string,
): Promise<void> {
  const email = await InboxEmail.findByPk(emailId);
  if (!email) throw new Error('email not found');
  // Pull the most recent opportunity score for context (best-effort).
  const [scoreRow] = await sequelize.query<{ score: number }>(
    `SELECT score FROM inbox_opportunity_scores WHERE email_id = :id ORDER BY report_date DESC LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { id: emailId } },
  );
  await InboxFalseNegativeFeedback.create({
    email_id: emailId,
    action,
    source,
    score_at_feedback: scoreRow?.score ?? null,
    created_by: createdBy || null,
    created_at: new Date(),
  });
}

// "Always show emails like this." Persists a durable surface preference keyed
// on the email's sender or domain, idempotently (unique on type+value).
export async function addSurfacePreference(
  emailId: string,
  patternType: SurfacePatternType,
  createdBy?: string,
): Promise<{ patternType: SurfacePatternType; patternValue: string }> {
  const email = await InboxEmail.findByPk(emailId);
  if (!email) throw new Error('email not found');
  const addr = (email.from_address || '').toLowerCase();
  let patternValue = addr;
  if (patternType === 'domain') patternValue = addr.includes('@') ? addr.split('@')[1] : addr;
  if (!patternValue) throw new Error('could not derive pattern value from email');

  await InboxSurfacePreference.findOrCreate({
    where: { pattern_type: patternType, pattern_value: patternValue },
    defaults: {
      pattern_type: patternType,
      pattern_value: patternValue,
      source_email_id: emailId,
      enabled: true,
      created_by: createdBy || null,
      created_at: new Date(),
    },
  });
  return { patternType, patternValue };
}
