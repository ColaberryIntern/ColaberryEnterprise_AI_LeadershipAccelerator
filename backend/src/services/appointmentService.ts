import { Op } from 'sequelize';
import { Appointment, Lead, AdminUser } from '../models';

interface CreateAppointmentParams {
  lead_id: number;
  admin_user_id?: string;
  title: string;
  description?: string;
  scheduled_at: string;
  duration_minutes?: number;
  type: string;
}

export async function createAppointment(params: CreateAppointmentParams) {
  return Appointment.create({
    lead_id: params.lead_id,
    admin_user_id: params.admin_user_id || null,
    title: params.title,
    description: params.description || null,
    scheduled_at: new Date(params.scheduled_at),
    duration_minutes: params.duration_minutes || 30,
    type: params.type,
    status: 'scheduled',
  } as any);
}

interface ListAppointmentsParams {
  leadId?: number;
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listAppointments(params: ListAppointmentsParams) {
  const where: any = {};

  if (params.leadId) {
    where.lead_id = params.leadId;
  }

  if (params.status) {
    where.status = params.status;
  }

  if (params.from || params.to) {
    where.scheduled_at = {};
    if (params.from) where.scheduled_at[Op.gte] = new Date(params.from);
    if (params.to) where.scheduled_at[Op.lte] = new Date(params.to);
  }

  return Appointment.findAndCountAll({
    where,
    include: [
      { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'company'] },
      { model: AdminUser, as: 'adminUser', attributes: ['id', 'email'] },
    ],
    order: [['scheduled_at', 'ASC']],
    limit: params.limit || 50,
    offset: params.offset || 0,
  });
}

export async function getUpcomingAppointments(days = 7) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  return Appointment.findAll({
    where: {
      scheduled_at: { [Op.gte]: now, [Op.lte]: future },
      status: 'scheduled',
    },
    include: [
      { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'company'] },
      { model: AdminUser, as: 'adminUser', attributes: ['id', 'email'] },
    ],
    order: [['scheduled_at', 'ASC']],
  });
}

export async function updateAppointment(id: string, updates: Record<string, any>) {
  const appointment = await Appointment.findByPk(id);
  if (!appointment) return null;

  const allowedFields = ['title', 'description', 'scheduled_at', 'duration_minutes', 'type', 'status', 'outcome_notes'];
  const filtered: Record<string, any> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filtered[key] = key === 'scheduled_at' ? new Date(updates[key]) : updates[key];
    }
  }
  filtered.updated_at = new Date();

  await appointment.update(filtered);
  return appointment.reload({
    include: [
      { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'company'] },
      { model: AdminUser, as: 'adminUser', attributes: ['id', 'email'] },
    ],
  });
}

export async function getAppointmentById(id: string) {
  return Appointment.findByPk(id, {
    include: [
      { model: Lead, as: 'lead', attributes: ['id', 'name', 'email', 'company'] },
      { model: AdminUser, as: 'adminUser', attributes: ['id', 'email'] },
    ],
  });
}
