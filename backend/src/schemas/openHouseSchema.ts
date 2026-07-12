import { z } from 'zod';

// Contract for POST /api/v1/open-house/register (called by training.colaberry.com).
export const openHouseRegisterSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  email: z.string().trim().email('a valid email is required').max(255),
  phone: z.string().trim().max(50).optional(),
  order_id: z.string().trim().max(64).optional(),
  utm_source: z.string().trim().max(255).optional(),
  utm_campaign: z.string().trim().max(255).optional(),
  page_url: z.string().trim().max(500).optional(),
});

export type OpenHouseRegisterInput = z.infer<typeof openHouseRegisterSchema>;
