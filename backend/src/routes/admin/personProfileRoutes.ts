import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin, adminAllowedSections } from '../../middlewares/authMiddleware';
import { getPersonProfile } from '../../services/adminOs/personProfileService';
import { hasAnyPersonScope } from '../../services/adminOs/personScope';
import { visibleEnrollmentIds } from '../../services/career/careerMentorScopeService';
import { resolveRefToEmail } from '../../services/adminOs/personRef';
import { generateStrategyBrief } from '../../services/adminOs/strategyBriefService';
import { loadCcppHistory } from '../../services/adminOs/panels/historyPanels';
import { mayReadPanel, resolvePersonIdentity } from '../../services/adminOs/personProfileService';
import { fetchMessageAsSent, mandrillPoster } from '../../services/adminOs/mandrillMessageContent';
import { env } from '../../config/env';

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

/**
 * POST /api/admin/people/strategy-brief — a written brief for whoever is about
 * to contact this person.
 *
 * POST rather than GET because it costs a model call and must not be triggered
 * by a prefetch, a crawler or a browser retry.
 *
 * The brief is built from the SAME profile the caller is permitted to see, so a
 * scoped role cannot obtain, through the brief, anything the page would have
 * withheld from them.
 */
router.post('/api/admin/people/strategy-brief', requireAdmin, async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.body);
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
    const email = parsed.data.email ?? await resolveRefToEmail(parsed.data.ref);
    if (!email) {
      res.status(404).json({ error: 'No such person, or not visible to your role.' });
      return;
    }

    const scopedEnrollments = await visibleEnrollmentIds({
      sub: req.admin!.sub,
      email: req.admin!.email,
      role: req.admin!.role,
      mgmt_role: req.admin!.mgmt_role ?? null,
      enrollmentId: (req.admin as unknown as { enrollment_id?: string })?.enrollment_id ?? null,
    });

    const profile = await getPersonProfile({ email, sections, visibleEnrollmentIds: scopedEnrollments });
    if (!profile) {
      res.status(404).json({ error: 'No such person, or not visible to your role.' });
      return;
    }

    // Already on the profile when permitted; fetched here only when it was not.
    const history = profile.history ?? await loadCcppHistory(email);

    const brief = await generateStrategyBrief(profile, history);
    res.json(brief);
  } catch (error) {
    res.status(500).json({
      error: 'Could not write a brief for this person.',
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
    });
  }
});

/**
 * GET /api/admin/people/message-as-sent — one email exactly as Mandrill sent
 * it, for a message this platform never stored (portal links, reminders,
 * digests) whose open or click is on the 360.
 *
 * Gated three ways, all server-side: the caller's person scope, the
 * `communications` panel (the same rule that decides whether the tab exists),
 * and the person's lifecycle-stage scope via resolvePersonIdentity — the exact
 * gate the profile passes through, without loading the profile. On the
 * Mandrill side the lookup is scoped to the recipient again.
 *
 * On demand only (a button), never prefetched: each call is two Mandrill
 * requests.
 */
const asSentSchema = z.object({
  email: z.string().trim().min(3).max(320).optional(),
  ref: z.string().trim().min(1).max(320).optional(),
  subject: z.string().trim().min(1).max(500),
  at: z.string().trim().datetime({ offset: true }),
  mandrillId: z.string().trim().regex(/^[a-f0-9]{16,64}$/i).optional(),
}).refine((v) => !!(v.email || v.ref), { message: 'An email or ref is required.' });

router.get('/api/admin/people/message-as-sent', requireAdmin, async (req: Request, res: Response) => {
  const parsed = asSentSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'A person, a subject and a timestamp are required.' });
    return;
  }

  const sections = adminAllowedSections(req.admin!);
  if (!hasAnyPersonScope(sections) || !mayReadPanel('communications', sections)) {
    res.status(403).json({ error: 'Your role does not include access to communications.' });
    return;
  }

  try {
    const email = parsed.data.email ?? await resolveRefToEmail(parsed.data.ref);
    const person = email ? await resolvePersonIdentity(email, sections) : null;
    if (!person) {
      res.status(404).json({ error: 'No such person, or not visible to your role.' });
      return;
    }

    const result = await fetchMessageAsSent(
      {
        email: person.email,
        subject: parsed.data.subject,
        at: new Date(parsed.data.at),
        mandrillId: parsed.data.mandrillId ?? null,
      },
      mandrillPoster(env.mandrillApiKey),
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: 'Could not fetch this message.',
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
    });
  }
});

export default router;
