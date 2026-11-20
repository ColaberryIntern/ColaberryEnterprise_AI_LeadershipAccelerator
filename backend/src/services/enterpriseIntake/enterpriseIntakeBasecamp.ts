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

/**
 * In-process guard. The request path and the sweep run in the same backend process, so this
 * stops them working on the same client at the same moment. The column claims below are the
 * second line: they hold across processes too.
 */
const inFlight = new Set<string>();

async function exclusive<T>(key: string, busy: T, fn: () => Promise<T>): Promise<T> {
  if (inFlight.has(key)) return busy;
  inFlight.add(key);
  try {
    return await fn();
  } finally {
    inFlight.delete(key);
  }
}

type ClaimColumn = 'bc_writeup_posted_at';

/**
 * Claim a once-only step: set its timestamp only where it is still null. Exactly one caller
 * gets `true`, however many arrive together. At most once, on purpose: a duplicate comment on a
 * client's list is worse than a retry, so a failure releases the claim and the sweep tries again.
 */
async function claim(intakeId: string, column: ClaimColumn): Promise<boolean> {
  const [n] = await EnterpriseIntake.update({ [column]: new Date() } as Partial<EnterpriseIntake>, {
    where: { id: intakeId, [column]: null } as Record<string, unknown>,
  });
  return n === 1;
}

async function release(intakeId: string, column: ClaimColumn): Promise<void> {
  await EnterpriseIntake.update({ [column]: null } as Partial<EnterpriseIntake>, { where: { id: intakeId } });
}

interface ListTodo { id: number; content: string; completed: boolean }

/** Every to-do on the list, open and done. Basecamp lists the two separately. */
export async function listTodos(project: string, listId: string): Promise<ListTodo[]> {
  const path = `/buckets/${project}/todolists/${listId}/todos.json`;
  const open = await bcGetAll<{ id: number; content: string }>(path);
  const done = await bcGetAll<{ id: number; content: string }>(`${path}?completed=true`);
  return [...open.map((t) => ({ ...t, completed: false })), ...done.map((t) => ({ ...t, completed: true }))];
}

/**
 * Tick one checklist step. True once the step is done (now or before); false when the step is
 * not on the list yet (the checklist is still being built), so the caller can try again later.
 */
export async function tickStep(project: string, listId: string, key: string): Promise<boolean> {
  const step = CHECKLIST.find((s) => s.key === key);
  if (!step) throw new Error(`unknown checklist step ${key}`);
  const todo = (await listTodos(project, listId)).find((t) => t.content === checklistTitle(step));
  if (!todo) return false;
  if (!todo.completed) await bcPost(`/buckets/${project}/todos/${todo.id}/completion.json`, {});
  return true;
}

/**
 * Open the client's list and make sure its whole checklist is on it. Safe to call again and
 * again: the list is created once (its id is saved before anything else), and every later call
 * adds only the steps that are missing, so a run that failed halfway is finished by the next.
 * `bc_checklist_ready_at` marks a list that is complete.
 */
