import { Router } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  handleListLandingPages,
  handleUpdateLandingPage,
  handleListDeployments,
  handleCreateDeployment,
  handleUpdateDeployment,
  handleDeleteDeployment,
} from '../../controllers/deploymentController';

const router = Router();

// Landing Pages
router.get('/api/admin/landing-pages', requireAdmin, handleListLandingPages);
router.patch('/api/admin/landing-pages/:id', requireAdmin, handleUpdateLandingPage);

// Deployments
router.get('/api/admin/deployments', requireAdmin, handleListDeployments);
router.post('/api/admin/deployments', requireAdmin, handleCreateDeployment);
router.patch('/api/admin/deployments/:id', requireAdmin, handleUpdateDeployment);
router.delete('/api/admin/deployments/:id', requireAdmin, handleDeleteDeployment);

export default router;
