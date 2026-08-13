import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { applyToInternshipSchema, listOfferingsQuerySchema } from '../schemas/internshipSchema';
import {
  applyToInternship,
  listOpenOfferings,
  getOfferingBySlug,
} from '../services/internshipService';

/**
 * AI Internship — PUBLIC routes. Plan §22.
 *
 * MOUNTING MATTERS: this router must be registered alongside leadRoutes, BEFORE
 * the broad auth guard. Routers mounted after it on the deployed server sit
 * behind that guard, and a public intake behind an auth wall silently accepts
 * nobody — see the same note in leadRoutes.ts.
 *
 * Unauthenticated by design: the point is to market a product nobody has heard
 * of, so requiring an account first would defeat it. Everything a public poster
 * sends is validated by Zod before it reaches the service, and the fields that
 * would matter to an attacker (status, enrollment_id, lead_id, decision) are
 * not in the schema at all rather than merely ignored.
 */

// Applications are a considered act, not a burst. 5 per 15 minutes per IP
// matches the lead form and is generous for a legitimate applicant who mistypes
// their email twice.
const applyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions. Please try again in a few minutes.' },
});

// Reads are cheap and cacheable, so the browse cap is looser.
const browseRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
});

const router = Router();

/** Public catalogue. Only `open` offerings are ever returned. */
router.get('/api/internships', browseRateLimiter, async (req: Request, res: Response) => {
  const parsed = listOfferingsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues });
  }
  try {
    const offerings = await listOpenOfferings(parsed.data.track);
    return res.json({
      internships: offerings.map((o) => ({
        slug: o.slug,
        title: o.title,
        summary: o.summary,
        track: o.track,
        starts_on: o.starts_on,
        ends_on: o.ends_on,
        application_deadline: o.application_deadline,
        is_paid: o.is_paid,
        commitment_hours_per_week: o.commitment_hours_per_week,
        is_remote: o.is_remote,
      })),
    });
  } catch (err: any) {
    console.error(`internship.list_failed error_class=${err?.name} detail=${err?.message}`);
    return res.status(500).json({ error: 'Could not load internships' });
  }
});

/** One offering by slug. 404s for anything not open, so drafts stay invisible. */
router.get('/api/internships/:slug', browseRateLimiter, async (req: Request, res: Response) => {
  try {
    const offering = await getOfferingBySlug(String(req.params.slug));
    if (!offering || offering.status !== 'open') {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json({
      slug: offering.slug,
      title: offering.title,
      summary: offering.summary,
      track: offering.track,
      starts_on: offering.starts_on,
      ends_on: offering.ends_on,
      application_deadline: offering.application_deadline,
      is_paid: offering.is_paid,
      stipend_cents: offering.stipend_cents,
      commitment_hours_per_week: offering.commitment_hours_per_week,
      is_remote: offering.is_remote,
    });
  } catch (err: any) {
    console.error(`internship.get_failed error_class=${err?.name} detail=${err?.message}`);
    return res.status(500).json({ error: 'Could not load internship' });
  }
});

/**
 * Submit an application. Safe to call twice — see applyToInternship.
 *
 * Always 200 on a valid, well-formed request, whatever the outcome. A different
 * status code for "already applied" would turn this endpoint into an email
 * oracle: anyone could test whether an address is in our system.
 */
router.post('/api/internships/apply', applyRateLimiter, async (req: Request, res: Response) => {
  const parsed = applyToInternshipSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid application', issues: parsed.error.issues });
  }
  try {
    const result = await applyToInternship(parsed.data);
    return res.status(200).json({
      ok: result.outcome !== 'offering_not_open',
      outcome: result.outcome,
      message: result.message,
    });
  } catch (err: any) {
    console.error(`internship.apply_failed error_class=${err?.name} detail=${err?.message}`);
    return res.status(500).json({ error: 'Could not submit your application. Please try again.' });
  }
});

export default router;
