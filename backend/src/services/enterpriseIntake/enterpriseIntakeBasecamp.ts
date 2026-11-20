/**
 * enterpriseIntakeBasecamp - every Enterprise client gets a to-do list in Basecamp (W29, Phase 2).
 *
 *     "I want each client to have a list in a NEW Colaberry Enterprise Intake project in BC.
 *      Each client gets their own list... checklist... manage the client until they become an
 *      actual customer."  (Ali, 2026-11-20. Q4 A: Ali owns every client list.)
 *
 * The form opens the list (form answers, a link to the lead, and the checklist from the plan).
 * The end of the interview posts the write-up and the transcript on it and ticks the interview
 * to-do. Later phases add to the same list.
 *
 * NOTHING HERE MAY BREAK THE INTAKE. Every entry point is called after the visitor already has
 * their answer, and failures are logged, never thrown at them. A 5-minute sweep
 * (`syncEnterpriseIntakesToBasecamp`) retries whatever Basecamp missed, so an outage delays a
 * client's list and never loses it.
 *
 * Off unless BASECAMP_ENTERPRISE_INTAKE_PROJECT_ID is set: no project, no writes.
 */
import { Op } from 'sequelize';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { bcGet, bcGetAll, bcPost } from '../ops/basecampClient';
import { env } from '../../config/env';

/** One checklist step. `days` is the due date, counted from the day the form arrived. */
export interface ChecklistStep {
  key: string;
  title: string;
  who: 'AI' | 'Team' | 'Ali';
  days: number;
}

/**
 * The checklist from the plan (2026-11-20). Every to-do is assigned to Ali (Q4 A) and has a due
 * date. `who` says who actually does the work, so the list reads like the plan: AI steps are the
 * ones Claude Code ticks off itself.
 */
export const CHECKLIST: readonly ChecklistStep[] = [
  { key: 'form', title: 'Form answers and lead link on this list', who: 'AI', days: 0 },
  { key: 'interview', title: 'AI interview done: write-up and transcript on this list', who: 'AI', days: 0 },
  { key: 'research', title: 'Company research brief (site, size, news, systems)', who: 'AI', days: 1 },
  { key: 'options', title: 'Assess fit (build, guide or train) and draft 2-3 pilot options', who: 'Team', days: 2 },
  { key: 'meeting', title: 'Book the scoping meeting', who: 'Team', days: 3 },
  { key: 'proposal', title: 'Draft the proposal from the write-up and meeting notes', who: 'AI', days: 5 },
  { key: 'approve', title: 'Approve and send the proposal', who: 'Ali', days: 7 },
  { key: 'follow', title: 'Follow up every week until yes or no', who: 'Team', days: 14 },
  { key: 'signed', title: 'Signed: create the client project and portal login', who: 'AI', days: 30 },
];

export const checklistTitle = (s: ChecklistStep): string => `${s.who}: ${s.title}`;

export const intakeBasecampEnabled = (): boolean => Boolean(env.enterpriseIntakeBcProjectId);

