import { env } from '../config/env';
import { AutomationLog, FollowUpSequence, Campaign, ScheduledEmail } from '../models';
import { triggerVoiceCall } from './synthflowService';
import { sendEnrollmentConfirmation, sendInterestEmail, sendExecutiveOverviewEmail, sendHighIntentAlert } from './emailService';
import { enrollLeadInSequence } from './sequenceService';
import { advancePipelineStage } from './pipelineService';
import { recordOutcome } from './interactionService';

interface LogParams {
  type: 'email' | 'voice_call' | 'alert';
  related_type: string;
  related_id: string;
  status: 'success' | 'failed';
  provider_response?: string;
}

export async function logAutomation(params: LogParams): Promise<void> {
  try {
    await AutomationLog.create({
      type: params.type,
      related_type: params.related_type,
      related_id: params.related_id,
      status: params.status,
      provider_response: params.provider_response || null,
    } as any);
  } catch (error) {
    console.error('[AutomationLog] Failed to log:', error);
  }
}

interface EnrollmentData {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  cohort: {
    name: string;
    start_date: string;
    core_day: string;
    core_time: string;
    optional_lab_day?: string;
  };
}

export async function runEnrollmentAutomation(enrollment: EnrollmentData): Promise<void> {
  // Email
  if (env.enableAutoEmail) {
    try {
      await sendEnrollmentConfirmation({
        to: enrollment.email,
        fullName: enrollment.full_name,
        cohortName: enrollment.cohort.name,
        startDate: enrollment.cohort.start_date,
        coreDay: enrollment.cohort.core_day,
        coreTime: enrollment.cohort.core_time,
        optionalLabDay: enrollment.cohort.optional_lab_day,
      });
      await logAutomation({
        type: 'email',
        related_type: 'enrollment',
        related_id: enrollment.id,
        status: 'success',
      });
    } catch (error: any) {
      console.error('[Automation] Enrollment email failed:', error.message);
      await logAutomation({
        type: 'email',
        related_type: 'enrollment',
        related_id: enrollment.id,
        status: 'failed',
        provider_response: error.message,
      });
    }
  }

  // Voice call
  if (enrollment.phone) {
    try {
      const result = await triggerVoiceCall({
        name: enrollment.full_name,
        phone: enrollment.phone,
        callType: 'welcome',
      });
      await logAutomation({
        type: 'voice_call',
        related_type: 'enrollment',
        related_id: enrollment.id,
        status: result.success ? 'success' : 'failed',
        provider_response: JSON.stringify(result.data || result.error),
      });
    } catch (error: any) {
      console.error('[Automation] Enrollment voice call failed:', error.message);
      await logAutomation({
        type: 'voice_call',
        related_type: 'enrollment',
        related_id: enrollment.id,
        status: 'failed',
        provider_response: error.message,
      });
    }
  }
}

interface LeadData {
  id: number;
  name: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  company_size?: string;
  lead_score?: number;
  source?: string;
  form_type?: string;
}

