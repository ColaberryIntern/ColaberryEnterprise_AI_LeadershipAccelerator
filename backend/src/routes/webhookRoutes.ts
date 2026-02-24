import { Router } from 'express';
import { handleStripeWebhook } from '../controllers/webhookController';

const router = Router();

// Note: This route is mounted with express.raw() middleware in server.ts
// It does NOT go through express.json()
router.post('/api/webhook', handleStripeWebhook);

export default router;
