import { Router } from 'express';
import { handleAdminLogin, handleAdminLogout } from '../../controllers/adminAuthController';

const router = Router();

router.post('/api/admin/login', handleAdminLogin);
router.post('/api/admin/logout', handleAdminLogout);

export default router;
