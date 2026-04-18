import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  listFormDefinitions, createFormDefinition, updateFormDefinition, deleteFormDefinition,
} from '../../controllers/adminLeadSourceController';

const router = Router();

router.get('/api/admin/form-definitions', requireAdmin, listFormDefinitions);
router.post('/api/admin/form-definitions', requireAdmin, createFormDefinition);
router.patch('/api/admin/form-definitions/:id', requireAdmin, updateFormDefinition);
router.delete('/api/admin/form-definitions/:id', requireAdmin, deleteFormDefinition);

export default router;
