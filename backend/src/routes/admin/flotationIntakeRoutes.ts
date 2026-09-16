/**
 * The admin door into the one intake.
 *
 *     "on the management side of the internship admin page ... as an admin, I can create the
 *      project myself so I test the processes (that must stay in sync) and understand the
 *      user experience."  (Ali, 2026-09-16)
 *
 * Two endpoints. One lists the understandings that came out of AI Flotation conversations,
 * with who they belong to and whether a build has already been started from them. The other
 * starts that build - through `startBuildFromUnderstanding`, which calls the same
 * `startBuild` the portal wizard does. Nothing here knows how a build works; that is the
 * point.
 *
 * Both are admin-only and both are POST-idempotent: starting the same understanding twice
 * returns the project the first call made.
 */

import { Router, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { Op } from 'sequelize';
import { requireAdmin } from '../../middlewares/authMiddleware';
import ProjectUnderstandingRecord from '../../models/ProjectUnderstandingRecord';
import { Enrollment, Lead } from '../../models';
import { startBuildFromUnderstanding } from '../../services/delivery/buildFromUnderstanding';

const router = Router();

/**
 * The understandings an admin can build from, newest first.
 *
 * Joins the lead (for the person) and the enrolment (for where the build would land) by
 * email, because the understanding carries a lead_id and the build needs an enrolment - and
 * the two are only ever linked through the person's address.
 */
router.get('/api/admin/flotation/understandings', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const records: any[] = await ProjectUnderstandingRecord.findAll({
      where: { status: 'extracted' },
      order: [['scope_generated_at', 'DESC NULLS LAST'], ['revision', 'DESC']],
      limit: 100,
    });

    const leadIds = [...new Set(records.map((r) => r.lead_id).filter(Boolean))];
    const leads: any[] = leadIds.length ? await Lead.findAll({ where: { id: { [Op.in]: leadIds } } }) : [];
    const leadById = new Map(leads.map((l) => [l.id, l]));

    const emails = [...new Set(leads.map((l) => String(l.email || '').toLowerCase()).filter(Boolean))];
    const enrollments: any[] = emails.length ? await Enrollment.findAll({ where: { email: { [Op.in]: emails } } }) : [];
    const enrollmentByEmail = new Map(enrollments.map((e) => [String(e.email || '').toLowerCase(), e]));

    res.json({
      understandings: records.map((r) => {
        const lead = r.lead_id ? leadById.get(r.lead_id) : null;
        const enrollment = lead ? enrollmentByEmail.get(String(lead.email || '').toLowerCase()) : null;
        const build = (r.scope as any)?.build || null;
        return {
          id: r.id,
          title: r.title,
          source: r.source,
          items: (r.items || []).length,
          confirmed_at: r.confirmed_at,
          lead: lead ? { id: lead.id, name: lead.name, email: lead.email, company: lead.company } : null,
          enrollment: enrollment ? { id: enrollment.id, tier: enrollment.tier, cohort_id: enrollment.cohort_id } : null,
          build: build ? { project_id: build.project_id, started_at: build.started_at } : null,
        };
      }),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const startSchema = z.object({
  /** Where the project lands. Defaults to the enrolment matching the lead's email. */
  enrollment_id: z.string().uuid().optional(),
  /** §17. Off by default until the confirmation UI exists; an admin can insist. */
  require_confirmed: z.boolean().optional(),
});

/**
 * Start a build from an understanding. Same pipeline as the portal wizard, entered from
 * the management side.
 */
router.post('/api/admin/flotation/understandings/:id/build', requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = startSchema.parse(req.body || {});

    let enrollmentId = body.enrollment_id;
    if (!enrollmentId) {
      const record: any = await ProjectUnderstandingRecord.findByPk(req.params.id as string);
      if (!record) return res.status(404).json({ error: 'understanding not found' });
      const lead: any = record.lead_id ? await Lead.findByPk(record.lead_id) : null;
      const enrollment: any = lead?.email ? await Enrollment.findOne({ where: { email: String(lead.email).toLowerCase() } }) : null;
      if (!enrollment) {
        return res.status(409).json({
          error: 'no enrolment for this understanding — pass enrollment_id, or make sure the enquiry produced a prospect account',
        });
      }
      enrollmentId = enrollment.id;
    }

    const result = await startBuildFromUnderstanding({
      recordId: req.params.id as string,
      enrollmentId: enrollmentId!,
      requireConfirmed: body.require_confirmed === true,
    });

    if (!result.ok) {
      const status = result.reason === 'not_found' ? 404 : result.reason === 'failed' ? 500 : 409;
      return res.status(status).json({ error: result.error, reason: result.reason });
    }

    return res.status(result.reused ? 200 : 202).json(result);
  } catch (err: any) {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Validation failed', details: err.issues });
    return res.status(500).json({ error: err.message });
  }
});

export default router;