export async function runLeadAutomation(lead: LeadData): Promise<void> {
  const relatedId = String(lead.id);
  const isOverviewForm = lead.form_type === 'executive_overview_download';

  // Email — route by form_type
  let initialEmailHtml = '';
  if (env.enableAutoEmail) {
    try {
      if (isOverviewForm) {
        initialEmailHtml = await sendExecutiveOverviewEmail({ to: lead.email, fullName: lead.name });
      } else {
        initialEmailHtml = await sendInterestEmail({ to: lead.email, fullName: lead.name });
      }
      await logAutomation({
        type: 'email',
        related_type: 'lead',
        related_id: relatedId,
        status: 'success',
      });
      // Auto-advance pipeline: new_lead → contacted
      advancePipelineStage(lead.id, 'contacted', 'initial_email_sent').catch((err) =>
        console.error('[Automation] Pipeline advance failed:', err.message)
      );
      // Record sent outcome for temperature classification
      recordOutcome({
        lead_id: lead.id,
        channel: 'email',
        step_index: 0,
        outcome: 'sent',
        metadata: { form_type: lead.form_type, day0: true },
      }).catch((err) => console.error('[Automation] sent outcome failed:', err.message));
    } catch (error: any) {
      console.error('[Automation] Lead email failed:', error.message);
      await logAutomation({
        type: 'email',
        related_type: 'lead',
        related_id: relatedId,
        status: 'failed',
        provider_response: error.message,
      });
    }
  }

  // Voice call — use form-specific flag for overview form
  const shouldCall = isOverviewForm
    ? env.enableVoiceCallForOverview && lead.phone
    : env.enableVoiceCalls && lead.phone;

  if (shouldCall && lead.phone) {
    try {
      const result = await triggerVoiceCall({
        name: lead.name,
        phone: lead.phone,
        callType: 'interest',
      });
      await logAutomation({
        type: 'voice_call',
        related_type: 'lead',
        related_id: relatedId,
        status: result.success ? 'success' : 'failed',
        provider_response: JSON.stringify(result.data || result.error),
      });
      if (result.success) {
        // Auto-advance pipeline: new_lead → contacted
        advancePipelineStage(lead.id, 'contacted', 'initial_voice_call').catch((err) =>
          console.error('[Automation] Pipeline advance failed:', err.message)
        );
      }
    } catch (error: any) {
      console.error('[Automation] Lead voice call failed:', error.message);
      await logAutomation({
        type: 'voice_call',
        related_type: 'lead',
        related_id: relatedId,
        status: 'failed',
        provider_response: error.message,
      });
    }
  }

  // High-intent alert — send internal notification if score > 60
  if (env.enableHighIntentAlert && lead.lead_score && lead.lead_score > 60) {
    try {
      await sendHighIntentAlert({
        name: lead.name,
        company: lead.company || '',
        title: lead.title || '',
        email: lead.email,
        phone: lead.phone || '',
        score: lead.lead_score,
        source: lead.form_type || lead.source || '',
      });
      await logAutomation({
        type: 'alert',
        related_type: 'lead',
        related_id: relatedId,
        status: 'success',
      });
    } catch (error: any) {
      console.error('[Automation] High-intent alert failed:', error.message);
      await logAutomation({
        type: 'alert',
        related_type: 'lead',
        related_id: relatedId,
        status: 'failed',
        provider_response: error.message,
      });
    }
  }

  // Auto-enroll in form-specific campaign sequence
  if (env.enableFollowUpScheduler) {
    try {
      const sequenceName = isOverviewForm
        ? 'Executive Briefing Interest'
        : 'New Lead Nurture Campaign';

      const targetSequence = await FollowUpSequence.findOne({
        where: { name: sequenceName, is_active: true },
      });
      if (targetSequence) {
        const associatedCampaign = await Campaign.findOne({
          where: { sequence_id: targetSequence.id, status: 'active' },
        });
        const actions = await enrollLeadInSequence(lead.id, targetSequence.id, associatedCampaign?.id);
        console.log(`[Automation] Lead enrolled in ${sequenceName}:`, lead.email);

        // Mark Step 0 (Day 0 initial email) as sent with captured HTML
        const step0 = actions.find((a: any) => a.step_index === 0);
        if (step0 && initialEmailHtml) {
          await step0.update({
            status: 'sent',
            sent_at: new Date(),
            attempts_made: 1,
            body: initialEmailHtml,
          } as any);
          console.log(`[Automation] Marked Step 0 as sent for lead ${lead.id}`);
        }
      }
    } catch (error: any) {
      console.error('[Automation] Sequence enrollment failed:', error.message);
    }
  }
}

export async function getAutomationHistory(relatedType: string, relatedId: string) {
  return AutomationLog.findAll({
    where: { related_type: relatedType, related_id: relatedId },
    order: [['created_at', 'DESC']],
  });
}
