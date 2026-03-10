import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import {
  Campaign,
  FollowUpSequence,
  Lead,
  CampaignSimulation,
  CampaignSimulationStep,
} from '../../models';
import { createTestLead } from './testLeadGenerator';
import { getTestOverrides } from '../settingsService';
import { generateMessage } from '../aiMessageService';
import { sendSmsViaGhl, syncLeadToGhl } from '../ghlService';
import { triggerVoiceCall } from '../synthflowService';
import { getSetting } from '../settingsService';
import { env } from '../../config/env';
import { logCommunication } from '../communicationLogService';
import type { SpeedMode } from './timeWarpEngine';
import { calculateCompressedDelay } from './timeWarpEngine';
import type { SequenceStep } from '../../models/FollowUpSequence';

/* ------------------------------------------------------------------ */
/*  In-memory timer registry                                          */
/* ------------------------------------------------------------------ */
const activeTimers = new Map<string, NodeJS.Timeout>();
const MAX_CONCURRENT = 3;

/* ------------------------------------------------------------------ */
/*  SMTP transporter (same pattern as schedulerService)               */
/* ------------------------------------------------------------------ */
let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter && env.smtpUser && env.smtpPass) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
  }
  return transporter;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------------------------------------------ */
/*  Start simulation                                                  */
/* ------------------------------------------------------------------ */
export async function startSimulation(
  campaignId: string,
  speedMode: SpeedMode
): Promise<InstanceType<typeof CampaignSimulation>> {
  // Enforce concurrency limit
  const running = await CampaignSimulation.count({
    where: { status: 'running' },
  });
  if (running >= MAX_CONCURRENT) {
    throw new Error(`Maximum ${MAX_CONCURRENT} concurrent simulations allowed. Cancel or wait for existing ones.`);
  }

  // Load campaign + sequence
  const campaign: any = await Campaign.findByPk(campaignId, {
    include: [{ model: FollowUpSequence, as: 'sequence' }],
  });
  if (!campaign) throw new Error('Campaign not found');
  if (!campaign.sequence) throw new Error('Campaign has no follow-up sequence');

  const steps: SequenceStep[] = campaign.sequence.steps || [];
  if (steps.length === 0) throw new Error('Sequence has no steps');

  // Create or reuse test lead
  const testLead = await createTestLead(campaignId);

  // Create simulation record
  const simulation = await CampaignSimulation.create({
    id: uuidv4(),
    campaign_id: campaignId,
    sequence_id: campaign.sequence.id,
    test_lead_id: testLead.id,
    speed_mode: speedMode,
    status: 'running',
    current_step_index: 0,
    total_steps: steps.length,
    started_at: new Date(),
  });

  // Pre-create all step records
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    await CampaignSimulationStep.create({
      id: uuidv4(),
      simulation_id: simulation.id,
      step_index: i,
      channel: step.channel || 'email',
      status: 'pending',
      original_delay_days: step.delay_days || 0,
      compressed_delay_ms: calculateCompressedDelay(step.delay_days || 0, speedMode),
    });
  }

  // Begin execution of step 0
  scheduleStep(simulation.id, 0);

  return simulation;
}

/* ------------------------------------------------------------------ */
/*  Schedule a step (handles delay)                                   */
/* ------------------------------------------------------------------ */
function scheduleStep(simulationId: string, stepIndex: number) {
  // Fire async — look up the step's compressed delay
  (async () => {
    const step = await CampaignSimulationStep.findOne({
      where: { simulation_id: simulationId, step_index: stepIndex },
    });
    if (!step) return;

    const sim = await CampaignSimulation.findByPk(simulationId);
    if (!sim || sim.status !== 'running') return;

    const delay = step.compressed_delay_ms;

    if (delay <= 0) {
      // Execute immediately (instant mode or first step with 0 delay)
      await executeSimulationStep(simulationId, stepIndex);
    } else {
      // Mark step as waiting
      await step.update({ status: 'waiting', wait_started_at: new Date() } as any);
      await sim.update({ current_step_index: stepIndex } as any);

      const timer = setTimeout(async () => {
        activeTimers.delete(simulationId);
        try {
          await executeSimulationStep(simulationId, stepIndex);
        } catch (err: any) {
          console.error(`[Simulator] Error executing step ${stepIndex}:`, err.message);
        }
      }, delay);

      activeTimers.set(simulationId, timer);
    }
  })().catch((err) => {
    console.error(`[Simulator] scheduleStep error:`, err.message);
  });
}

