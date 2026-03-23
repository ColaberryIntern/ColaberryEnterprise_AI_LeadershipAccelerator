import { Request, Response, NextFunction } from 'express';
import {
  createAppointment,
  listAppointments,
  getUpcomingAppointments,
  updateAppointment,
  getAppointmentById,
} from '../services/appointmentService';
import { logActivity } from '../services/activityService';

export async function handleListAppointments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leadId = req.query.leadId ? parseInt(req.query.leadId as string, 10) : undefined;
    const { from, to, status } = req.query;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const page = parseInt(req.query.page as string, 10) || 1;
    const offset = (page - 1) * limit;

    const { rows: appointments, count: total } = await listAppointments({
      leadId,
      from: from as string,
      to: to as string,
      status: status as string,
      limit,
      offset,
    });

    res.json({ appointments, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
}

export async function handleGetUpcomingAppointments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const days = parseInt(req.query.days as string, 10) || 7;
    const appointments = await getUpcomingAppointments(days);

    // Also include upcoming strategy calls (separate table)
    const { QueryTypes } = require('sequelize');
    const { sequelize } = require('../config/database');
    const strategyCalls = await sequelize.query(`
      SELECT sc.id, sc.name, sc.scheduled_at, sc.meet_link, sc.status, sc.lead_id,
        l.name as lead_name, l.email as lead_email, l.company as lead_company
      FROM strategy_calls sc
      LEFT JOIN leads l ON l.id = sc.lead_id
      WHERE sc.status = 'scheduled'
        AND sc.scheduled_at > NOW()
        AND sc.scheduled_at < NOW() + INTERVAL '${days} days'
      ORDER BY sc.scheduled_at ASC
    `, { type: QueryTypes.SELECT });

    const mapped = (strategyCalls as any[]).map((sc: any) => ({
      id: sc.id,
      title: 'Strategy Call',
      description: sc.meet_link ? `Meet link: ${sc.meet_link}` : undefined,
      scheduled_at: sc.scheduled_at,
      duration_minutes: 30,
      type: 'Strategy Call',
      status: sc.status,
      lead: sc.lead_id ? { id: sc.lead_id, name: sc.lead_name || sc.name, email: sc.lead_email, company: sc.lead_company } : null,
    }));

    const all = [...appointments, ...mapped].sort((a: any, b: any) =>
      new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
    );
    res.json({ appointments: all });
  } catch (error) {
    next(error);
  }
}

export async function handleCreateAppointment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { lead_id, title, description, scheduled_at, duration_minutes, type } = req.body;

    if (!lead_id || !title || !scheduled_at || !type) {
      res.status(400).json({ error: 'lead_id, title, scheduled_at, and type are required' });
      return;
    }

    const adminUserId = req.admin?.sub || undefined;

    const appointment = await createAppointment({
      lead_id,
      admin_user_id: adminUserId,
      title,
      description,
      scheduled_at,
      duration_minutes,
      type,
    });

    // Log activity for the lead
    await logActivity({
      lead_id,
      admin_user_id: adminUserId,
      type: 'meeting',
      subject: `Appointment scheduled: ${title}`,
      metadata: { appointment_id: appointment.id, appointment_type: type, scheduled_at },
    });

    const full = await getAppointmentById(appointment.id);
    res.status(201).json({ appointment: full });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateAppointment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const appointment = await updateAppointment(id, req.body);

    if (!appointment) {
      res.status(404).json({ error: 'Appointment not found' });
      return;
    }

    // Log status changes as activity
    if (req.body.status && ['completed', 'cancelled', 'no_show'].includes(req.body.status as string)) {
      const adminUserId = req.admin?.sub || undefined;
      await logActivity({
        lead_id: appointment.lead_id,
        admin_user_id: adminUserId,
        type: 'meeting',
        subject: `Appointment ${req.body.status}: ${appointment.title}`,
        metadata: {
          appointment_id: appointment.id,
          new_status: req.body.status,
          outcome_notes: req.body.outcome_notes || '',
        },
      });
    }

    res.json({ appointment });
  } catch (error) {
    next(error);
  }
}
