import { createHash } from 'crypto';
import { Op } from 'sequelize';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import InboxCommitment from '../../models/InboxCommitment';
import { CaseAssessment } from '../../types/inboxCase';
import { logCaseEvent } from './caseEventLog';
import { redactSecretLikePatterns } from './promptSafety';
import { redactSensitive } from '../../utils/piiRedaction';
import { getColaberryGmailClient, getPersonalGmailClient } from '../inbox/inboxSyncService';

// Commitment ledger (/inbox-zero T8): what ALI owes.
//
// The assessment already extracts commitments_made: { statement, owner,
// evidence, due_at }. caseActionPlanner.buildWaitingActions() turns the ones
// OTHER people made into MARK_WAITING actions — and, correctly, skips the
// ones Ali made, because Ali is not waiting on himself. But that skip was
// the only consumer, so every promise Ali made evaporated at plan time.
// This service is where those go instead: a durable, queryable ledger with
// a due date, so "I'll have that to you Friday" can be surfaced Friday.
//
// Two sources, kept distinct in the `source` column:
//   assessment — commitments the model extracted from the case's evidence.
//   sent_mail  — Ali's OWN outbound mail on the case's threads, read purely
//                to find promises. Behind INBOX_ZERO_SENT_MAIL_COMMITMENTS,
//                default OFF (Ali's approved, narrow carve-out from the
//                two-gate rule). Read-only: creates no case, writes no COS
//                table, never re-enters the loop `-in:sent` exists to
//                prevent (2026-07-14 mail-loop incident, BC #10095332194).
// Every statement passes the same redaction pair the planner uses before
// it is persisted.

// Ali's own name/address, as an assessment's owner fields spell it. The ONE
// definition — the planner's waiting and delegation builders import it, so
// nothing can disagree about who "Ali" is.
export const ALI_OWNER_PATTERN = /^ali(\s|$|@)/i;
export const SENT_MAIL_COMMITMENTS_FLAG = 'INBOX_ZERO_SENT_MAIL_COMMITMENTS';

const SERVICE = 'commitmentLedgerService';

export function sentMailCommitmentsEnabled(): boolean {
  return process.env[SENT_MAIL_COMMITMENTS_FLAG] === 'true';
}

export function commitmentHash(statement: string): string {
  return createHash('sha256').update(statement.trim().toLowerCase().replace(/\s+/g, ' ')).digest('hex');
}

function sanitize(text: string): string {
  return redactSecretLikePatterns(redactSensitive(text)).trim();
}

function parseDueAt(raw: unknown): Date | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface RecordResult {
  created: number;
  skippedExisting: number;
  skippedNotAli: number;
}

/**
 * Record every commitment ALI made, from an assessment, onto the ledger.
 * Idempotent on (case_id, statement_hash). Commitments owned by anyone
 * else are ignored here — those are the WAITING ledger's business.
 */
export async function recordCommitmentsFromAssessment(caseRow: InboxCase, assessment: CaseAssessment | null | undefined): Promise<RecordResult> {
  const result: RecordResult = { created: 0, skippedExisting: 0, skippedNotAli: 0 };
  for (const c of assessment?.commitments_made ?? []) {
    const owner = (c.owner || '').trim();
    if (!owner || !ALI_OWNER_PATTERN.test(owner)) {
      result.skippedNotAli++;
      continue;
    }
    const created = await upsertCommitment(caseRow, {
      statement: c.statement,
      owedTo: null,
      dueAt: parseDueAt((c as { due_at?: unknown }).due_at),
      source: 'assessment',
      sourceItemId: c.evidence?.[0]?.item_id ?? null,
    });
    if (created) result.created++;
    else result.skippedExisting++;
  }
  return result;
}

async function upsertCommitment(
  caseRow: InboxCase,
  input: { statement: string; owedTo: string | null; dueAt: Date | null; source: 'assessment' | 'sent_mail'; sourceItemId: string | null },
): Promise<boolean> {
  const statement = sanitize(input.statement);
  if (!statement) return false;
  const hash = commitmentHash(statement);
  const existing = await InboxCommitment.findOne({ where: { case_id: caseRow.id, statement_hash: hash } });
  if (existing) return false;
  try {
    const row = await InboxCommitment.create({
      case_id: caseRow.id,
      statement,
      statement_hash: hash,
      owed_to: input.owedTo ? sanitize(input.owedTo).slice(0, 255) : null,
      due_at: input.dueAt,
      status: 'OPEN',
      source: input.source,
      source_item_id: input.sourceItemId,
      fulfilled_at: null,
      correlation_id: caseRow.correlation_id,
    });
    await logCaseEvent({
      case_id: caseRow.id,
      item_id: input.sourceItemId ?? undefined,
      event_type: 'commitment_recorded',
      actor_type: 'system',
      actor_id: SERVICE,
      details: { commitment_id: row.id, source: input.source, due_at: input.dueAt?.toISOString() ?? null },
      correlation_id: caseRow.correlation_id,
    });
    return true;
  } catch (err: any) {
    if (err?.name === 'SequelizeUniqueConstraintError') return false; // lost a race with a concurrent re-plan
    throw err;
  }
}

