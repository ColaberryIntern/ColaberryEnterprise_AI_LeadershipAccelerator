/**
 * enterpriseIntakeSync - every touch lands on the client's list (W31, Phase 4).
 *
 *     "keep all communications in sync... manage the client until they become an actual
 *      customer"  (Ali, 2026-11-20)
 *
 * Every 5 minutes, for open clients (list built, not signed, not lost), the least recently
 * checked first so every client gets its turn:
 *   - EMAILS: messages in the Colaberry work mailbox (gmail_colaberry ONLY; Ali's personal and
 *     Hotmail mirrors are never read here) whose sender or any To/Cc recipient IS the client's
 *     address, or is at their company domain when it is not a webmail one. Exact matches on the
 *     parsed addresses, never substrings: bob@gmail.com must not pull in jimbob@gmail.com;
 *   - CALLS: later voice calls on their lead that have a transcript, other than the intake call;
 * each becomes one comment on their list with a one-line AI summary, and a "Next:" to-do
 * (owned by Ali, dated) when the touch implies one. Then the list's name shows the stage.
 *
 * Zoom meetings are NOT synced: no Zoom record names the people in a meeting (Phase 4 limit).
 *
 * Once only:
 *   - emails: a watermark on `synced_at` (when the mirror stored the email, so a late arrival
 *     with an old date is still seen) moved by compare-and-set before the comment is posted, and
 *     given back only if the COMMENT fails. The Next to-do is extra: if it fails it is logged and
 *     the touch still counts as posted, so a comment is never posted twice;
 *   - calls: the ids already posted are kept on the row (calls are few per lead, and a call's
 *     transcript arrives after its row is written, so a time watermark would skip it).
 */
import { Op, QueryTypes } from 'sequelize';
import { z } from 'zod';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import { bcPost, bcPut } from '../ops/basecampClient';
import { chatJson } from '../runtime/runtimeAi';
import { env } from '../../config/env';
import { ascii, dueOn, esc, intakeBasecampEnabled, listName } from './enterpriseIntakeBasecamp';
import { FREE_MAIL } from './enterpriseIntakeResearch';

export type Stage = 'Form' | 'Interviewed' | 'Options drafted' | 'Options sent' | 'Proposal sent' | 'Signed' | 'Lost';

export function stageOf(i: Partial<EnterpriseIntake>): Stage {
  if (i.lost_at) return 'Lost';
  if (i.signed_at) return 'Signed';
  if (i.proposal_sent_at) return 'Proposal sent';
  if (i.options_email_sent_at) return 'Options sent';
  if (i.researched_at) return 'Options drafted';
  if (i.understanding_id) return 'Interviewed';
  return 'Form';
}

export const stagedListName = (i: EnterpriseIntake): string => `[${stageOf(i)}] ${listName(i)}`;

export interface Touch {
  kind: 'email' | 'call';
  /** Email: when the mirror stored it (the watermark). Call: when it was logged. */
  mark: Date;
  /** When it happened, for the comment. */
  at: Date;
  who: string;
  subject: string;
  text: string;
  /** Calls: the provider's call id, recorded once posted. */
  ref?: string;
}

const summarySchema = z.object({
  summary: z.string().trim().min(1).max(240),
  next_step: z.string().trim().max(160).default(''),
  due_in_days: z.number().int().min(1).max(14).default(2),
});

const SUMMARY_SYSTEM = [
  'You keep a sales record for Colaberry. Summarize one email or call with a prospect in ONE line',
  '(max 30 words, plain, factual, no em dashes). If it implies something Colaberry must do next,',
  'name it in next_step as a short instruction ("Send the case study they asked for"), else "".',
  'Return JSON {"summary","next_step","due_in_days"}. Never invent anything not in the text.',
].join(' ');

/** One line and maybe a next step. A model failure falls back to the subject, never blocks. */
export async function summarizeTouch(t: Pick<Touch, 'kind' | 'who' | 'subject' | 'text'>): Promise<z.infer<typeof summarySchema>> {
  try {
    const { parsed } = await chatJson(
      'enterprise-intake-touch',
      SUMMARY_SYSTEM,
      `${t.kind.toUpperCase()} ${t.who}\nSubject: ${t.subject}\n\n${t.text.slice(0, 3000)}`,
      undefined,
      250,
    );
    const r = summarySchema.safeParse(parsed);
    if (r.success) return { ...r.data, summary: r.data.summary.replace(/[–—]/g, '-') };
  } catch {
    /* fall through to the subject */
  }
  return { summary: t.subject || `${t.kind} with the client`, next_step: '', due_in_days: 2 };
}

const centralStamp = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);

export function touchHtml(t: Pick<Touch, 'kind' | 'at' | 'who' | 'subject'>, s: { summary: string; next_step: string }): string {
  return [
    `<div><strong>${t.kind === 'email' ? 'Email' : 'Call'}</strong> ${esc(t.who)}, ${esc(centralStamp(t.at))} CT${t.subject ? `: ${esc(t.subject)}` : ''}</div>`,
    `<div>${esc(s.summary)}</div>`,
    s.next_step ? `<div><strong>Next:</strong> ${esc(s.next_step)} (to-do added)</div>` : '',
  ].join('');
}

