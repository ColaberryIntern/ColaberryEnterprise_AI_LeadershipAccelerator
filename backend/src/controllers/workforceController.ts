/**
 * workforceController — HTTP boundary for the AI Workforce Operating System.
 * Admin-only, /api/admin/workforce/*.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  roster, office, briefing, runDailyMeeting, listMeetings,
  listTasks, createTask, updateTask, listMessages, review, analytics,
} from '../services/workforce/workforceService';
import { listLiveAgents, listLiveAgentActivity } from '../services/workforce/liveAgentsService';
import { getOrgChart, NAMED_DEPARTMENTS } from '../services/workforce/orgChartService';
import { workforceOrgChartResponseSchema } from '../schemas/workforceOrgChartSchema';
import { updateOrgMemberTeam } from '../services/workforce/orgChartHierarchyService';
import { assignTaskToAgent } from '../services/workforce/orgChartTaskAssignmentService';

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

export async function handleRoster(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await roster()); } catch (e) { fail(res, e, next); }
}
export async function handleOffice(req: Request, res: Response, next: NextFunction) {
  try { res.json(await office(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}
export async function handleBriefing(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await briefing()); } catch (e) { fail(res, e, next); }
}
export async function handleDailyMeeting(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await runDailyMeeting()); } catch (e) { fail(res, e, next); }
}
export async function handleMeetings(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ meetings: await listMeetings() }); } catch (e) { fail(res, e, next); }
}
export async function handleListTasks(req: Request, res: Response, next: NextFunction) {
  try { res.json({ tasks: await listTasks(typeof req.query.status === 'string' ? req.query.status : undefined) }); } catch (e) { fail(res, e, next); }
}
const createSchema = z.object({ employee_slug: z.string().min(1), title: z.string().min(1), description: z.string().optional(), priority: z.enum(['low', 'medium', 'high']).optional(), deadline: z.string().nullable().optional() });
export async function handleCreateTask(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await createTask(createSchema.parse(req.body || {}))); } catch (e) { fail(res, e, next); }
}
export async function handleUpdateTask(req: Request, res: Response, next: NextFunction) {
  try { res.json(await updateTask(String(req.params.id), String(req.body?.status))); } catch (e) { fail(res, e, next); }
}
export async function handleMessages(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ messages: await listMessages() }); } catch (e) { fail(res, e, next); }
}
export async function handleReview(req: Request, res: Response, next: NextFunction) {
  try { res.json(await review(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}
export async function handleAnalytics(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await analytics()); } catch (e) { fail(res, e, next); }
}

// Reese Phase 4 (Workforce integration) — real, DB-backed AiAgent rows built via
// the agentBlueprint pattern, distinct from the static AI_ORG director roster above.
export async function handleListLiveAgents(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ agents: await listLiveAgents() }); } catch (e) { fail(res, e, next); }
}
export async function handleListLiveAgentActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
    res.json({ activity: await listLiveAgentActivity(Number.isFinite(limit) ? limit : undefined) });
  } catch (e) { fail(res, e, next); }
}

/**
 * Org-chart hierarchy build (2026-08-19) — GET /api/admin/workforce/org-chart.
 * Real 3-tier tree (Human Employees -> AI Leadership -> AI Staff), no request
 * body/query to validate. Response shape checked against
 * workforceOrgChartResponseSchema before sending: fail loud (console.warn,
 * structured) in dev, log-and-continue in production — same pattern as
 * capePortalController.ts::handleGetSkillProfile().
 */
export async function handleOrgChart(_req: Request, res: Response, _next: NextFunction) {
  try {
    const chart = await getOrgChart();
    if (process.env.NODE_ENV !== 'production') {
      // Validate the actual WIRE shape (post-JSON-serialization — Dates become
      // ISO strings), not the raw service object, since that's what the
      // frontend contract actually promises to consume.
      const wirePayload = JSON.parse(JSON.stringify(chart));
      const parsed = workforceOrgChartResponseSchema.safeParse(wirePayload);
      if (!parsed.success) {
        console.warn(JSON.stringify({
          timestamp: new Date().toISOString(), level: 'warn', service: 'backend',
          event: 'workforce_org_chart_contract_violation', outcome: 'partial',
          context: { issues: parsed.error.issues.map((i) => i.message) },
        }));
      }
    }
    res.json(chart);
  } catch (e: any) {
    // Deliberately does NOT fall through to fail()'s next(err) path for an
    // unclassified error (real BREAK-phase finding, org-chart hierarchy build,
    // 2026-08-19): Express's own default error handler renders a full HTML
    // page WITH the stack trace whenever NODE_ENV isn't 'production', which
    // is exactly the "leaks the API response into user-facing surfaces" case
    // CLAUDE.md's Security Enforcement Layer forbids. This route always
    // returns a clean, generic, non-leaking JSON 500 itself, logging the real
    // error server-side with a stable error_class.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'workforce_org_chart_error', outcome: 'failure',
      error_class: e?.error_class || e?.name || 'Error',
      context: { message: e?.message },
    }));
    res.status(500).json({ error: 'Could not build the org chart.' });
  }
}

/**
 * Org Chart v3 (2026-08-19) — PATCH /api/admin/workforce/org-chart/members/:id/team.
 * Ali, live: "Give me the ability to switch the people between teams." Zod
 * enforces the value is one of the 6 real named departments (or `null`, to
 * clear it — buckets into "Other" on next read) BEFORE it ever reaches the
 * service layer; the service (orgChartHierarchyService.ts) validates again
 * independently as a second, reusable-beyond-HTTP guard. Named errors
 * (`InvalidDepartmentError`/`OrgMemberNotFoundError`) both carry a `status`
 * property the existing `fail()` helper already knows how to read — zero
 * changes needed to `fail()` itself.
 */
const updateTeamSchema = z.object({ team: z.enum([...NAMED_DEPARTMENTS]).nullable() });
export async function handleUpdateOrgMemberTeam(req: Request, res: Response, next: NextFunction) {
  try {
    const { team } = updateTeamSchema.parse(req.body || {});
    const member = await updateOrgMemberTeam(String(req.params.id), team);
    res.json(member);
  } catch (e) { fail(res, e, next); }
}

/**
 * Org Chart v3 (2026-08-19) — POST /api/admin/workforce/org-chart/members/:id/tasks.
 * Ali, live: "The human has the ability to create and assign tasks to any
 * agent in it's hierarchy even if they report to another AI Agent."
 * `idempotency_key` is required (not optional) per CLAUDE.md's Idempotency &
 * Replayability section — see orgChartTaskAssignmentService.ts for the real
 * dedup mechanism this enables. `AgentNotInHierarchyError` carries
 * `status = 403`, picked up by the existing `fail()` helper unchanged.
 */
const assignTaskSchema = z.object({
  agent_id: z.string().min(1),
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  idempotency_key: z.string().min(1).max(200),
});
export async function handleAssignHierarchyTask(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = assignTaskSchema.parse(req.body || {});
    const ticket = await assignTaskToAgent({
      orgMemberId: String(req.params.id),
      agentId: parsed.agent_id,
      title: parsed.title,
      description: parsed.description,
      idempotencyKey: parsed.idempotency_key,
    });
    res.status(201).json(ticket);
  } catch (e) { fail(res, e, next); }
}
