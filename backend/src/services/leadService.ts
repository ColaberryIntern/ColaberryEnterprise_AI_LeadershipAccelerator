import { z } from 'zod';
import Lead from '../models/Lead';

export const leadSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email address').max(255),
  company: z.string().max(255).optional().default(''),
  role: z.string().max(100).optional().default(''),
  interest_area: z.string().max(100).optional().default(''),
  message: z.string().max(5000).optional().default(''),
  source: z.string().max(50).optional().default('website'),
  form_type: z.string().max(100).optional().default('contact'),
});

export type LeadInput = z.infer<typeof leadSchema>;

export async function createLead(data: LeadInput) {
  const lead = await Lead.create({
    name: data.name,
    email: data.email,
    company: data.company,
    role: data.role,
    interest_area: data.interest_area,
    message: data.message,
    source: data.source,
    form_type: data.form_type,
  });
  return lead;
}
