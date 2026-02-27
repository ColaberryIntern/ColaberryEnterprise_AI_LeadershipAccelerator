import { Router } from 'express';
import { handleGetAvailability, handleBookCall } from '../controllers/calendarController';

const router = Router();

router.get('/api/calendar/availability', handleGetAvailability);
router.post('/api/calendar/book', handleBookCall);

export default router;