/**
 * Every address on an email, as plain lower-case strings. `to_addresses` and `cc_addresses` are
 * JSONB arrays of {address} objects, or of bare strings in one older writer.
 */
const ADDRESSES = (col: string) =>
  `SELECT lower(CASE jsonb_typeof(e) WHEN 'string' THEN e #>> '{}' ELSE e->>'address' END) AS a
     FROM jsonb_array_elements(CASE jsonb_typeof(${col}) WHEN 'array' THEN ${col} ELSE '[]'::jsonb END) e`;

export const EMAIL_LIMIT = 50;

/**
 * The client's emails in the work mailbox stored after `since`, oldest first. Matching is exact:
 * the whole address, or the whole domain after the @ (split_part), never a LIKE pattern.
 */
export async function emailTouches(i: EnterpriseIntake, since: Date, limit = EMAIL_LIMIT): Promise<Touch[]> {
  const email = i.email.toLowerCase().trim();
  const domain = email.split('@')[1] || '';
  const byDomain = Boolean(domain) && !FREE_MAIL.has(domain);
  const match = (expr: string) => `(${expr} = :email${byDomain ? ` OR split_part(${expr}, '@', 2) = :domain` : ''})`;
  const rows = (await EnterpriseIntake.sequelize!.query(
    `SELECT m.from_address, m.from_name, m.subject, m.body_text, m.received_at, m.synced_at
       FROM inbox_emails m
      WHERE m.provider = 'gmail_colaberry'
        AND m.synced_at > :since
        AND m.received_at >= :opened
        AND (${match('lower(m.from_address)')}
             OR EXISTS (SELECT 1 FROM (${ADDRESSES('m.to_addresses')} UNION ALL ${ADDRESSES('m.cc_addresses')}) x WHERE ${match('x.a')}))
      ORDER BY m.synced_at ASC
      LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { since, opened: i.createdAt || since, email, domain, limit } },
  )) as Array<{ from_address: string; from_name: string | null; subject: string; body_text: string | null; received_at: Date; synced_at: Date }>;

  // A batch can share one synced_at. If the limit cut through such a group, leave the whole
  // group for the next run (the watermark is strict), unless the page is nothing but that group.
  let page = rows;
  if (rows.length === limit) {
    const last = new Date(rows[rows.length - 1].synced_at).getTime();
    const trimmed = rows.filter((r) => new Date(r.synced_at).getTime() !== last);
    if (trimmed.length) page = trimmed;
  }
  return page.map((r) => {
    const from = r.from_address.toLowerCase();
    const fromClient = from === email || (byDomain && from.split('@')[1] === domain);
    return {
      kind: 'email' as const,
      mark: new Date(r.synced_at),
      at: new Date(r.received_at),
      who: fromClient ? `from ${r.from_name || r.from_address}` : `to the client, from ${r.from_name || r.from_address}`,
      subject: r.subject || '',
      text: r.body_text || '',
    };
  });
}

/** Voice calls on their lead that have a transcript, oldest first, not yet posted. */
export async function callTouches(i: EnterpriseIntake): Promise<Touch[]> {
  if (!i.lead_id) return [];
  const posted = new Set((i.comms_calls_posted as string[] | null) || []);
  const rows = (await EnterpriseIntake.sequelize!.query(
    `SELECT provider_message_id, provider_response->>'transcript' AS transcript, created_at
       FROM communication_logs
      WHERE lead_id = :lead AND channel = 'voice' AND created_at >= :opened
        AND provider_message_id IS NOT NULL AND provider_message_id <> :callId
        AND coalesce(provider_response->>'transcript', '') <> ''
      ORDER BY created_at ASC
      LIMIT 100`,
    { type: QueryTypes.SELECT, replacements: { lead: i.lead_id, opened: i.createdAt || new Date(0), callId: i.call_id || '' } },
  )) as Array<{ provider_message_id: string; transcript: string; created_at: Date }>;
  return rows
    .filter((r) => !posted.has(r.provider_message_id))
    .slice(0, 10)
    .map((r) => ({ kind: 'call' as const, mark: new Date(r.created_at), at: new Date(r.created_at), who: 'with the client', subject: '', text: r.transcript, ref: r.provider_message_id }));
}

const logFailure = (event: string, intakeId: string, err: unknown) =>
  console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake-sync', event, outcome: 'failure', context: { intake_id: intakeId, message: String((err as Error)?.message || err).slice(0, 200) } }));

/** The comment, then the Next to-do. Only the comment's failure is the touch's failure. */
async function postOne(i: EnterpriseIntake, t: Touch): Promise<void> {
  const project = env.enterpriseIntakeBcProjectId;
  const s = await summarizeTouch(t);
  await bcPost(`/buckets/${project}/recordings/${i.bc_todolist_id}/comments.json`, { content: touchHtml(t, s) });
  if (!s.next_step) return;
  const owner = Number(env.enterpriseIntakeBcOwnerId);
  try {
    await bcPost(`/buckets/${project}/todolists/${i.bc_todolist_id}/todos.json`, {
      content: ascii(`Next: ${s.next_step}`).slice(0, 250),
      assignee_ids: owner ? [owner] : [],
      due_on: dueOn(new Date(), s.due_in_days),
      notify: false,
    });
  } catch (err) {
    // The comment (which names the next step) is on the list; never repost it for a to-do.
    logFailure('enterprise_intake_next_todo_failed', i.id, err);
  }
}

/** Move the email watermark from `from` to `to`, only if nobody else moved it first. */
async function advance(id: string, from: Date | null, to: Date | null): Promise<boolean> {
  const [n] = await EnterpriseIntake.update({ comms_email_synced_through: to } as Partial<EnterpriseIntake>, {
    where: { id, comms_email_synced_through: from } as Record<string, unknown>,
  });
  return n === 1;
}

async function syncEmails(i: EnterpriseIntake): Promise<number> {
  let mark: Date | null = i.comms_email_synced_through ?? null;
  const touches = await emailTouches(i, mark || new Date(0));
  let posted = 0;
  for (const t of touches) {
    if (!(await advance(i.id, mark, t.mark))) break; // another run has these
    try {
      await postOne(i, t);
    } catch (err) {
      await advance(i.id, t.mark, mark); // the comment failed: give it back to the next run
      throw err;
    }
    mark = t.mark;
    posted += 1;
  }
  return posted;
}

/**
 * Calls are synced only by the sweep, which runs in the one backend process and holds `busy`
 * for this client, so a plain record-then-post is enough here (no cross-process race exists).
 * The id is recorded before posting and removed again if the comment fails.
 */
async function syncCalls(i: EnterpriseIntake): Promise<number> {
  let posted = 0;
  for (const t of await callTouches(i)) {
    const before = ((i.comms_calls_posted as string[] | null) || []).slice();
    await i.update({ comms_calls_posted: [...before, t.ref as string] });
    try {
      await postOne(i, t);
    } catch (err) {
      await i.update({ comms_calls_posted: before });
      throw err;
    }
    posted += 1;
  }
  return posted;
}

/** Rename the list when the stage changes, so the project reads like a pipeline. */
export async function syncListStage(i: EnterpriseIntake): Promise<boolean> {
  const stage = stageOf(i);
  if (!i.bc_todolist_id || i.bc_list_stage === stage) return false;
  await bcPut(`/buckets/${env.enterpriseIntakeBcProjectId}/todolists/${i.bc_todolist_id}.json`, { name: stagedListName(i) });
  await i.update({ bc_list_stage: stage });
  return true;
}

const busy = new Set<string>();

/** One client: emails, then calls, then the stage in the name. Records that it was checked. */
export async function syncClient(i: EnterpriseIntake): Promise<{ emails: number; calls: number; renamed: boolean }> {
  if (busy.has(i.id)) return { emails: 0, calls: 0, renamed: false };
  busy.add(i.id);
  try {
    await i.update({ comms_checked_at: new Date() });
    const emails = await syncEmails(i);
    const calls = await syncCalls(i);
    const renamed = await syncListStage(i);
    return { emails, calls, renamed };
  } finally {
    busy.delete(i.id);
  }
}

/**
 * The sweep's comms pass. Open clients, least recently checked first (never checked first), so a
 * quiet client cannot hold its place and starve the rest. Closed clients only get their final
 * stage written into the list name, if that has not happened yet.
 */
export async function syncEnterpriseComms(limit = 20): Promise<{ clients: number; touches: number; failed: number }> {
  const out = { clients: 0, touches: 0, failed: 0 };
  if (!intakeBasecampEnabled()) return out;
  const open = await EnterpriseIntake.findAll({
    where: { bc_checklist_ready_at: { [Op.ne]: null }, signed_at: null, lost_at: null } as Record<string, unknown>,
    order: [
      [EnterpriseIntake.sequelize!.literal('comms_checked_at IS NULL'), 'DESC'],
      ['comms_checked_at', 'ASC'],
    ],
    limit,
  });
  for (const i of open) {
    try {
      const r = await syncClient(i);
      out.clients += 1;
      out.touches += r.emails + r.calls;
    } catch (err) {
      out.failed += 1;
      logFailure('enterprise_intake_sync_failed', i.id, err);
    }
  }
  const closed = await EnterpriseIntake.findAll({
    where: {
      bc_todolist_id: { [Op.ne]: null },
      [Op.or]: [{ signed_at: { [Op.ne]: null } }, { lost_at: { [Op.ne]: null } }],
      [Op.and]: [{ [Op.or]: [{ bc_list_stage: null }, { bc_list_stage: { [Op.notIn]: ['Signed', 'Lost'] } }] }],
    } as Record<string | symbol, unknown>,
    limit,
  });
  for (const i of closed) {
    try {
      await syncListStage(i);
    } catch (err) {
      out.failed += 1;
      logFailure('enterprise_intake_stage_failed', i.id, err);
    }
  }
  return out;
}