/* ------------------------------------------------------------------ */
/*  Execute a single simulation step                                  */
/* ------------------------------------------------------------------ */
export async function executeSimulationStep(
  simulationId: string,
  stepIndex: number
): Promise<void> {
  const sim: any = await CampaignSimulation.findByPk(simulationId, {
    include: [{ model: FollowUpSequence, as: 'sequence' }],
  });
  if (!sim || sim.status !== 'running') return;

  const simStep = await CampaignSimulationStep.findOne({
    where: { simulation_id: simulationId, step_index: stepIndex },
  });
  if (!simStep) return;

  const sequenceSteps: SequenceStep[] = sim.sequence?.steps || [];
  const stepDef = sequenceSteps[stepIndex];
  if (!stepDef) {
    await simStep.update({ status: 'failed', error_message: 'Step definition not found' } as any);
    return;
  }

  const lead: any = await Lead.findByPk(sim.test_lead_id);
  if (!lead) {
    await simStep.update({ status: 'failed', error_message: 'Test lead not found' } as any);
    return;
  }

  await simStep.update({ status: 'executing' } as any);
  await sim.update({ current_step_index: stepIndex } as any);

  const startTime = Date.now();

  try {
    const testOverrides = await getTestOverrides();

    // Generate AI content
    const aiResult = await generateMessage({
      channel: (stepDef.channel || 'email') as 'email' | 'sms' | 'voice',
      ai_instructions: stepDef.ai_instructions || stepDef.body_template || 'Write a professional outreach message.',
      lead: {
        name: lead.name,
        company: lead.company,
        title: lead.title,
        industry: lead.industry,
        email: lead.email,
        phone: lead.phone,
        interest_area: lead.interest_area,
        lead_temperature: lead.lead_temperature,
        pipeline_stage: lead.pipeline_stage,
      },
      campaignContext: {
        name: sim.sequence?.name || 'Campaign',
        step_goal: stepDef.step_goal,
        step_number: stepIndex + 1,
        total_steps: sim.total_steps,
      },
      tone: stepDef.ai_tone,
      context_notes: stepDef.ai_context_notes,
    });

    await simStep.update({
      ai_content: {
        subject: aiResult.subject,
        body: aiResult.body,
        tokens_used: aiResult.tokens_used,
        model: aiResult.model,
      },
    } as any);

    // Execute channel delivery
    const channel = stepDef.channel || 'email';
    let deliveryDetails: Record<string, any> = {};

    if (channel === 'email') {
      const mailer = getTransporter();
      if (mailer) {
        const targetEmail = testOverrides.enabled && testOverrides.email
          ? testOverrides.email
          : lead.email;
        const subject = aiResult.subject || `[Simulation] Step ${stepIndex + 1}`;
        const info = await mailer.sendMail({
          from: `"Colaberry Simulator" <${env.emailFrom}>`,
          replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
          to: targetEmail,
          subject: `[SIM] ${subject}`,
          html: aiResult.body,
          text: stripHtml(aiResult.body),
          headers: { 'X-MC-Tags': 'campaign-simulation' },
        });
        deliveryDetails = {
          to: targetEmail,
          subject,
          messageId: info.messageId,
          accepted: info.accepted,
        };
      } else {
        deliveryDetails = { skipped: true, reason: 'SMTP not configured' };
      }
    } else if (channel === 'sms') {
      const targetPhone = testOverrides.enabled && testOverrides.phone
        ? testOverrides.phone
        : lead.phone;
      if (targetPhone) {
        // Ensure lead has a GHL contact ID (same pattern as campaignService.ts)
        const ghlEnabled = await getSetting('ghl_enabled');
        if (ghlEnabled && !lead.ghl_contact_id) {
          try {
            const syncResult = await syncLeadToGhl(lead);
            if (syncResult.contactId && !syncResult.isTestMode) {
              await lead.update({ ghl_contact_id: syncResult.contactId });
              await lead.reload();
            }
          } catch (syncErr: any) {
            console.warn(`[Simulator] GHL sync failed for test lead: ${syncErr.message}`);
          }
        }

        if (ghlEnabled && lead.ghl_contact_id) {
          // Use GHL contact ID — same as production scheduler
          const smsResult = await sendSmsViaGhl(lead.ghl_contact_id, aiResult.body);
          deliveryDetails = {
            to: targetPhone,
            ghl_contact_id: lead.ghl_contact_id,
            delivery_mode: testOverrides.enabled ? 'test_redirect' : 'live',
            provider: 'ghl',
            result: smsResult,
          };
        } else {
          // GHL not available — log as simulated
          deliveryDetails = {
            simulated: true,
            to: targetPhone,
            delivery_mode: 'simulated',
            provider: 'ghl',
            reason: !ghlEnabled ? 'GHL not enabled' : 'No GHL contact ID',
            message_preview: aiResult.body.substring(0, 200),
          };
        }
      } else {
        deliveryDetails = { skipped: true, reason: 'No phone number' };
      }
    } else if (channel === 'voice') {
      const targetPhone = testOverrides.enabled && testOverrides.phone
        ? testOverrides.phone
        : lead.phone;
      if (targetPhone) {
        const voiceResult = await triggerVoiceCall({
          name: lead.name,
          phone: targetPhone,
          callType: stepDef.voice_agent_type || 'interest',
          prompt: stepDef.voice_prompt || aiResult.body,
          context: {
            lead_name: lead.name,
            lead_company: lead.company,
            lead_title: lead.title,
            lead_email: lead.email,
            step_goal: stepDef.step_goal,
          },
        });

        // Detect skipped voice calls (disabled, no API key, no agent ID)
        if (voiceResult.data?.skipped) {
          deliveryDetails = {
            skipped: true,
            reason: voiceResult.data.reason || 'Voice call skipped',
            delivery_mode: 'simulated',
            provider: 'synthflow',
          };
        } else {
          deliveryDetails = {
            to: targetPhone,
            delivery_mode: testOverrides.enabled ? 'test_redirect' : 'live',
            provider: 'synthflow',
            call_id: voiceResult.data?.call_id || voiceResult.data?.id || null,
            result: voiceResult,
          };
        }
      } else {
        deliveryDetails = { skipped: true, reason: 'No phone number' };
      }
    }

    const durationMs = Date.now() - startTime;

    // Determine final step status based on delivery outcome
    const wasSkipped = deliveryDetails.skipped === true;
    const stepStatus = wasSkipped ? 'skipped' : 'sent';

    await simStep.update({
      status: stepStatus,
      executed_at: new Date(),
      duration_ms: durationMs,
      details: deliveryDetails,
    } as any);

    // Log to unified communication log
    logCommunication({
      lead_id: sim.test_lead_id,
      campaign_id: sim.campaign_id,
      simulation_id: simulationId,
      simulation_step_id: simStep.id,
      channel,
      direction: 'outbound',
      delivery_mode: deliveryDetails.delivery_mode || (deliveryDetails.simulated ? 'simulated' : deliveryDetails.skipped ? 'simulated' : 'live'),
      status: stepStatus === 'skipped' ? 'skipped' : (deliveryDetails.simulated ? 'simulated' : 'sent'),
      to_address: deliveryDetails.to || null,
      from_address: channel === 'email' ? env.emailFrom : null,
      subject: aiResult.subject || null,
      body: aiResult.body,
      provider: deliveryDetails.provider || (channel === 'email' ? 'smtp' : null),
      provider_message_id: deliveryDetails.messageId || deliveryDetails.call_id || null,
      provider_response: deliveryDetails.result || null,
      error_message: null,
      metadata: { step_index: stepIndex, speed_mode: sim.speed_mode },
    }).catch((err: any) => console.warn('[Simulator] Comm log failed:', err.message));

    console.log(`[Simulator] Step ${stepIndex} (${channel}) completed in ${durationMs}ms for simulation ${simulationId}`);

    // If instant mode, don't auto-advance — wait for manual trigger
    if (sim.speed_mode === 'instant') return;

    // Schedule next step
    if (stepIndex + 1 < sim.total_steps) {
      scheduleStep(simulationId, stepIndex + 1);
    } else {
      await finalizeSimulation(simulationId);
    }
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    await simStep.update({
      status: 'failed',
      executed_at: new Date(),
      duration_ms: durationMs,
      error_message: err.message,
    } as any);
    console.error(`[Simulator] Step ${stepIndex} failed:`, err.message);

    // Continue to next step even on failure (don't block the whole sim)
    if (sim.speed_mode !== 'instant' && stepIndex + 1 < sim.total_steps) {
      scheduleStep(simulationId, stepIndex + 1);
    } else if (stepIndex + 1 >= sim.total_steps) {
      await finalizeSimulation(simulationId);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Finalize simulation                                               */
/* ------------------------------------------------------------------ */
async function finalizeSimulation(simulationId: string): Promise<void> {
  const sim = await CampaignSimulation.findByPk(simulationId);
  if (!sim) return;

  const steps = await CampaignSimulationStep.findAll({
    where: { simulation_id: simulationId },
    order: [['step_index', 'ASC']],
  });

  const channels = new Set(steps.map((s: any) => s.channel));
  const passed = steps.filter((s: any) => s.status === 'sent' || s.status === 'responded').length;
  const failed = steps.filter((s: any) => s.status === 'failed').length;
  const totalDuration = steps.reduce((sum: number, s: any) => sum + (s.duration_ms || 0), 0);
  const totalTokens = steps.reduce((sum: number, s: any) => {
    return sum + (s.ai_content?.tokens_used || 0);
  }, 0);

  await sim.update({
    status: 'completed',
    completed_at: new Date(),
    current_step_index: sim.total_steps,
    summary: {
      channels_used: Array.from(channels),
      steps_passed: passed,
      steps_failed: failed,
      steps_skipped: steps.filter((s: any) => s.status === 'skipped').length,
      total_duration_ms: totalDuration,
      ai_tokens_used: totalTokens,
    },
  } as any);

  activeTimers.delete(simulationId);
  console.log(`[Simulator] Simulation ${simulationId} completed: ${passed} passed, ${failed} failed`);
}

/* ------------------------------------------------------------------ */
/*  Pause / Resume                                                    */
/* ------------------------------------------------------------------ */
export async function pauseSimulation(simulationId: string): Promise<void> {
  const sim = await CampaignSimulation.findByPk(simulationId);
  if (!sim || sim.status !== 'running') throw new Error('Simulation is not running');

  const timer = activeTimers.get(simulationId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(simulationId);
  }

  await sim.update({ status: 'paused', paused_at: new Date() } as any);
}

export async function resumeSimulation(simulationId: string): Promise<void> {
  const sim = await CampaignSimulation.findByPk(simulationId);
  if (!sim || sim.status !== 'paused') throw new Error('Simulation is not paused');

  await sim.update({ status: 'running', paused_at: null } as any);

  // Find current step — if it's waiting, resume its timer
  const currentStep = await CampaignSimulationStep.findOne({
    where: { simulation_id: simulationId, step_index: sim.current_step_index },
  });

  if (currentStep && currentStep.status === 'waiting' && currentStep.wait_started_at) {
    // Calculate remaining delay
    const elapsed = Date.now() - new Date(currentStep.wait_started_at).getTime();
    const remaining = Math.max(0, currentStep.compressed_delay_ms - elapsed);

    if (remaining <= 0) {
      await executeSimulationStep(simulationId, sim.current_step_index);
    } else {
      const timer = setTimeout(async () => {
        activeTimers.delete(simulationId);
        try {
          await executeSimulationStep(simulationId, sim.current_step_index);
        } catch (err: any) {
          console.error(`[Simulator] Resume execute error:`, err.message);
        }
      }, remaining);
      activeTimers.set(simulationId, timer);
    }
  } else if (currentStep && (currentStep.status === 'sent' || currentStep.status === 'responded' || currentStep.status === 'failed' || currentStep.status === 'skipped')) {
    // Current step already done, schedule next
    const nextIndex = sim.current_step_index + 1;
    if (nextIndex < sim.total_steps) {
      scheduleStep(simulationId, nextIndex);
    } else {
      await finalizeSimulation(simulationId);
    }
  } else {
    // Re-schedule current step
    scheduleStep(simulationId, sim.current_step_index);
  }
}

/* ------------------------------------------------------------------ */
/*  Skip step                                                         */
/* ------------------------------------------------------------------ */
export async function skipStep(simulationId: string): Promise<void> {
  const sim = await CampaignSimulation.findByPk(simulationId);
  if (!sim || (sim.status !== 'running' && sim.status !== 'paused')) {
    throw new Error('Simulation is not active');
  }

  // Clear any active timer
  const timer = activeTimers.get(simulationId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(simulationId);
  }

  const currentStep = await CampaignSimulationStep.findOne({
    where: { simulation_id: simulationId, step_index: sim.current_step_index },
  });
  if (currentStep && (currentStep.status === 'pending' || currentStep.status === 'waiting')) {
    await currentStep.update({ status: 'skipped', executed_at: new Date() } as any);
  }

  // Ensure sim is running for next step
  if (sim.status === 'paused') {
    await sim.update({ status: 'running', paused_at: null } as any);
  }

  const nextIndex = sim.current_step_index + 1;
  if (nextIndex < sim.total_steps) {
    await sim.update({ current_step_index: nextIndex } as any);
    scheduleStep(simulationId, nextIndex);
  } else {
    await finalizeSimulation(simulationId);
  }
}

/* ------------------------------------------------------------------ */
/*  Jump to step                                                      */
/* ------------------------------------------------------------------ */
export async function jumpToStep(simulationId: string, targetIndex: number): Promise<void> {
  const sim = await CampaignSimulation.findByPk(simulationId);
  if (!sim || (sim.status !== 'running' && sim.status !== 'paused')) {
    throw new Error('Simulation is not active');
  }
  if (targetIndex < 0 || targetIndex >= sim.total_steps) {
    throw new Error(`Invalid step index: ${targetIndex}`);
  }

  // Clear timer
  const timer = activeTimers.get(simulationId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(simulationId);
  }

  // Skip all intermediate steps
  const stepsToSkip = await CampaignSimulationStep.findAll({
    where: { simulation_id: simulationId },
  });
  for (const step of stepsToSkip) {
    const s = step as any;
    if (s.step_index >= sim.current_step_index && s.step_index < targetIndex) {
      if (s.status === 'pending' || s.status === 'waiting') {
        await step.update({ status: 'skipped', executed_at: new Date() } as any);
      }
    }
  }

  await sim.update({
    status: 'running',
    paused_at: null,
    current_step_index: targetIndex,
  } as any);

  // Execute target step immediately (no delay)
  await executeSimulationStep(simulationId, targetIndex);
}

/* ------------------------------------------------------------------ */
/*  Respond as lead                                                   */
/* ------------------------------------------------------------------ */
export async function respondAsLead(
  simulationId: string,
  outcome: string,
  responseText?: string
): Promise<void> {
  const sim = await CampaignSimulation.findByPk(simulationId);
  if (!sim) throw new Error('Simulation not found');

  const currentStep = await CampaignSimulationStep.findOne({
    where: { simulation_id: simulationId, step_index: sim.current_step_index },
  });
  if (!currentStep || currentStep.status !== 'sent') {
    throw new Error('Current step has not been sent yet');
  }

  await currentStep.update({
    status: 'responded',
    lead_response: {
      outcome,
      response_text: responseText || null,
      responded_at: new Date().toISOString(),
    },
  } as any);

  // In instant mode, don't auto-advance
  if (sim.speed_mode === 'instant') return;

  // Auto-advance to next step
  const nextIndex = sim.current_step_index + 1;
  if (nextIndex < sim.total_steps) {
    scheduleStep(simulationId, nextIndex);
  } else {
    await finalizeSimulation(simulationId);
  }
}

/* ------------------------------------------------------------------ */
/*  Advance (instant mode only)                                       */
/* ------------------------------------------------------------------ */
export async function advanceStep(simulationId: string): Promise<void> {
  const sim = await CampaignSimulation.findByPk(simulationId);
  if (!sim || sim.status !== 'running') throw new Error('Simulation is not running');

  const currentStep = await CampaignSimulationStep.findOne({
    where: { simulation_id: simulationId, step_index: sim.current_step_index },
  });

  if (!currentStep) throw new Error('No current step found');

  // If step hasn't been executed yet, execute it
  if (currentStep.status === 'pending' || currentStep.status === 'waiting') {
    await executeSimulationStep(simulationId, sim.current_step_index);
    return;
  }

  // If step is done (sent/responded/failed/skipped), move to next
  const nextIndex = sim.current_step_index + 1;
  if (nextIndex < sim.total_steps) {
    await sim.update({ current_step_index: nextIndex } as any);
    await executeSimulationStep(simulationId, nextIndex);
  } else {
    await finalizeSimulation(simulationId);
  }
}

/* ------------------------------------------------------------------ */
/*  Cancel simulation                                                 */
/* ------------------------------------------------------------------ */
export async function cancelSimulation(simulationId: string): Promise<void> {
  const sim = await CampaignSimulation.findByPk(simulationId);
  if (!sim) throw new Error('Simulation not found');

  const timer = activeTimers.get(simulationId);
  if (timer) {
    clearTimeout(timer);
    activeTimers.delete(simulationId);
  }

  await sim.update({ status: 'cancelled', completed_at: new Date() } as any);
}

/* ------------------------------------------------------------------ */
/*  Get simulation state (for polling)                                */
/* ------------------------------------------------------------------ */
export async function getSimulationState(simulationId: string) {
  const sim: any = await CampaignSimulation.findByPk(simulationId, {
    include: [
      { model: CampaignSimulationStep, as: 'steps', order: [['step_index', 'ASC']] } as any,
    ],
  });
  if (!sim) throw new Error('Simulation not found');

  // Also load sequence steps for context
  const sequence: any = await FollowUpSequence.findByPk(sim.sequence_id);
  const sequenceSteps: SequenceStep[] = sequence?.steps || [];

  return {
    id: sim.id,
    campaign_id: sim.campaign_id,
    sequence_id: sim.sequence_id,
    speed_mode: sim.speed_mode,
    status: sim.status,
    current_step_index: sim.current_step_index,
    total_steps: sim.total_steps,
    started_at: sim.started_at,
    paused_at: sim.paused_at,
    completed_at: sim.completed_at,
    summary: sim.summary,
    steps: (sim.steps || []).map((step: any) => ({
      id: step.id,
      step_index: step.step_index,
      channel: step.channel,
      status: step.status,
      original_delay_days: step.original_delay_days,
      compressed_delay_ms: step.compressed_delay_ms,
      wait_started_at: step.wait_started_at,
      executed_at: step.executed_at,
      duration_ms: step.duration_ms,
      ai_content: step.ai_content,
      lead_response: step.lead_response,
      details: step.details,
      error_message: step.error_message,
      // Include sequence step definition for context
      definition: sequenceSteps[step.step_index] || null,
    })),
  };
}

/* ------------------------------------------------------------------ */
/*  Get simulation history for a campaign                             */
/* ------------------------------------------------------------------ */
export async function getSimulationHistory(campaignId: string) {
  const simulations = await CampaignSimulation.findAll({
    where: { campaign_id: campaignId },
    order: [['created_at', 'DESC']],
    limit: 20,
  });
  return simulations;
}
