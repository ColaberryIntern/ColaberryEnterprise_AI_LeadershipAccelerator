import { Router } from 'express';
import { z } from 'zod';
import { Op } from 'sequelize';
import { Enrollment } from '../models';
import { signParticipantJwt } from '../services/participantService';

// Local-dev-only one-click login for seeded test accounts. Exists to remove
// the "copy the wrong verify-link token into the wrong browser tab" failure
// mode entirely — no token to mistype or mix up, just a name to click.
//
// Never reachable outside development: this router is only mounted in
// server.ts when env.nodeEnv !== 'production' (see mount site), and every
// handler here re-checks the same condition as defense-in-depth in case this
// file is ever imported/mounted somewhere else by mistake. The account list
// is additionally hard-scoped to @localdev.test emails so even a shared dev
// DB seeded with real-looking data can't be used to impersonate a real
// student through this door.
const router = Router();

function devOnlyGuard(res: import('express').Response): boolean {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' });
    return false;
  }
  return true;
}

router.get('/api/portal/dev/test-accounts', async (req, res) => {
  if (!devOnlyGuard(res)) return;
  const enrollments = await Enrollment.findAll({
    where: { email: { [Op.iLike]: '%@localdev.test' }, status: 'active' },
    attributes: ['id', 'full_name', 'email', 'cohort_id'],
    order: [['full_name', 'ASC']],
  });
  res.json({
    accounts: enrollments.map((e) => ({
      id: e.id,
      full_name: e.full_name,
      email: e.email,
    })),
  });
});

const LoginAsSchema = z.object({ enrollmentId: z.string().uuid() });

router.post('/api/portal/dev/login-as', async (req, res) => {
  if (!devOnlyGuard(res)) return;
  const parsed = LoginAsSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid account' }); return; }

  const enrollment = await Enrollment.findOne({
    where: { id: parsed.data.enrollmentId, email: { [Op.iLike]: '%@localdev.test' } },
  });
  if (!enrollment) { res.status(404).json({ error: 'Test account not found' }); return; }

  const jwtToken = signParticipantJwt(enrollment);
  res.json({
    jwt: jwtToken,
    enrollment: {
      id: enrollment.id,
      full_name: enrollment.full_name,
      email: enrollment.email,
      cohort_id: enrollment.cohort_id,
    },
  });
});

export default router;
