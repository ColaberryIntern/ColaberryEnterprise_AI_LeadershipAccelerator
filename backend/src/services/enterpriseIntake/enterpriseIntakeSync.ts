/**
 * enterpriseIntakeSync - every touch lands on the client's list (W31, Phase 4).
 *
 *     "keep all communications in sync... manage the client until they become an actual
 *      customer"  (Ali, 2026-11-20)
 *
 * Every 5 minutes, for each open client (list built, not signed, not lost):
 *   - EMAILS: messages in the Colaberry work mailbox (gmail_colaberry ONLY; Ali's personal and
 *     Hotmail mirrors are never read here) from or to the client's address, or their company
 *     domain when it is not a webmail one, since the form arrived;
 *   - CALLS: any later voice call logged against their lead, other than the intake call;
 * each becomes one comment on their list with a one-line AI summary, and a "Next:" to-do
 * (owned by Ali, dated) when the touch implies one. Then the list's name is set to show the
 * stage: Form, Interviewed, Options drafted, Options sent, Proposal sent, Signed, Lost.
 *
 * Zoom meetings are NOT synced: no Zoom record names the people in a meeting (Phase 4 limit).
 *
 * Once only: each channel has a watermark that is moved forward by compare-and-set BEFORE a
 * comment is posted, so two runs can never post the same touch. A failed post moves it back.
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
  at: Date;
  who: string;
  subject: string;
  text: string;
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
export async function summarizeTouch(t: Touch): Promise<z.infer<typeof summarySchema>> {
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

export function touchHtml(t: Touch, s: { summary: string; next_step: string }): string {
  return [
    `<div><strong>${t.kind === 'email' ? 'Email' : 'Call'}</strong> ${esc(t.who)}, ${esc(centralStamp(t.at))} CT${t.subject ? `: ${esc(t.subject)}` : ''}</div>`,
    `<div>${esc(s.summary)}</div>`,
    s.next_step ? `<div><strong>Next:</strong> ${esc(s.next_step)} (to-do added)</div>` : '',
  ].join('');
}

/** The client's emails in the work mailbox since `since`, oldest first. */
export async function emailTouches(i: EnterpriseIntake, since: Date, limit = 10): Promise<Touch[]> {
  const email = i.email.toLowerCase().trim();
  const domain = email.split('@')[1] || '';
  const byDomain = domain && !FREE_MAIL.has(domain);
  const rows = (await EnterpriseIntake.sequelize!.query(
    `SELECT from_address, from_name, to_addresses, subject, body_text, received_at
       FROM inbox_emails
      WHERE provider = 'gmail_colaberry'
        AND received_at > :since
        AND (lower(from_address) = :email OR to_addresses::text ILIKE :emailLike
             ${byDomain ? 'OR lower(from_address) LIKE :domainLike OR to_addresses::text ILIKE :domainLike' : ''})
      ORDER BY received_at ASC
      LIMIT :limit`,
    {
      type: QueryTypes.SELECT,
      replacements: { since, email, emailLike: `%${email}%`, domainLike: `%@${domain}`, limit },
    },
  )) as Array<{ from_address: string; from_name: string | null; to_addresses: unknown; subject: string; body_text: string | null; received_at: Date }>;
  return rows.map((r) => {
    const fromClient = r.from_address.toLowerCase() === email || (byDomain && r.from_address.toLowerCase().endsWith(`@${domain}`));
    return {
      kind: 'email' as const,
      at: new Date(r.received_at),
      who: fromClient ? `from ${r.from_name || r.from_address}` : `to the client, from ${r.from_name || r.from_address}`,
      subject: r.subject || '',
      text: r.body_text || '',
    };
  });
}

