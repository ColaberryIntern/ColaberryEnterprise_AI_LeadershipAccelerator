import { z } from 'zod';
import { Op } from 'sequelize';
import Lead from '../models/Lead';
import { AdminUser, AutomationLog } from '../models';
import { Parser } from 'json2csv';

export const leadSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  email: z.string().email('Invalid email address').max(255),
  company: z.string().max(255).optional().default(''),
  role: z.string().max(100).optional().default(''),
  phone: z.string().max(50).optional().default(''),
  title: z.string().max(255).optional().default(''),
  company_size: z.string().max(50).optional().default(''),
  evaluating_90_days: z.boolean().optional().default(false),
  interest_area: z.string().max(100).optional().default(''),
  message: z.string().max(5000).optional().default(''),
  source: z.string().max(50).optional().default('website'),
  form_type: z.string().max(100).optional().default('contact'),
  consent_contact: z.boolean().optional().default(false),
  utm_source: z.string().max(255).optional().default(''),
  utm_campaign: z.string().max(255).optional().default(''),
  page_url: z.string().max(500).optional().default(''),
});

export type LeadInput = z.infer<typeof leadSchema>;

const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com'];
const EXECUTIVE_TITLE_PATTERN = /\b(director|vp|vice\s*president|cto|cio|cdo|chief|head\s+of|svp|evp)\b/i;

export function calculateLeadScore(lead: LeadInput): number {
  let score = 0;

  // Corporate email (+20)
  const emailDomain = lead.email.split('@')[1]?.toLowerCase() || '';
  if (emailDomain && !FREE_EMAIL_DOMAINS.includes(emailDomain)) {
    score += 20;
  }

  // Executive title (+20)
  const titleStr = lead.title || lead.role || '';
  if (EXECUTIVE_TITLE_PATTERN.test(titleStr)) {
    score += 20;
  }

  // Phone provided (+30)
  if (lead.phone && lead.phone.trim().length > 0) {
    score += 30;
  }

  // Evaluating within 90 days (+15)
  if (lead.evaluating_90_days) {
    score += 15;
  }

  // Company size 51+ employees (+10)
  const size = lead.company_size || '';
  if (size && size !== '1-10' && size !== '11-50') {
    score += 10;
  }

  // UTM source contains pricing (+10)
  if (lead.utm_source && lead.utm_source.toLowerCase().includes('pricing')) {
    score += 10;
  }

  return score;
}

export async function createLead(data: LeadInput) {
  // Duplicate check: same email within 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentDuplicate = await Lead.findOne({
    where: {
      email: data.email,
      created_at: { [Op.gte]: oneDayAgo },
    },
    order: [['created_at', 'DESC']],
  });

  if (recentDuplicate) {
    return { lead: recentDuplicate, isDuplicate: true };
  }

  const leadScore = calculateLeadScore(data);

  const lead = await Lead.create({
    name: data.name,
    email: data.email,
    company: data.company,
    role: data.role,
    phone: data.phone,
    title: data.title,
    company_size: data.company_size,
    evaluating_90_days: data.evaluating_90_days,
    lead_score: leadScore,
    interest_area: data.interest_area,
    message: data.message,
    source: data.source,
    form_type: data.form_type,
    consent_contact: data.consent_contact,
    utm_source: data.utm_source,
    utm_campaign: data.utm_campaign,
    page_url: data.page_url,
    status: 'new',
  });
  return { lead, isDuplicate: false };
}

interface ListLeadsParams {
  status?: string;
  search?: string;
  source?: string;
  scoreMin?: number;
  scoreMax?: number;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'ASC' | 'DESC';
}

