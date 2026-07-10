/**
 * workforceService — the AI Workforce Operating System orchestrator. Wraps the
 * frozen Operations-Center director analyses as a living AI organization: a
 * roster with workload, each employee's office, the Chief of Staff briefing, a
 * daily leadership meeting that assigns work + writes memory + sparks cross-
 * department communication, and performance reviews. Consumes ops read-only;
 * persists the workforce's own tasks/meetings/memory/messages.
 */
import { Op } from 'sequelize';
import WorkforceTask from '../../models/WorkforceTask';
import WorkforceMeeting from '../../models/WorkforceMeeting';
import WorkforceMemory from '../../models/WorkforceMemory';
import WorkforceMessage from '../../models/WorkforceMessage';
import { AI_ORG, findEmployee, directors, chiefOfStaff, AiEmployee } from './orgRegistry';
import { gatherSignals } from '../ops/schoolSignals';
import { runDirectors, rankRecommendations, Director } from '../ops/directors';
import { generateBriefing } from '../ops/executiveBriefing';
import { computeSchoolHealth } from '../ops/schoolHealth';

const OPEN = ['assigned', 'planning', 'working', 'needs_approval'];
const today = () => new Date().toISOString().slice(0, 10);
const pub = (e: AiEmployee) => ({ slug: e.slug, name: e.name, role: e.role, department: e.department, avatar: e.avatar, supervisor: e.supervisor, mission: e.mission, ops_domain: e.ops_domain });

/** The org roster with live workload (open task count) per employee. */
export async function roster() {
  const tasks = await WorkforceTask.findAll({ where: { status: { [Op.in]: OPEN } }, attributes: ['employee_slug'] });
  const load = new Map<string, number>();
  tasks.forEach((t) => load.set(t.employee_slug, (load.get(t.employee_slug) || 0) + 1));
  return {
    employees: AI_ORG.map((e) => ({ ...pub(e), workload: load.get(e.slug) || 0, status: (load.get(e.slug) || 0) > 3 ? 'busy' : 'active' })),
    hierarchy: { ceo: 'ceo', chief_of_staff: 'chief_of_staff', directors: directors().map((d) => d.slug) },
  };
}

/** One AI Employee's office. */
export async function office(slug: string) {
  const e = findEmployee(slug);
  if (!e) throw Object.assign(new Error('Employee not found'), { status: 404 });
  const [tasks, memory, messages] = await Promise.all([
    WorkforceTask.findAll({ where: { employee_slug: slug }, order: [['updated_at', 'DESC']], limit: 30 }),
    WorkforceMemory.findAll({ where: { employee_slug: slug }, order: [['created_at', 'DESC']], limit: 20 }),
    WorkforceMessage.findAll({ where: { [Op.or]: [{ from_slug: slug }, { to_slug: slug }] }, order: [['created_at', 'DESC']], limit: 20 }),
  ]);
  return {
    employee: { ...pub(e), responsibilities: e.responsibilities, kpis: e.kpis },
    tasks: tasks.map((t) => t.toJSON()),
    memory: memory.map((m) => m.toJSON()),
    messages: messages.map((m) => m.toJSON()),
    review: await review(slug),
  };
}

/** Chief of Staff morning briefing (consumes the ops signals + directors). */
export async function briefing() {
  const signals = await gatherSignals();
  const health = computeSchoolHealth(signals);
  const dirs = runDirectors(signals);
  const brief = await generateBriefing(signals, health, dirs);
  return { by: pub(chiefOfStaff()), health, briefing: brief, generated_at: signals.generated_at };
}

const DOMAIN_TO_SLUG: Record<string, string> = { student_success: 'student_success', career: 'career', certification: 'certification', curriculum: 'curriculum', finance: 'finance', operations: 'operations', community: 'community' };

/** Run (or fetch) today's daily leadership meeting. Idempotent per day; on first
 *  run it assigns action-item tasks, writes each participant's memory, and sparks
 *  cross-department messages. */
export async function runDailyMeeting() {
  const date = today();
  const existing = await WorkforceMeeting.findOne({ where: { meeting_date: date } });
  if (existing) return { meeting: existing.toJSON(), created: false };

  const signals = await gatherSignals();
  const health = computeSchoolHealth(signals);
  const dirs = runDirectors(signals);
  const brief = await generateBriefing(signals, health, dirs);
  const dirByDomain = new Map<string, Director>(dirs.map((d) => [d.domain, d]));

  // Each director employee contributes a line; non-ops directors speak to their mission.
  const contributions = directors().map((emp) => {
    const d = emp.ops_domain ? dirByDomain.get(emp.ops_domain) : undefined;
    const line = d ? `${d.headline}${d.recommendations[0] ? ` — recommending: ${d.recommendations[0].title}` : ''}` : `${emp.mission}`;
    return { slug: emp.slug, name: emp.name, role: emp.role, line };
  });

  const ranked = rankRecommendations(dirs);
  const action_items = ranked.slice(0, 6).map((r) => ({ owner: DOMAIN_TO_SLUG[r.domain] || 'chief_of_staff', title: r.title, rec_key: r.key, severity: r.severity }));
  const participants = [chiefOfStaff().slug, ...directors().map((d) => d.slug)];

  const agenda = {
    yesterday: brief.yesterday,
    priorities: brief.priorities,
    risks: brief.risks,
    opportunities: brief.wins,
    cross_department: crossDept(signals),
  };
  const meeting = await WorkforceMeeting.create({ meeting_date: date, agenda, participants, contributions, action_items, notes: brief.good_morning });

  // Assign action items as tasks (dedup by rec_key + open) + write memory + spark messages.
  for (const a of action_items) {
    const dupe = await WorkforceTask.findOne({ where: { source_rec_key: a.rec_key, status: { [Op.in]: OPEN } } });
    if (!dupe) await WorkforceTask.create({ employee_slug: a.owner, title: a.title, status: 'assigned', priority: a.severity === 'high' ? 'high' : a.severity === 'low' ? 'low' : 'medium', approver: 'chief_of_staff', source_rec_key: a.rec_key });
  }
  for (const c of contributions) await WorkforceMemory.create({ employee_slug: c.slug, kind: 'meeting', content: `Daily meeting ${date}: ${c.line}`, ref: date });
  await WorkforceMemory.create({ employee_slug: chiefOfStaff().slug, kind: 'meeting', content: `Chaired the daily meeting ${date}; ${action_items.length} action items assigned.`, ref: date });
  for (const m of crossMessages(signals)) await WorkforceMessage.create(m);

  return { meeting: (await WorkforceMeeting.findOne({ where: { meeting_date: date } }))!.toJSON(), created: true, assigned: action_items.length };
}

