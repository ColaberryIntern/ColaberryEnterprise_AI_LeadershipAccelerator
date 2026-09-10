import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin, adminAllowedSections } from '../../middlewares/authMiddleware';
import { getPersonProfile } from '../../services/adminOs/personProfileService';
import { hasAnyPersonScope } from '../../services/adminOs/personScope';
import { visibleEnrollmentIds } from '../../services/career/careerMentorScopeService';
import { resolveRefToEmail } from '../../services/adminOs/personRef';

/**
 * One person's 360° profile.
 *
 * Sits under /api/admin/people, which mgmtSectionGate treats as route-enforced
 * because the roster serves five sections and the gate maps only one per path.
 * The real checks are here and in personProfileService: `hasAnyPersonScope` for
 * the surface, the lifecycle stage scope for the person, and the per-mentor
 * enrolment scope for the learning panel.
 */
const router = Router();

/**
 * Either an email or a ref.
 *
 * `ref` accepts `lead:123` and `enrollment:<uuid>` as well as an address, so any
 * admin surface can link to the 360 with whatever identifier its rows carry —
 * most hold a lead id and no email. See services/adminOs/personRef.ts.
 *
 * Both are bounded because both reach a query. 320 is the RFC maximum for an
 * address, and every ref shape is shorter than that.
 */
const querySchema = z.object({
  email: z.string().trim().min(3).max(320).optional(),
  ref: z.string().trim().min(1).max(320).optional(),
}).refine((v) => !!(v.email || v.ref), { message: 'An email or ref is required.' });

router.get('/api/admin/people/profile', requireAdmin, async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'An email or ref is required.' });
    return;
  }

  const sections = adminAllowedSections(req.admin!);
  if (!hasAnyPersonScope(sections)) {
    res.status(403).json({ error: 'Your role does not include access to person records.' });
    return;
  }

  try {
    // Resolve the ref BEFORE the scope checks, so an unresolvable id is a 404
    // rather than a confusing 403 — and so the resolved address is what every
    // scope check below actually runs against.
    const email = parsed.data.email
      ?? await resolveRefToEmail(parsed.data.ref);
    if (!email) {
      res.status(404).json({ error: 'No such person, or not visible to your role.' });
      return;
    }

    // The second narrowing. `null` means no per-record filter (an admin); `[]`
    // means a mentor with no grants, who must see nothing. Passing them through
    // distinctly is what stops a mentor reading every learner on the platform.
    const scopedEnrollments = await visibleEnrollmentIds({
      sub: req.admin!.sub,
      email: req.admin!.email,
      role: req.admin!.role,
      mgmt_role: req.admin!.mgmt_role ?? null,
      enrollmentId: (req.admin as unknown as { enrollment_id?: string })?.enrollment_id ?? null,
    });

    const profile = await getPersonProfile({
      email,
      sections,
      visibleEnrollmentIds: scopedEnrollments,
    });

    if (!profile) {
      // 404 for "not yours" as well as "not there". An empty-but-200 response
      // would confirm the person exists, which is itself a disclosure.
      res.status(404).json({ error: 'No such person, or not visible to your role.' });
      return;
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({
      error: 'Could not read this profile.',
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
    });
  }
});

export default router;