/** Later voice calls on their lead, oldest first. The intake call itself is already on the list. */
export async function callTouches(i: EnterpriseIntake, since: Date, limit = 10): Promise<Touch[]> {
  if (!i.lead_id) return [];
  const rows = (await EnterpriseIntake.sequelize!.query(
    `SELECT provider_message_id, provider_response, created_at
       FROM communication_logs
      WHERE lead_id = :lead AND channel = 'voice' AND created_at > :since
        AND (provider_message_id IS NULL OR provider_message_id <> :callId)
      ORDER BY created_at ASC
      LIMIT :limit`,
    { type: QueryTypes.SELECT, replacements: { lead: i.lead_id, since, callId: i.call_id || '', limit } },
  )) as Array<{ provider_response: Record<string, unknown> | null; created_at: Date }>;
  return rows
    .map((r) => ({
      kind: 'call' as const,
      at: new Date(r.created_at),
      who: 'with the client',
      subject: '',
      text: String((r.provider_response || {}).transcript || ''),
    }))
    .filter((t) => t.text.trim().length > 0);
}

type Watermark = 'comms_email_synced_through' | 'comms_calls_synced_through';

/** Move a watermark from `from` to `to`, only if nobody else moved it first. */
async function advance(id: string, column: Watermark, from: Date | null, to: Date | null): Promise<boolean> {
  const [n] = await EnterpriseIntake.update({ [column]: to } as Partial<EnterpriseIntake>, {
    where: { id, [column]: from === null ? null : from } as Record<string, unknown>,
  });
  return n === 1;
}

async function postTouches(i: EnterpriseIntake, column: Watermark, touches: Touch[]): Promise<number> {
  const project = env.enterpriseIntakeBcProjectId;
  const owner = Number(env.enterpriseIntakeBcOwnerId);
  let mark: Date | null = i[column] ?? null;
  let posted = 0;
  for (const t of touches) {
    if (!(await advance(i.id, column, mark, t.at))) break; // another run has these
    try {
      const s = await summarizeTouch(t);
      await bcPost(`/buckets/${project}/recordings/${i.bc_todolist_id}/comments.json`, { content: touchHtml(t, s) });
      if (s.next_step) {
        await bcPost(`/buckets/${project}/todolists/${i.bc_todolist_id}/todos.json`, {
          content: ascii(`Next: ${s.next_step}`).slice(0, 250),
          assignee_ids: owner ? [owner] : [],
          due_on: dueOn(new Date(), s.due_in_days),
          notify: false,
        });
      }
    } catch (err) {
      await advance(i.id, column, t.at, mark); // give it back to the next run
      throw err;
    }
    mark = t.at;
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

/** One client: emails, then calls, then the stage in the name. */
export async function syncClient(i: EnterpriseIntake): Promise<{ emails: number; calls: number; renamed: boolean }> {
  if (busy.has(i.id)) return { emails: 0, calls: 0, renamed: false };
  busy.add(i.id);
  try {
    const opened = i.createdAt || new Date();
    const emails = await postTouches(i, 'comms_email_synced_through', await emailTouches(i, i.comms_email_synced_through || opened));
    const calls = await postTouches(i, 'comms_calls_synced_through', await callTouches(i, i.comms_calls_synced_through || opened));
    const renamed = await syncListStage(i);
    return { emails, calls, renamed };
  } finally {
    busy.delete(i.id);
  }
}

/** The sweep's comms pass: open clients with a finished list, a bounded batch per run. */
export async function syncEnterpriseComms(limit = 20): Promise<{ clients: number; touches: number; failed: number }> {
  const out = { clients: 0, touches: 0, failed: 0 };
  if (!intakeBasecampEnabled()) return out;
  const open = await EnterpriseIntake.findAll({
    where: { bc_checklist_ready_at: { [Op.ne]: null }, signed_at: null, lost_at: null } as Record<string, unknown>,
    order: [['updated_at', 'ASC']],
    limit,
  });
  for (const i of open) {
    try {
      const r = await syncClient(i);
      out.clients += 1;
      out.touches += r.emails + r.calls;
    } catch (err) {
      out.failed += 1;
      console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake-sync', event: 'enterprise_intake_sync_failed', outcome: 'failure', context: { intake_id: i.id, message: String((err as Error)?.message || err).slice(0, 200) } }));
    }
  }
  return out;
}

