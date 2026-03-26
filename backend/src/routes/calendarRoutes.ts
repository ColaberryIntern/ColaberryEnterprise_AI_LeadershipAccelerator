import { Router, Request, Response } from 'express';
import { handleGetAvailability, handleBookCall } from '../controllers/calendarController';

const router = Router();

router.get('/api/calendar/availability', handleGetAvailability);
router.post('/api/calendar/book', handleBookCall);

// Lightweight lead lookup for booking form pre-fill (public, minimal data)
router.get('/api/calendar/prefill/:lid', async (req: Request, res: Response) => {
  try {
    const lid = parseInt(req.params.lid as string, 10);
    if (!lid || isNaN(lid)) { res.json({}); return; }
    const { Lead } = require('../models');
    const lead = await Lead.findByPk(lid, { attributes: ['name', 'email', 'company', 'phone'] });
    if (!lead) { res.json({}); return; }
    res.json({
      name: (lead as any).name || '',
      email: (lead as any).email || '',
      company: (lead as any).company || '',
      phone: (lead as any).phone || '',
    });
  } catch {
    res.json({});
  }
});

export default router;
