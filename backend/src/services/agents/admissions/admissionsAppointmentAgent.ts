import { Lead } from '../../../models';
import AdmissionsActionLog from '../../../models/AdmissionsActionLog';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { getAvailableSlots, createBooking } from '../../calendarService';
import { createAppointment } from '../../appointmentService';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsAppointmentSchedulingAgent';

/**
 * Schedule admissions/strategy calls via Google Calendar + Appointment model.
 * Trigger: on_demand.
 */
export async function runAdmissionsAppointmentAgent(
  agentId: string,
  config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const { visitor_id, slot_start, timezone = 'America/Chicago', appointment_type = 'strategy_call' } = config;

    if (!visitor_id) {
      errors.push('visitor_id is required');
      return buildResult(actions, errors, startTime);
    }

    // Resolve lead
    const memory = await AdmissionsMemory.findOne({ where: { visitor_id } });
    if (!memory?.lead_id) {
      errors.push('No lead record found — cannot schedule appointment');
      return buildResult(actions, errors, startTime);
    }

    const lead = await Lead.findByPk(memory.lead_id);
    if (!lead) {
      errors.push('Lead record not found');
      return buildResult(actions, errors, startTime);
    }

    // If no slot specified, return available slots
    if (!slot_start) {
      const availability = await getAvailableSlots(7);
      actions.push({
        campaign_id: '',
        action: 'slots_retrieved',
        reason: `Retrieved available slots for visitor ${visitor_id}`,
        confidence: 0.9,
        before_state: null,
        after_state: { available_dates: availability.dates.length, timezone: availability.timezone },
        result: 'success',
        entity_type: 'visitor',
        entity_id: visitor_id,
      });
      return buildResult(actions, errors, startTime);
    }

    // Create booking via Google Calendar
    const booking = await createBooking({
      name: lead.getDataValue('name') || 'Prospect',
      email: lead.getDataValue('email') || '',
      company: lead.getDataValue('company') || '',
      phone: (lead as any).phone || '',
      slotStart: slot_start,
      timezone,
    });

    // Create Appointment record
    await createAppointment({
      lead_id: memory.lead_id,
      title: `Admissions ${appointment_type.replace(/_/g, ' ')}`,
      description: `Scheduled via Maya chat. Meet link: ${booking.meetLink}`,
      scheduled_at: booking.startTime,
      duration_minutes: 30,
      type: appointment_type,
    });

    await AdmissionsActionLog.create({
      visitor_id,
      conversation_id: config.conversation_id || null,
      action_type: 'schedule_call',
      action_details: {
        appointment_type,
        start_time: booking.startTime,
        meet_link: booking.meetLink,
        event_id: booking.eventId,
      },
      status: 'completed',
      agent_name: AGENT_NAME,
    });

    actions.push({
      campaign_id: '',
      action: 'appointment_scheduled',
      reason: `Scheduled ${appointment_type} for visitor ${visitor_id} at ${booking.startTime}`,
      confidence: 0.95,
      before_state: { appointment_type },
      after_state: {
        start_time: booking.startTime,
        meet_link: booking.meetLink,
        event_id: booking.eventId,
      },
      result: 'success',
      entity_type: 'visitor',
      entity_id: visitor_id,
    });

    await logAgentActivity({
      agent_id: agentId,
      action: 'appointment_scheduling',
      result: 'success',
      details: { visitor_id, appointment_type, start_time: booking.startTime },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return buildResult(actions, errors, startTime);
}

function buildResult(actions: AgentAction[], errors: string[], startTime: number): AgentExecutionResult {
  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: actions.length,
  };
}