function crossDept(s: any): string[] {
  const out: string[] = [];
  if (s.employment.avg_readiness < 45) out.push('Career → Curriculum: students need stronger portfolio + GitHub evidence for interviews.');
  if (s.revenue.unpaid > 0) out.push('Finance → Operations: coordinate outreach on unpaid tuitions.');
  if (s.students.at_risk > 0) out.push('Student Success → Community: pair at-risk students into study groups.');
  return out.length ? out : ['No cross-department conflicts today.'];
}
function crossMessages(s: any) {
  const msgs: Array<{ from_slug: string; to_slug: string; subject: string; body: string }> = [];
  if (s.employment.avg_readiness < 45) msgs.push({ from_slug: 'career', to_slug: 'curriculum', subject: 'Need stronger portfolio evidence', body: `Employment readiness is ${s.employment.avg_readiness}/100. Can we weight more GitHub-backed builds + artifacts into the coming weeks?` });
  if (s.revenue.unpaid > 0) msgs.push({ from_slug: 'finance', to_slug: 'operations', subject: 'Unpaid tuitions', body: `${s.revenue.unpaid} active students without confirmed payment — let's coordinate outreach.` });
  msgs.push({ from_slug: 'marketing', to_slug: 'research', subject: 'This week\'s trend brief', body: 'Send me the top employer-demand signals so I can shape the content calendar.' });
  return msgs;
}

export async function listMeetings(limit = 20) {
  const rows = await WorkforceMeeting.findAll({ order: [['meeting_date', 'DESC']], limit });
  return rows.map((r) => r.toJSON());
}

// ── tasks ──
export async function listTasks(status?: string) {
  const where = status ? { status } : {};
  const rows = await WorkforceTask.findAll({ where: where as any, order: [['updated_at', 'DESC']], limit: 200 });
  return rows.map((r) => r.toJSON());
}
export async function createTask(input: { employee_slug: string; title: string; description?: string; priority?: string; deadline?: string | null }) {
  if (!findEmployee(input.employee_slug)) throw Object.assign(new Error('Unknown employee'), { status: 400 });
  const t = await WorkforceTask.create({ employee_slug: input.employee_slug, title: input.title, description: input.description ?? null, priority: input.priority || 'medium', deadline: input.deadline ? new Date(input.deadline) : null, approver: 'chief_of_staff' });
  return t.toJSON();
}
const STATUSES = ['assigned', 'planning', 'working', 'needs_approval', 'completed', 'deferred', 'cancelled', 'escalated'];
export async function updateTask(id: string, status: string) {
  if (!STATUSES.includes(status)) throw Object.assign(new Error('Invalid status'), { status: 400 });
  const t = await WorkforceTask.findByPk(id);
  if (!t) throw Object.assign(new Error('Task not found'), { status: 404 });
  await t.update({ status });
  return t.toJSON();
}

export async function listMessages(limit = 40) {
  const rows = await WorkforceMessage.findAll({ order: [['created_at', 'DESC']], limit });
  return rows.map((m) => ({ ...m.toJSON(), from_name: findEmployee(m.from_slug)?.name, to_name: findEmployee(m.to_slug)?.name }));
}

/** A deterministic performance review from the employee's task record. */
export async function review(slug: string) {
  const e = findEmployee(slug);
  if (!e) throw Object.assign(new Error('Employee not found'), { status: 404 });
  const tasks = await WorkforceTask.findAll({ where: { employee_slug: slug } });
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'completed').length;
  const completion = total ? done / total : 0;
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const scores = {
    quality: clamp(65 + completion * 25),
    impact: clamp(60 + completion * 30),
    reliability: clamp(70 + completion * 25),
    collaboration: clamp(72),
    cost: 92,
  };
  const overall = clamp((scores.quality + scores.impact + scores.reliability + scores.collaboration + scores.cost) / 5);
  return { slug, tasks_total: total, tasks_completed: done, completion_pct: Math.round(completion * 100), scores, overall, summary: `${e.name} is ${overall >= 80 ? 'exceeding' : overall >= 60 ? 'meeting' : 'below'} expectations — ${done}/${total} tasks completed.` };
}

/** Workforce-wide analytics. */
export async function analytics() {
  const tasks = await WorkforceTask.findAll();
  const byStatus: Record<string, number> = {};
  const byEmployee: Record<string, { open: number; done: number }> = {};
  tasks.forEach((t) => {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    const e = (byEmployee[t.employee_slug] = byEmployee[t.employee_slug] || { open: 0, done: 0 });
    if (t.status === 'completed') e.done += 1; else if (OPEN.includes(t.status)) e.open += 1;
  });
  const messages = await WorkforceMessage.count();
  const meetings = await WorkforceMeeting.count();
  return { employees: AI_ORG.length, tasks_total: tasks.length, by_status: byStatus, by_employee: byEmployee, messages, meetings };
}
