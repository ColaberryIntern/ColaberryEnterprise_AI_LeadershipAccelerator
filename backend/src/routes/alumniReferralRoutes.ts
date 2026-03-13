import { Router } from 'express';
import { requireAlumni } from '../middlewares/alumniAuth';
import {
  handleAlumniLogin,
  handleGetProfile,
  handleGetReferrals,
  handleSubmitReferral,
  handleGetTimeline,
  handleGetEarnings,
} from '../controllers/alumniReferralController';

const router = Router();

// Public — alumni login (email verification against MSSQL)
router.post('/api/referrals/login', handleAlumniLogin);

// Protected — requires alumni JWT
router.get('/api/referrals/profile', requireAlumni, handleGetProfile);
router.get('/api/referrals/list', requireAlumni, handleGetReferrals);
router.post('/api/referrals/submit', requireAlumni, handleSubmitReferral);
router.get('/api/referrals/:id/timeline', requireAlumni, handleGetTimeline);
router.get('/api/referrals/earnings', requireAlumni, handleGetEarnings);

export default router;
