import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin, adminAllowedSections } from '../../middlewares/authMiddleware';
import { getPersonProfile } from '../../services/adminOs/personProfileService';
import { hasAnyPersonScope } from '../../services/adminOs/personScope';
import { visibleEnrollmentIds } from '../../services/career/careerMentorScopeService';

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

const querySchema = z.object({
  // Bounded because it reaches a query. 320 is the RFC maximum for an address.
  email: z.string().trim().min(3).max(320),
});

router.get('/api/admin/people/profile', requireAdmin, async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'An email is required.' });
    return;
  }

  const sections = adminAllowedSections(req.admin!);
  if (!hasAnyPersonScope(sections)) {
    res.status(403).json({ error: 'Your role does not include access to person records.' });
    return;
  }

  try {
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
      email: parsed.data.email,
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