export async function openClientList(
  intakeId: string,
): Promise<'opened' | 'repaired' | 'exists' | 'off' | 'missing' | 'busy'> {
  if (!intakeBasecampEnabled()) return 'off';
  return exclusive(`list:${intakeId}`, 'busy' as const, async () => {
    const intake = await EnterpriseIntake.findByPk(intakeId);
    if (!intake) return 'missing';
    if (intake.bc_todolist_id && intake.bc_checklist_ready_at) return 'exists';

    const project = env.enterpriseIntakeBcProjectId;
    let created = false;
    if (!intake.bc_todolist_id) {
      const ts = await todosetId(project);
      const list = await bcPost<{ id: number }>(`/buckets/${project}/todosets/${ts}/todolists.json`, {
        name: listName(intake),
        description: listDescription(intake),
      });
      await intake.update({ bc_todolist_id: String(list.id) });
      created = true;
    }
    const listId = intake.bc_todolist_id as string;

    const have = created ? [] : await listTodos(project, listId);
    const opened = intake.createdAt || new Date();
    const owner = Number(env.enterpriseIntakeBcOwnerId);
    for (const step of CHECKLIST) {
      const existing = have.find((t) => t.content === checklistTitle(step));
      let id = existing?.id;
      if (!existing) {
        const todo = await bcPost<{ id: number }>(`/buckets/${project}/todolists/${listId}/todos.json`, {
          content: checklistTitle(step),
          assignee_ids: owner ? [owner] : [],
          due_on: dueOn(opened, step.days),
          notify: false,
        });
        id = todo.id;
      }
      // The form step is done the moment the list exists: the answers are its description.
      if (step.key === 'form' && !existing?.completed) {
        await bcPost(`/buckets/${project}/todos/${id}/completion.json`, {});
      }
    }
    await intake.update({ bc_checklist_ready_at: new Date() });
    log('enterprise_intake_list_opened', 'success', { intake_id: intake.id, todolist_id: listId, created });
    return created ? 'opened' : 'repaired';
  });
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
 * Post the interview's write-up and transcript on the client's list (once, by claim), then tick
 * the interview to-do (retried until it lands, recorded in `bc_interview_ticked_at`).
 */
export async function postInterviewToList(
  intakeId: string,
): Promise<'posted' | 'ticked' | 'off' | 'missing' | 'not_ready' | 'done' | 'busy'> {
  if (!intakeBasecampEnabled()) return 'off';
  return exclusive(`interview:${intakeId}`, 'busy' as const, async () => {
    const intake = await EnterpriseIntake.findByPk(intakeId);
    if (!intake) return 'missing';
    if (intake.bc_writeup_posted_at && intake.bc_interview_ticked_at) return 'done';
    if (!intake.bc_todolist_id || !intake.bc_checklist_ready_at || !intake.understanding_id) return 'not_ready';

    const project = env.enterpriseIntakeBcProjectId;
    let posted = false;
    if (!intake.bc_writeup_posted_at && (await claim(intake.id, 'bc_writeup_posted_at'))) {
      try {
        const record = await ProjectUnderstandingRecord.findByPk(intake.understanding_id);
        const items = ((record?.items as Array<{ dimension: string; value: string }>) || []).map((x) => ({
          dimension: x.dimension,
          value: x.value,
        }));
        const via = intake.interviewed_via === 'call' ? 'by phone' : 'typed';
        const content = [
          `<div><strong>AI interview done (${via}).</strong> ${items.length} facts in the write-up.</div><br>`,
          writeupHtml(items),
          '<br><div><strong>Transcript</strong></div>',
          transcriptHtml(intake.transcript),
        ].join('');
        await bcPost(`/buckets/${project}/recordings/${intake.bc_todolist_id}/comments.json`, { content });
        posted = true;
        log('enterprise_intake_interview_posted', 'success', { intake_id: intake.id, facts: items.length });
      } catch (err) {
        await release(intake.id, 'bc_writeup_posted_at');
        throw err;
      }
    }

    if (!intake.bc_interview_ticked_at && (await tickStep(project, intake.bc_todolist_id, 'interview'))) {
      await intake.update({ bc_interview_ticked_at: new Date() });
      return posted ? 'posted' : 'ticked';
    }
    return posted ? 'posted' : 'not_ready';
  });
}

/** Fire-and-forget wrappers for the request path: log, never throw. */
export function openClientListSoon(intakeId: string): void {
  openClientList(intakeId).catch((err) => log('enterprise_intake_list_failed', 'failure', { intake_id: intakeId }, err));
}

export function postInterviewSoon(intakeId: string): void {
  postInterviewToList(intakeId).catch((err) => log('enterprise_intake_interview_post_failed', 'failure', { intake_id: intakeId }, err));
}

/**
 * The sweep: finish any list the form's own attempt missed or left half-built, and post or tick
 * any interview still waiting. Only rows older than a minute, so it rarely meets the request
 * path, and the guards above make it harmless when it does. Bounded per run.
 */
export async function syncEnterpriseIntakesToBasecamp(limit = 20): Promise<{ opened: number; posted: number; failed: number }> {
  const out = { opened: 0, posted: 0, failed: 0 };
  if (!intakeBasecampEnabled()) return out;
  const before = new Date(Date.now() - 60_000);

  const unready = await EnterpriseIntake.findAll({
    where: { bc_checklist_ready_at: null, created_at: { [Op.lt]: before } } as Record<string, unknown>,
    order: [['created_at', 'ASC']],
    limit,
  });
  for (const i of unready) {
    try {
      const r = await openClientList(i.id);
      if (r === 'opened' || r === 'repaired') out.opened += 1;
    } catch (err) {
      out.failed += 1;
      log('enterprise_intake_list_failed', 'failure', { intake_id: i.id, via: 'sweep' }, err);
    }
  }

  const waiting = await EnterpriseIntake.findAll({
    where: {
      bc_checklist_ready_at: { [Op.ne]: null },
      understanding_id: { [Op.ne]: null },
      interviewed_at: { [Op.lt]: before },
      [Op.or]: [{ bc_writeup_posted_at: null }, { bc_interview_ticked_at: null }],
    } as Record<string | symbol, unknown>,
    order: [['interviewed_at', 'ASC']],
    limit,
  });
  for (const i of waiting) {
    try {
      const r = await postInterviewToList(i.id);
      if (r === 'posted' || r === 'ticked') out.posted += 1;
    } catch (err) {
      out.failed += 1;
      log('enterprise_intake_interview_post_failed', 'failure', { intake_id: i.id, via: 'sweep' }, err);
    }
  }
  return out;
}
