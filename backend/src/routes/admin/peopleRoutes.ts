import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin, adminAllowedSections } from '../../middlewares/authMiddleware';
import { LIFECYCLE_STAGES } from '../../services/adminOs/lifecycle';
import { getPeopleRoster } from '../../services/adminOs/peopleService';
import { hasAnyPersonScope } from '../../services/adminOs/personScope';

/**
 * People — the canonical roster.
 *
 * THE SECTIONS COME FROM THE TOKEN, NEVER FROM THE REQUEST. A `sections` query
 * parameter would let any authenticated admin name their own scope and read the
 * whole roster, which is the difference between an access check and a
 * suggestion. `adminAllowedSections(req.admin)` is the same function the section
 * gate uses, so the roster and the gate cannot disagree about who this caller is.
 */
const router = Router();

const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
  stage: z.enum(LIFECYCLE_STAGES).optional(),
  // Matches the drill-down contract's `untraced` filter, which the identity
  // coverage metric opens into.
  untraced: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/api/admin/people', requireAdmin, async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filters.', issues: parsed.error.issues });
    return;
  }

  const sections = adminAllowedSections(req.admin!);

  // Deny by default, and say WHICH thing is missing. An identity with sections
  // but no person-data sections (admissions before 2026-09-05, community
  // organizer today) gets a clear 403 rather than a confusing empty roster that
  // reads as "there are no people".
  if (!hasAnyPersonScope(sections)) {
    res.status(403).json({
      error: 'Your role does not include access to person records.',
    });
    return;
  }

  try {
    const roster = await getPeopleRoster({
      sections,
      search: parsed.data.search,
      stage: parsed.data.stage,
      untracedOnly: parsed.data.untraced === true,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
    });
    res.json(roster);
  } catch (error) {
    // No empty roster on failure. An empty list reads as "nobody matches", and
    // that is a different statement from "we could not look".
    res.status(500).json({
      error: 'Could not read the people roster.',
      error_class: error instanceof Error ? error.constructor.name : 'Unknown',
    });
  }
});

export default router;
