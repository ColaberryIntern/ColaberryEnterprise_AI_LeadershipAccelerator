/**
 * retentionReportService — DRY-RUN data-retention report (TBI audit P2-5).
 *
 * Answers "what would a 24-month retention TTL purge?" for the PII-bearing, time-series tables
 * that currently have NO retention (chat/call transcripts, comms, sessions, leads). It is
 * **strictly read-only**: every query is a COUNT/MIN aggregate — this module never deletes a row.
 * Purge enforcement is a deliberate, separately-gated follow-up (needs sign-off + scope confirm,
 * esp. leads, which should be anonymized rather than hard-deleted).
 *
 * The existing telemetry sweepers (intelligenceRetention, snapshot/awareness/governance/remediation)
 * already handle non-PII operational data at shorter TTLs; this report covers the customer-PII gap.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';

export const RETENTION_DEFAULT_TTL_MONTHS = 24;

export type RetentionAction = 'purge' | 'anonymize_review';

interface RetentionClassDef {
  key: string;
  label: string;
  table: string; // physical table name (hardcoded, never user input)
  ageColumn: string; // timestamp column that defines record age
  ttlMonths: number;
  pii: string;
  action: RetentionAction;
}

/**
 * The PII retention policy. Tables + age columns verified against the model files (all
 * `timestamps: false`, snake_case). `leads` is flagged anonymize_review — deleting CRM pipeline
 * is business-destructive, so it is surfaced for visibility but recommended for anonymization.
 */
export const RETENTION_POLICY: RetentionClassDef[] = [
  { key: 'chat_conversations', label: 'Maya/Cory chat conversations', table: 'chat_conversations', ageColumn: 'started_at', ttlMonths: 24, pii: 'Chat sessions + page/visitor context', action: 'purge' },
  { key: 'chat_messages', label: 'Chat message text', table: 'chat_messages', ageColumn: 'timestamp', ttlMonths: 24, pii: 'Full conversation text', action: 'purge' },
  { key: 'communication_logs', label: 'Email/SMS communication logs', table: 'communication_logs', ageColumn: 'created_at', ttlMonths: 24, pii: 'Message bodies + to/from addresses', action: 'purge' },
  { key: 'call_contact_logs', label: 'Voice call records', table: 'call_contact_logs', ageColumn: 'call_timestamp', ttlMonths: 24, pii: 'Call metadata + voice context', action: 'purge' },
  { key: 'session_chat_messages', label: 'Live-session chat', table: 'session_chat_messages', ageColumn: 'created_at', ttlMonths: 24, pii: 'Student session chat content', action: 'purge' },
  { key: 'mentor_conversations', label: 'Mentor–student conversations', table: 'mentor_conversations', ageColumn: 'created_at', ttlMonths: 24, pii: 'Mentor/student conversation history', action: 'purge' },
  { key: 'visitor_sessions', label: 'Visitor sessions', table: 'visitor_sessions', ageColumn: 'started_at', ttlMonths: 24, pii: 'IP, device, page sequence (behavioral)', action: 'purge' },
  { key: 'activities', label: 'Lead interaction activities', table: 'activities', ageColumn: 'created_at', ttlMonths: 24, pii: 'Lead interaction logs (calls/emails/notes)', action: 'purge' },
  { key: 'leads', label: 'CRM lead records', table: 'leads', ageColumn: 'created_at', ttlMonths: 24, pii: 'Name/email/phone + pipeline data', action: 'anonymize_review' },
];

const IDENT = /^[a-z_][a-z0-9_]*$/; // defense-in-depth: policy identifiers only, never user input

export interface RetentionClassReport {
  key: string;
  label: string;
  table: string;
  ageColumn: string;
  ttlMonths: number;
  cutoff: string;
  total: number;
  expired: number;
  retained: number;
  oldest: string | null;
  pii: string;
  action: RetentionAction;
  error?: string;
}

export interface RetentionReport {
  generatedAt: string;
  dryRun: true; // ALWAYS true — this service never deletes
  enforcement: 'disabled'; // scheduled purge is not wired; gated pending sign-off
  defaultTtlMonths: number;
  classes: RetentionClassReport[];
  totals: { expired: number; total: number; classesOverThreshold: number };
  note: string;
}

function clampTtl(months?: number): number {
  if (!months || !Number.isFinite(months)) return RETENTION_DEFAULT_TTL_MONTHS;
  return Math.min(120, Math.max(1, Math.floor(months)));
}

interface AggRow { total: string | number; expired: string | number; oldest: string | Date | null }

/**
 * Build the dry-run report. One aggregate query per class (total / would-expire / oldest).
 * Per-class failures are isolated so one missing table can't sink the whole report.
 * @param ttlMonthsOverride preview a different window; per-class policy TTL applies otherwise.
 */
export async function getRetentionReport(ttlMonthsOverride?: number): Promise<RetentionReport> {
  const override = ttlMonthsOverride != null ? clampTtl(ttlMonthsOverride) : undefined;
  const classes: RetentionClassReport[] = [];

  for (const def of RETENTION_POLICY) {
    const ttlMonths = override ?? def.ttlMonths;
    const cutoff = new Date(Date.now() - ttlMonths * 30 * 24 * 60 * 60 * 1000); // for display only
    const base: RetentionClassReport = {
      key: def.key, label: def.label, table: def.table, ageColumn: def.ageColumn,
      ttlMonths, cutoff: cutoff.toISOString(), total: 0, expired: 0, retained: 0,
      oldest: null, pii: def.pii, action: def.action,
    };

    if (!IDENT.test(def.table) || !IDENT.test(def.ageColumn)) {
      classes.push({ ...base, error: 'invalid_identifier' });
      continue;
    }

    try {
      const rows = (await sequelize.query(
        `SELECT
           COUNT(*)::bigint AS total,
           COUNT(*) FILTER (WHERE "${def.ageColumn}" < NOW() - make_interval(months => :ttl))::bigint AS expired,
           MIN("${def.ageColumn}") AS oldest
         FROM "${def.table}"`,
        { type: QueryTypes.SELECT, replacements: { ttl: ttlMonths } }
      )) as AggRow[];
      const r = rows[0];
      const total = Number(r?.total) || 0;
      const expired = Number(r?.expired) || 0;
      classes.push({
        ...base,
        total,
        expired,
        retained: Math.max(0, total - expired),
        oldest: r?.oldest ? new Date(r.oldest).toISOString() : null,
      });
    } catch (err: any) {
      // Isolate per-class failures (e.g. a table that doesn't exist on this DB).
      classes.push({ ...base, error: err?.constructor?.name || 'QueryError' });
    }
  }

  const expired = classes.reduce((s, c) => s + c.expired, 0);
  const total = classes.reduce((s, c) => s + c.total, 0);
  const classesOverThreshold = classes.filter((c) => c.expired > 0).length;

  return {
    generatedAt: new Date().toISOString(),
    dryRun: true,
    enforcement: 'disabled',
    defaultTtlMonths: RETENTION_DEFAULT_TTL_MONTHS,
    classes,
    totals: { expired, total, classesOverThreshold },
    note: 'Dry-run only — no rows are deleted. Purge enforcement is gated pending sign-off (leads → anonymize, not delete).',
  };
}
