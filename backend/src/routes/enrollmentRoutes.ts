import { Router } from 'express';
import {
  handleListOpenCohorts,
  handleCreateInvoice,
  handleCreateInvoiceRequest,
  handleVerifyEnrollment,
} from '../controllers/enrollmentController';

const router = Router();

router.get('/api/cohorts', handleListOpenCohorts);
router.post('/api/create-invoice', handleCreateInvoice);
router.post('/api/create-invoice-request', handleCreateInvoiceRequest);
router.get('/api/enrollment/verify', handleVerifyEnrollment);

export default router;