/** Basecamp rule for this repo: ASCII only. Accents are folded, anything else dropped. */
export function ascii(v: unknown): string {
  return String(v ?? '')
    .normalize('NFKD')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

/** ASCII, then HTML-escaped, for Basecamp rich text. */
export function esc(v: unknown): string {
  return ascii(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** YYYY-MM-DD in Central time, `days` after `from`. Ali works in Central. */
export function dueOn(from: Date, days: number): string {
  const d = new Date(from.getTime() + days * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function listName(i: Pick<EnterpriseIntake, 'company' | 'full_name'>): string {
  return ascii(`${i.company || 'Unknown company'} - ${i.full_name}`).slice(0, 200);
}

const yearly = (h: number | null): string => (h === null || h === undefined ? '' : ` (about ${Math.round(Number(h) * 52).toLocaleString('en-US')} hours a year)`);

/** The list description: every answer from the form, and where the lead lives. */
export function listDescription(i: EnterpriseIntake): string {
  const row = (k: string, v: unknown) => `<li><strong>${esc(k)}:</strong> ${esc(v === null || v === undefined || v === '' ? 'not stated' : v)}</li>`;
  const lead = i.lead_id ? `${env.frontendUrl.replace(/\/$/, '')}/admin/leads/${i.lead_id}` : '';
  return [
    `<div><strong>Booked a demo pilot ${esc(dueOn(i.createdAt || new Date(), 0))}.</strong> ${lead ? `<a href="${esc(lead)}">Lead ${i.lead_id}</a>` : 'No lead record.'}</div>`,
    '<ul>',
    row('Name', i.full_name),
    row('Role', i.role),
    row('Email', i.email),
    row('Phone', i.phone),
    row('AI may call', i.call_consent ? 'yes' : 'no'),
    row('Website', i.website),
    row('Service', i.service),
    row('Department', i.department),
    row('When they want to start', i.start_timing),
    row('People who do it today', i.people_count),
    row('Hours a week in total', i.hours_per_week === null ? null : `${Number(i.hours_per_week)}${yearly(i.hours_per_week)}`),
    row('What AI needs to return', i.required_return),
    row('Who else decides', i.other_deciders),
    '</ul>',
    `<div><strong>The process</strong></div><div>${esc(i.process).replace(/\n/g, '<br>')}</div>`,
  ].join('');
}

let todosetCache: { project: string; id: number } | null = null;

async function todosetId(project: string): Promise<number> {
  if (todosetCache?.project === project) return todosetCache.id;
  const p = await bcGet<{ dock?: Array<{ name: string; id: number; enabled?: boolean }> }>(`/projects/${project}.json`);
  const ts = (p.dock || []).find((d) => d.name === 'todoset');
  if (!ts) throw new Error(`Basecamp project ${project} has no to-do set`);
  todosetCache = { project, id: ts.id };
  return ts.id;
}

const log = (event: string, outcome: string, context: Record<string, unknown>, err?: unknown) => {
  const line = {
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'enterprise-intake-basecamp',
    event,
    outcome,
    ...(err ? { error_class: (err as Error)?.name || 'Error' } : {}),
    context: { ...context, ...(err ? { message: String((err as Error)?.message || err).slice(0, 300) } : {}) },
  };
  (outcome === 'failure' ? console.error : console.log)(JSON.stringify(line));
};

/** In-process guard so the form's own call and the sweep never open two lists for one client. */
const inFlight = new Set<string>();

/**
 * Open the client's list, once. Safe to call repeatedly: a row that already has a list is left
 * alone. The list id is saved before the to-dos are added, so a failure halfway can never lead
 * to a second list for the same client.
 */
export async function openClientList(intakeId: string): Promise<'opened' | 'exists' | 'off' | 'missing' | 'busy'> {
  if (!intakeBasecampEnabled()) return 'off';
  if (inFlight.has(intakeId)) return 'busy';
  inFlight.add(intakeId);
  try {
    const intake = await EnterpriseIntake.findByPk(intakeId);
    if (!intake) return 'missing';
    if (intake.bc_todolist_id) return 'exists';

    const project = env.enterpriseIntakeBcProjectId;
    const ts = await todosetId(project);
    const list = await bcPost<{ id: number; app_url: string }>(`/buckets/${project}/todosets/${ts}/todolists.json`, {
      name: listName(intake),
      description: listDescription(intake),
    });
    await intake.update({ bc_todolist_id: String(list.id) });

    const opened = intake.createdAt || new Date();
    const owner = Number(env.enterpriseIntakeBcOwnerId);
    for (const step of CHECKLIST) {
      const todo = await bcPost<{ id: number }>(`/buckets/${project}/todolists/${list.id}/todos.json`, {
        content: checklistTitle(step),
        assignee_ids: owner ? [owner] : [],
        due_on: dueOn(opened, step.days),
        notify: false,
      });
      // The form step is done the moment the list exists: the answers are its description.
      if (step.key === 'form') await bcPost(`/buckets/${project}/todos/${todo.id}/completion.json`, {});
    }
    log('enterprise_intake_list_opened', 'success', { intake_id: intake.id, todolist_id: list.id });
    return 'opened';
  } finally {
    inFlight.delete(intakeId);
  }
}

/** The write-up, grouped the way the extractor files it, as Basecamp rich text. */
export function writeupHtml(items: Array<{ dimension: string; value: string }>): string {
  if (!items.length) return '<div>The write-up found nothing to record.</div>';
  const groups = new Map<string, string[]>();
  for (const it of items) {
    const k = String(it.dimension || 'other').replace(/_/g, ' ');
    groups.set(k, [...(groups.get(k) || []), it.value]);
  }
  return Array.from(groups.entries())
    .map(([k, vs]) => `<div><strong>${esc(k.charAt(0).toUpperCase() + k.slice(1))}</strong></div><ul>${vs.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`)
    .join('');
}

export function transcriptHtml(transcript: string | null): string {
  const t = ascii(transcript || '').trim();
  if (!t) return '<div>No transcript was kept.</div>';
  return t
    .split(/\n+/)
    .map((l) => `<div>${esc(l)}</div>`)
    .join('');
}

/**
 * Post the interview's write-up and transcript on the client's list, then tick the interview
 * to-do. Runs once per intake: `bc_writeup_posted_at` is set only after the comment lands.
 */
export async function postInterviewToList(intakeId: string): Promise<'posted' | 'off' | 'missing' | 'not_ready' | 'done'> {
  if (!intakeBasecampEnabled()) return 'off';
  const intake = await EnterpriseIntake.findByPk(intakeId);
  if (!intake) return 'missing';
  if (intake.bc_writeup_posted_at) return 'done';
  if (!intake.bc_todolist_id || intake.status === 'form' || !intake.understanding_id) return 'not_ready';

  const project = env.enterpriseIntakeBcProjectId;
  const record = await ProjectUnderstandingRecord.findByPk(intake.understanding_id);
  const items = ((record?.items as any[]) || []).map((x) => ({ dimension: x.dimension, value: x.value }));
  const via = intake.interviewed_via === 'call' ? 'by phone' : 'typed';
  const content = [
    `<div><strong>AI interview done (${via}).</strong> ${items.length} facts in the write-up.</div><br>`,
    writeupHtml(items),
    '<br><div><strong>Transcript</strong></div>',
    transcriptHtml(intake.transcript),
  ].join('');
  await bcPost(`/buckets/${project}/recordings/${intake.bc_todolist_id}/comments.json`, { content });
  await intake.update({ bc_writeup_posted_at: new Date() });

  const interviewTitle = checklistTitle(CHECKLIST.find((s) => s.key === 'interview')!);
  const todos = await bcGetAll<{ id: number; content: string }>(`/buckets/${project}/todolists/${intake.bc_todolist_id}/todos.json`);
  const todo = todos.find((t) => t.content === interviewTitle);
  if (todo) await bcPost(`/buckets/${project}/todos/${todo.id}/completion.json`, {});
  log('enterprise_intake_interview_posted', 'success', { intake_id: intake.id, facts: items.length });
  return 'posted';
}

/** Fire-and-forget wrappers for the request path: log, never throw. */
export function openClientListSoon(intakeId: string): void {
  openClientList(intakeId).catch((err) => log('enterprise_intake_list_failed', 'failure', { intake_id: intakeId }, err));
}

export function postInterviewSoon(intakeId: string): void {
  postInterviewToList(intakeId).catch((err) => log('enterprise_intake_interview_post_failed', 'failure', { intake_id: intakeId }, err));
}

/**
 * The sweep: open any list the form's own attempt missed, and post any interview still waiting.
 * Only rows older than a minute, so it never races the request path. Bounded per run.
 */
export async function syncEnterpriseIntakesToBasecamp(limit = 20): Promise<{ opened: number; posted: number; failed: number }> {
  const out = { opened: 0, posted: 0, failed: 0 };
  if (!intakeBasecampEnabled()) return out;
  const before = new Date(Date.now() - 60_000);

  const unopened = await EnterpriseIntake.findAll({
    where: { bc_todolist_id: null, created_at: { [Op.lt]: before } } as any,
    order: [['created_at', 'ASC']],
    limit,
  });
  for (const i of unopened) {
    try {
      if ((await openClientList(i.id)) === 'opened') out.opened += 1;
    } catch (err) {
      out.failed += 1;
      log('enterprise_intake_list_failed', 'failure', { intake_id: i.id, via: 'sweep' }, err);
    }
  }

  const waiting = await EnterpriseIntake.findAll({
    where: {
      bc_todolist_id: { [Op.ne]: null },
      bc_writeup_posted_at: null,
      understanding_id: { [Op.ne]: null },
      interviewed_at: { [Op.lt]: before },
    } as any,
    order: [['interviewed_at', 'ASC']],
    limit,
  });
  for (const i of waiting) {
    try {
      if ((await postInterviewToList(i.id)) === 'posted') out.posted += 1;
    } catch (err) {
      out.failed += 1;
      log('enterprise_intake_interview_post_failed', 'failure', { intake_id: i.id, via: 'sweep' }, err);
    }
  }
  return out;
}
