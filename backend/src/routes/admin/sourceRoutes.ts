import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  listSources, createSource, updateSource, deleteSource,
  createEntryPoint, updateEntryPoint, deleteEntryPoint,
} from '../../controllers/adminLeadSourceController';

const router = Router();

router.get('/api/admin/sources', requireAdmin, listSources);
router.post('/api/admin/sources', requireAdmin, createSource);
router.patch('/api/admin/sources/:id', requireAdmin, updateSource);
router.delete('/api/admin/sources/:id', requireAdmin, deleteSource);

router.post('/api/admin/sources/:id/entry-points', requireAdmin, createEntryPoint);
router.patch('/api/admin/sources/entry-points/:entryId', requireAdmin, updateEntryPoint);
router.delete('/api/admin/sources/entry-points/:entryId', requireAdmin, deleteEntryPoint);

export default router;
