import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { verifyHmacSignature } from '../utils/hmac';
import { BuildPlanSchema, traceGateFailed } from '../services/buildPlanSchema';

/**
 * Receiver for a Story-Driven Build engine plan pushed from the AI Project
 * Architect (advisor.colaberry.ai). The engine POSTs a signed
 * `build_plan.published` event; this handler verifies the signature, resolves
 * the target student project, and ingests the plan idempotently as native
 * sprints/tasks/requirements.
 *
 * Service-auth: HMAC-SHA256 over the RAW request body bytes (exactly what the
 * sender signed), matching `deep_plan_targets.publish_to_accelerator` on the
 * engine side. We reuse the same shared secret family as the advisory webhook
 * (`ADVISORY_WEBHOOK_SECRET`); `BUILD_PLAN_WEBHOOK_SECRET` can override it if
 * ops later wants a dedicated key. When no secret is configured, verification
 * is skipped (matches the platform's existing advisory-webhook posture) — set
 * the secret in prod to enforce.
 */
const BUILD_PLAN_WEBHOOK_SECRET =
  process.env.BUILD_PLAN_WEBHOOK_SECRET || process.env.ADVISORY_WEBHOOK_SECRET || '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve the student project the plan should land on:
 *   1. If `project_ref` is a UUID that names a project owned by this
 *      enrollment, use it (explicit multi-project targeting).
 *   2. Else the enrollment's active project.
 *   3. Else create one (the student started this in the advisor first).
 * Returns null only when no project exists and none can be created
 * (e.g. enrollment has no cohort/program to seed one).
 */
async function resolveProjectId(enrollmentId: string, projectRef: string): Promise<string | null> {
  if (projectRef && UUID_RE.test(projectRef)) {
    const { Project } = await import('../models');
    const direct = await Project.findOne({ where: { id: projectRef, enrollment_id: enrollmentId } });
    if (direct) return (direct as any).id;
  }
  const { getProjectByEnrollment, createProjectForEnrollment } = await import('../services/projectService');
  const existing = await getProjectByEnrollment(enrollmentId);
  if (existing) return (existing as any).id;
  try {
    const created = await createProjectForEnrollment(enrollmentId);
    return (created as any).id;
  } catch (e: any) {
    console.warn(`[BuildPlanWebhook] cannot auto-create project for enrollment ${enrollmentId}: ${e.message}`);
    return null;
  }
}

export async function handleBuildPlanWebhook(req: Request, res: Response): Promise<void> {
  try {
    const signature = (req.headers['x-webhook-signature'] as string) || '';
    // Verify over the raw body bytes captured by the route's express.json({ verify })
    // saver. Falls back to a re-serialization only if the saver did not run.
    const raw = (req as any).rawBody;
    const rawBody = Buffer.isBuffer(raw) ? raw.toString('utf8') : JSON.stringify(req.body);

    if (BUILD_PLAN_WEBHOOK_SECRET && !verifyHmacSignature(rawBody, signature, BUILD_PLAN_WEBHOOK_SECRET)) {
      console.warn('[BuildPlanWebhook] Invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const data = (req.body && req.body.data) || {};
    const operatorEmail = String(data.operator_email || '').trim();
    const projectRef = String(data.project_ref || '').trim();
    if (!operatorEmail) {
      res.status(400).json({ error: 'operator_email required' });
      return;
    }

    const parsed = BuildPlanSchema.safeParse(data.plan);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid build plan', issues: parsed.error.issues });
      return;
    }
    const plan = parsed.data;

    // Fail-closed on the deterministic traceability gate (same invariant the engine enforces).
    if (traceGateFailed(plan)) {
      res.status(422).json({ error: 'Build plan failed the traceability gate (trace.ok=false); not ingested.' });
      return;
    }

    const { Enrollment } = await import('../models');
    const enrollment = await Enrollment.findOne({ where: { email: { [Op.iLike]: operatorEmail } } });
    if (!enrollment) {
      res.status(404).json({ error: `No student enrollment found for ${operatorEmail}` });
      return;
    }

    const projectId = await resolveProjectId((enrollment as any).id, projectRef);
    if (!projectId) {
      res.status(404).json({ error: 'No project could be resolved or created for this enrollment' });
      return;
    }

    const { ingestBuildPlan } = await import('../services/buildPlanIngestService');
    const counts = await ingestBuildPlan(projectId, plan as any);
    console.log(`[BuildPlanWebhook] Ingested plan for ${operatorEmail} → project ${projectId}: ${JSON.stringify(counts)}`);
    res.json({ ok: true, projectId, ...counts });
  } catch (err: any) {
    console.error('[BuildPlanWebhook] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

export async function handleBuildPlanWebhookHead(_req: Request, res: Response): Promise<void> {
  res.status(200).send('OK');
}