export async function listLeads(params: ListLeadsParams) {
  const page = params.page || 1;
  const limit = params.limit || 25;
  const offset = (page - 1) * limit;
  const sort = params.sort || 'created_at';
  const order = params.order || 'DESC';

  const where: any = {};

  if (params.status) {
    where.status = params.status;
  }

  if (params.source) {
    where.form_type = params.source;
  }

  if (params.scoreMin !== undefined || params.scoreMax !== undefined) {
    where.lead_score = {};
    if (params.scoreMin !== undefined) {
      where.lead_score[Op.gte] = params.scoreMin;
    }
    if (params.scoreMax !== undefined) {
      where.lead_score[Op.lte] = params.scoreMax;
    }
  }

  if (params.dateFrom || params.dateTo) {
    where.created_at = {};
    if (params.dateFrom) {
      where.created_at[Op.gte] = new Date(params.dateFrom);
    }
    if (params.dateTo) {
      where.created_at[Op.lte] = new Date(params.dateTo + 'T23:59:59.999Z');
    }
  }

  if (params.search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${params.search}%` } },
      { email: { [Op.iLike]: `%${params.search}%` } },
      { company: { [Op.iLike]: `%${params.search}%` } },
    ];
  }

  const { rows: leads, count: total } = await Lead.findAndCountAll({
    where,
    include: [{ model: AdminUser, as: 'assignedAdmin', attributes: ['id', 'email'] }],
    order: [[sort, order]],
    limit,
    offset,
  });

  return {
    leads,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getLeadDetail(id: number) {
  const lead = await Lead.findByPk(id, {
    include: [{ model: AdminUser, as: 'assignedAdmin', attributes: ['id', 'email'] }],
  });

  if (!lead) return null;

  const automationHistory = await AutomationLog.findAll({
    where: { related_type: 'lead', related_id: String(id) },
    order: [['created_at', 'DESC']],
  });

  return { lead, automationHistory };
}

export async function updateLead(id: number, updates: Record<string, any>) {
  const lead = await Lead.findByPk(id);
  if (!lead) return null;

  const allowedFields = ['status', 'interest_level', 'notes', 'assigned_admin'];
  const filteredUpdates: Record<string, any> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }
  filteredUpdates.updated_at = new Date();

  await lead.update(filteredUpdates);
  return lead.reload({
    include: [{ model: AdminUser, as: 'assignedAdmin', attributes: ['id', 'email'] }],
  });
}

export async function getLeadStats() {
  const total = await Lead.count();
  const byStatus: Record<string, number> = {};
  const statuses = ['new', 'contacted', 'qualified', 'enrolled', 'lost'];

  for (const status of statuses) {
    byStatus[status] = await Lead.count({ where: { status } });
  }

  const conversionRate = total > 0 ? ((byStatus.enrolled || 0) / total * 100).toFixed(1) : '0.0';

  // High-intent leads (score > 60)
  const highIntent = await Lead.count({
    where: { lead_score: { [Op.gt]: 60 } },
  });

  // This month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const thisMonth = await Lead.count({
    where: { created_at: { [Op.gte]: startOfMonth } },
  });

  return { total, byStatus, conversionRate, highIntent, thisMonth };
}

export async function generateLeadCsv() {
  const leads = await Lead.findAll({
    include: [{ model: AdminUser, as: 'assignedAdmin', attributes: ['id', 'email'] }],
    order: [['created_at', 'DESC']],
  });

  const data = leads.map((l) => ({
    id: l.id,
    name: l.name,
    email: l.email,
    company: l.company || '',
    role: l.role || '',
    title: l.title || '',
    phone: l.phone || '',
    company_size: l.company_size || '',
    lead_score: l.lead_score || 0,
    status: l.status,
    interest_area: l.interest_area || '',
    interest_level: l.interest_level || '',
    evaluating_90_days: l.evaluating_90_days ? 'Yes' : 'No',
    source: l.source || '',
    form_type: l.form_type || '',
    utm_source: l.utm_source || '',
    utm_campaign: l.utm_campaign || '',
    page_url: l.page_url || '',
    consent_contact: l.consent_contact ? 'Yes' : 'No',
    assigned_admin: (l as any).assignedAdmin?.email || '',
    notes: l.notes || '',
    created_at: l.created_at?.toISOString() || '',
    updated_at: l.updated_at?.toISOString() || '',
  }));

  const parser = new Parser();
  return parser.parse(data);
}
