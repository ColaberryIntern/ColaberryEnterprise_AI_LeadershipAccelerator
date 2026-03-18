import { Router } from 'express';
import {
  handleListOpenCohorts,
  handleCreateInvoice,
  handleVerifyEnrollment,
} from '../controllers/enrollmentController';

const router = Router();

router.get('/api/cohorts', handleListOpenCohorts);
router.post('/api/create-invoice', handleCreateInvoice);
router.get('/api/enrollment/verify', handleVerifyEnrollment);

export default router;
