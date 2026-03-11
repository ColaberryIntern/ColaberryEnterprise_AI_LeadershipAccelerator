import { env } from '../config/env';
import { AutomationLog, FollowUpSequence, Campaign, ScheduledEmail, Lead } from '../models';
import { triggerVoiceCall } from './synthflowService';
import { sendEnrollmentConfirmation, sendInterestEmail, sendExecutiveOverviewEmail, sendHighIntentAlert } from './emailService';
import { enrollLeadInSequence } from './sequenceService';
import { advancePipelineStage } from './pipelineService';
import { recordOutcome, recordActionOutcome } from './interactionService';
import { syncLeadToGhl } from './ghlService';
import { getSetting } from './settingsService';
import { buildConversationHistory, generateMessage } from './aiMessageService';

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

  // Voice call — dynamic prompt with enrollment context
  if (enrollment.phone) {
    try {
      const voicePrompt = await generateMessage({
        channel: 'voice',
        ai_instructions: `You are calling a new student who just enrolled in "${enrollment.cohort.name}". Welcome them warmly, confirm their enrollment details, and ask if they have any questions about the program. Mention their start date is ${enrollment.cohort.start_date}, classes are on ${enrollment.cohort.core_day} at ${enrollment.cohort.core_time}.`,
        lead: { name: enrollment.full_name, phone: enrollment.phone },
      });

      const result = await triggerVoiceCall({
        name: enrollment.full_name,
        phone: enrollment.phone,
        callType: 'welcome',
        prompt: voicePrompt.body,
        context: {
          lead_name: enrollment.full_name,
          lead_email: enrollment.email,
          cohort_name: enrollment.cohort.name,
          cohort_start_date: enrollment.cohort.start_date,
          step_goal: 'Welcome new enrollment, confirm details, answer questions',
        },
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
      // Build dynamic prompt with lead context and conversation history
      const conversationHistory = await buildConversationHistory(lead.id);
      const voicePrompt = await generateMessage({
        channel: 'voice',
        ai_instructions: isOverviewForm
          ? `You are following up with an executive who downloaded our AI Leadership Overview. Explore their interest in AI strategy for their organization, understand their current challenges, and gauge interest in the Executive AI Briefing program.`
          : `You are calling a new lead who expressed interest in AI & Data Analytics training. Introduce Colaberry's program, understand their career goals, and explore whether the program is a fit. Ask about their current role and what drew them to AI/data analytics.`,
        lead: {
          name: lead.name,
          company: lead.company,
          title: lead.title,
          email: lead.email,
          phone: lead.phone,
          interest_area: undefined,
        },
        conversationHistory,
      });

      const result = await triggerVoiceCall({
        name: lead.name,
        phone: lead.phone,
        callType: 'interest',
        prompt: voicePrompt.body,
        context: {
          lead_name: lead.name,
          lead_company: lead.company,
          lead_title: lead.title,
          lead_email: lead.email,
          lead_score: lead.lead_score,
          conversation_history: conversationHistory,
          step_goal: isOverviewForm
            ? 'Explore executive AI interest, qualify for briefing program'
            : 'Introduce program, understand career goals, qualify interest',
        },
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

        // Sync to GHL with campaign interest group
        if (associatedCampaign?.interest_group) {
          try {
            const ghlEnabled = await getSetting('ghl_enabled');
            if (ghlEnabled) {
              const leadRecord = await Lead.findByPk(lead.id);
              if (leadRecord) {
                const syncResult = await syncLeadToGhl(leadRecord, associatedCampaign.interest_group);
                if (syncResult.contactId && !syncResult.isTestMode && !leadRecord.ghl_contact_id) {
                  await leadRecord.update({ ghl_contact_id: syncResult.contactId });
                }
              }
            }
          } catch (ghlErr: any) {
            console.error(`[Automation] GHL interest group sync failed for lead ${lead.id}: ${ghlErr.message}`);
          }
        }

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

          // Record the interaction so CampaignLead tracking updates
          // (last_activity_at, touchpoint_count, current_step_index, next_action_at)
          await recordActionOutcome(step0, 'sent').catch((err: any) =>
            console.error(`[Automation] recordActionOutcome failed for lead ${lead.id}:`, err.message)
          );
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