/** Open commitments Ali still owes, soonest due first; undated last. */
export async function listOpenCommitments(): Promise<InboxCommitment[]> {
  const rows = await InboxCommitment.findAll({ where: { status: 'OPEN' } });
  return rows.sort((a, b) => (a.due_at?.getTime() ?? Infinity) - (b.due_at?.getTime() ?? Infinity));
}

/** Open commitments whose due date has passed. An undated commitment is
 * never "overdue" — it is reported as undated instead. */
export async function listOverdueCommitments(asOf: Date = new Date()): Promise<InboxCommitment[]> {
  return InboxCommitment.findAll({ where: { status: 'OPEN', due_at: { [Op.lt]: asOf } } as any, order: [['due_at', 'ASC']] }); // `as any`: Op-keyed where
}

export async function fulfillCommitment(id: string, actorId: string): Promise<InboxCommitment | null> {
  const row = await InboxCommitment.findByPk(id);
  if (!row || row.status !== 'OPEN') return row;
  await row.update({ status: 'FULFILLED', fulfilled_at: new Date(), updated_at: new Date() });
  await logCaseEvent({
    case_id: row.case_id,
    event_type: 'commitment_fulfilled',
    actor_type: 'admin',
    actor_id: actorId,
    details: { commitment_id: row.id },
    correlation_id: row.correlation_id,
  });
  return row;
}

// ─── Sent-mail carve-out (default OFF) ───────────────────────────────────────

// Deterministic first-person promise detector. Deliberately conservative:
// a first-person subject, a future-commitment verb, and a sentence. No LLM.
const PROMISE_RE = /\b(?:I|we)(?:'ll| will| shall| can| am going to| are going to)\s+(?!not\b|never\b)[^.!?\n]{6,200}[.!?]?/gi;

/** Pure: extract first-person promises from a body of text Ali wrote. Exported for tests. */
export function extractPromisesFromText(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(PROMISE_RE)) {
    const s = m[0].replace(/\s+/g, ' ').trim();
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export interface SentMailScanResult {
  enabled: boolean;
  threadsScanned: number;
  messagesScanned: number;
  created: number;
}

/**
 * Read Ali's OWN sent messages on the case's email threads and record any
 * promises found. Returns `enabled:false` and touches NO transport when
 * INBOX_ZERO_SENT_MAIL_COMMITMENTS is not exactly "true".
 */
export async function scanSentMailForCommitments(caseRow: InboxCase, items: InboxCaseItem[]): Promise<SentMailScanResult> {
  const result: SentMailScanResult = { enabled: sentMailCommitmentsEnabled(), threadsScanned: 0, messagesScanned: 0, created: 0 };
  if (!result.enabled) return result;

  const threads = new Map<string, { provider: string; itemId: string }>();
  for (const it of items) {
    if (it.source_type !== 'email' || it.inclusion_status === 'EXCLUDED') continue;
    const tid = (it.snapshot as Record<string, unknown> | null)?.thread_id;
    if (typeof tid === 'string' && !threads.has(tid)) threads.set(tid, { provider: it.provider, itemId: it.id });
  }

  for (const [threadId, { provider, itemId }] of threads) {
    const gmail = provider === 'gmail_personal' ? getPersonalGmailClient() : getColaberryGmailClient();
    if (!gmail) continue;
    let messages: Array<{ labelIds?: string[] | null; snippet?: string | null; payload?: { headers?: Array<{ name?: string | null; value?: string | null }> | null } | null }> = [];
    try {
      const res = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'metadata', metadataHeaders: ['To', 'Date'] });
      messages = (res.data.messages as typeof messages | undefined) ?? [];
      result.threadsScanned++;
    } catch (err: any) {
      console.warn(JSON.stringify({ level: 'warn', service: SERVICE, event: 'sent_mail_scan_thread_failed', outcome: 'partial', error_class: err?.error_class || err?.name || 'UnknownError', context: { case_id: caseRow.id, thread_id: threadId } }));
      continue;
    }
    for (const m of messages) {
      if (!(m.labelIds ?? []).includes('SENT')) continue; // only what ALI sent
      result.messagesScanned++;
      const to = m.payload?.headers?.find((h) => h.name?.toLowerCase() === 'to')?.value ?? null;
      for (const promise of extractPromisesFromText(m.snippet ?? '')) {
        const created = await upsertCommitment(caseRow, { statement: promise, owedTo: to, dueAt: null, source: 'sent_mail', sourceItemId: itemId });
        if (created) result.created++;
      }
    }
  }
  return result;
}
