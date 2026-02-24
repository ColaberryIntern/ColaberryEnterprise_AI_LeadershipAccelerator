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
  interest_area: z.string().max(100).optional().default(''),
  message: z.string().max(5000).optional().default(''),
  source: z.string().max(50).optional().default('website'),
  form_type: z.string().max(100).optional().default('contact'),
  consent_contact: z.boolean().optional().default(false),
});

export type LeadInput = z.infer<typeof leadSchema>;

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

  const lead = await Lead.create({
    name: data.name,
    email: data.email,
    company: data.company,
    role: data.role,
    phone: data.phone,
    interest_area: data.interest_area,
    message: data.message,
    source: data.source,
    form_type: data.form_type,
    consent_contact: data.consent_contact,
    status: 'new',
  });
  return { lead, isDuplicate: false };
}

interface ListLeadsParams {
  status?: string;
  search?: string;
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

  return { total, byStatus, conversionRate };
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
    phone: l.phone || '',
    status: l.status,
    interest_area: l.interest_area || '',
    interest_level: l.interest_level || '',
    source: l.source || '',
    form_type: l.form_type || '',
    consent_contact: l.consent_contact ? 'Yes' : 'No',
    assigned_admin: (l as any).assignedAdmin?.email || '',
    notes: l.notes || '',
    created_at: l.created_at?.toISOString() || '',
    updated_at: l.updated_at?.toISOString() || '',
  }));

  const parser = new Parser();
  return parser.parse(data);
}
